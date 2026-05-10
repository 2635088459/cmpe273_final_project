import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import History from "./History";
import { listDeletionRequests } from "../services/api";

const mockNavigate = jest.fn();

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
  }),
  { virtual: true },
);

jest.mock("../services/api", () => ({
  listDeletionRequests: jest.fn(),
}));

describe("History", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    (listDeletionRequests as jest.Mock).mockReset();
  });

  it("loads and renders history rows", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          id: "req-1",
          subject_id: "alice",
          status: "COMPLETED",
          trace_id: "tr-1",
          created_at: "2026-05-09T10:00:00.000Z",
          completed_at: "2026-05-09T10:10:00.000Z",
          steps: [{ id: "s1", step_name: "cache", status: "SUCCEEDED", updated_at: "2026-05-09T10:05:00.000Z" }],
        },
      ],
      count: 1,
    });

    render(<History />);

    await waitFor(() => {
      expect(listDeletionRequests).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/all past deletion requests/i)).toBeInTheDocument();
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
  });

  it("navigates to overview when clicking View", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          id: "req-2",
          subject_id: "bob",
          status: "FAILED",
          trace_id: "tr-2",
          created_at: "2026-05-09T10:00:00.000Z",
          completed_at: null,
          steps: [{ id: "s1", step_name: "cache", status: "FAILED", updated_at: "2026-05-09T10:05:00.000Z" }],
        },
      ],
      count: 1,
    });

    render(<History />);

    const viewButton = await screen.findByRole("button", { name: /view/i });
    await userEvent.click(viewButton);

    expect(mockNavigate).toHaveBeenCalledWith("/", { state: { requestId: "req-2" } });
  });
});
