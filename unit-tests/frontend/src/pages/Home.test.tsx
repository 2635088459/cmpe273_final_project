import { render, screen, waitFor } from "@testing-library/react";
import Home from "./Home";
import {
  listDeletionRequests,
  getDeletionProof,
  verifyProofChain,
  getDeletionNotification,
  getDeletionAttestation,
} from "../services/api";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children }: { children: any }) => <>{children}</>,
  }),
  { virtual: true },
);

jest.mock("../services/api", () => ({
  listDeletionRequests: jest.fn(),
  getDeletionProof: jest.fn(),
  verifyProofChain: jest.fn(),
  getDeletionNotification: jest.fn(),
  getDeletionAttestation: jest.fn(),
}));

describe("Home", () => {
  beforeEach(() => {
    (listDeletionRequests as jest.Mock).mockReset();
    (getDeletionProof as jest.Mock).mockReset();
    (verifyProofChain as jest.Mock).mockReset();
    (getDeletionNotification as jest.Mock).mockReset();
    (getDeletionAttestation as jest.Mock).mockReset();
  });

  it("loads request list and renders selected subject", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({
      items: [
        {
          id: "req-1",
          subject_id: "alice",
          status: "COMPLETED",
          trace_id: "trace-1",
          created_at: "2026-05-09T18:00:00.000Z",
          completed_at: "2026-05-09T18:10:00.000Z",
          steps: [],
        },
      ],
      count: 1,
    });

    (getDeletionProof as jest.Mock).mockResolvedValue({
      request_id: "req-1",
      subject_id: "alice",
      status: "COMPLETED",
      trace_id: "trace-1",
      proof_events: [],
      verification_summary: {
        total_steps: 5,
        succeeded_steps: 5,
        failed_steps: 0,
        services_involved: [],
      },
    });
    (verifyProofChain as jest.Mock).mockResolvedValue({ valid: true, verified: true, request_id: "req-1" });
    (getDeletionNotification as jest.Mock).mockResolvedValue(null);
    (getDeletionAttestation as jest.Mock).mockResolvedValue({
      report_version: "v1",
      generated_at: "2026-05-09T18:11:00.000Z",
      request_id: "req-1",
      subject_id: "alice",
      trace_id: "trace-1",
      request_status: "COMPLETED",
      completed_at: "2026-05-09T18:10:00.000Z",
      total_proof_events: 0,
      cryptographic_verification: { valid: true, verified: true, genesis_hash: "g", last_event_hash: "l" },
      operational_evidence: { required_services: 5, step_statuses: {}, services_summary: {} },
      answer: {
        question: "q",
        can_prove_deleted_across_all_systems: true,
        rationale: "ok",
      },
      signature: {
        algorithm: "Ed25519",
        key_id: "k",
        signature_base64: "s",
        signed_payload_sha256: "d",
      },
      verification_material: { key_id: "k", algorithm: "Ed25519", public_key_pem: "pem" },
    });

    render(<Home />);

    expect(screen.getByText(/request tracking/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(listDeletionRequests).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("shows load error message when request list call fails", async () => {
    (listDeletionRequests as jest.Mock).mockRejectedValueOnce(new Error("down"));

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load deletion requests/i)).toBeInTheDocument();
    });
  });
});
