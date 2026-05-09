import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubmitDeletion from "./SubmitDeletion";
import { createDeletionRequest } from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { defaults: { baseURL: "http://localhost:3001" } },
  API_BASE_URL: "http://localhost:3001",
  createDeletionRequest: jest.fn(),
}));

class MockEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener = jest.fn();
  close = jest.fn();
  constructor(_url: string) {}
}

describe("SubmitDeletion", () => {
  beforeEach(() => {
    (createDeletionRequest as jest.Mock).mockReset();
    (global as any).EventSource = MockEventSource;
  });

  it("shows validation error for empty subject id", async () => {
    render(<SubmitDeletion />);

    await userEvent.click(screen.getByRole("button", { name: /create request/i }));

    expect(screen.getByText(/enter a subject id/i)).toBeInTheDocument();
  });

  it("submits request and displays created request data", async () => {
    (createDeletionRequest as jest.Mock).mockResolvedValueOnce({
      request_id: "req-1",
      status: "PENDING",
      message: "accepted",
      trace_id: "trace-1",
    });

    render(<SubmitDeletion />);

    await userEvent.type(screen.getByLabelText(/subject id/i), "alice");
    await userEvent.click(screen.getByRole("button", { name: /create request/i }));

    await waitFor(() => {
      expect(createDeletionRequest).toHaveBeenCalledWith({ subject_id: "alice" });
    });

    expect(await screen.findByText("req-1")).toBeInTheDocument();
    expect(screen.getByText("trace-1")).toBeInTheDocument();
  });
});
