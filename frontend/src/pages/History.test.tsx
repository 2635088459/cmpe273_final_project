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

function makeRequest(overrides: Partial<{
  id: string;
  subject_id: string;
  status: string;
  trace_id: string;
  created_at: string;
  completed_at: string | null;
  steps: Array<{ id: string; step_name: string; status: string; updated_at: string }>;
}> = {}) {
  return {
    id: "req-x",
    subject_id: "alice",
    status: "COMPLETED",
    trace_id: "tr-x",
    created_at: "2026-05-09T10:00:00.000Z",
    completed_at: "2026-05-09T10:05:00.000Z",
    steps: [
      { id: "s1", step_name: "cache", status: "SUCCEEDED", updated_at: "2026-05-09T10:05:00.000Z" },
    ],
    ...overrides,
  };
}

describe("History — toolbar and filters", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    (listDeletionRequests as jest.Mock).mockReset();
  });

  it("renders the toolbar heading and filter controls", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /request history/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("populates the status dropdown with all known statuses", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    const select = await screen.findByLabelText(/status/i);
    const options = (select as HTMLSelectElement).options;
    const labels = Array.from(options).map((o) => o.value);

    expect(labels).toEqual(
      expect.arrayContaining(["", "PENDING", "RUNNING", "COMPLETED", "PARTIAL_COMPLETED", "FAILED", "RETRYING"])
    );
  });

  it("triggers a refetch when status filter changes", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    await waitFor(() => expect(listDeletionRequests).toHaveBeenCalledTimes(1));

    await userEvent.selectOptions(screen.getByLabelText(/status/i), "COMPLETED");

    await waitFor(() => {
      const callArgs = (listDeletionRequests as jest.Mock).mock.calls.at(-1)?.[0];
      expect(callArgs).toMatchObject({ status: "COMPLETED" });
    });
  });

  it("triggers a refetch when typing into the search box", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    await waitFor(() => expect(listDeletionRequests).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText(/search/i), "alice");

    await waitFor(() => {
      const callArgs = (listDeletionRequests as jest.Mock).mock.calls.at(-1)?.[0];
      expect(callArgs).toMatchObject({ search: "alice" });
    });
  });

  it("trims whitespace from the search input before passing to the API", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    await waitFor(() => expect(listDeletionRequests).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText(/search/i), "   ");

    await waitFor(() => {
      const callArgs = (listDeletionRequests as jest.Mock).mock.calls.at(-1)?.[0];
      // search of only whitespace should not be passed as a real filter
      expect(callArgs.search).toBeUndefined();
    });
  });

  it("uses limit=50 on every request", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    await waitFor(() => {
      expect(listDeletionRequests).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  it("clearing the filters resets both inputs and refetches", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValue({ items: [], count: 0 });

    render(<History />);

    await waitFor(() => expect(listDeletionRequests).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText(/search/i), "bob");
    await userEvent.selectOptions(screen.getByLabelText(/status/i), "FAILED");

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect((screen.getByLabelText(/search/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/status/i) as HTMLSelectElement).value).toBe("");
  });
});

describe("History — table rendering", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    (listDeletionRequests as jest.Mock).mockReset();
  });

  it("renders multiple rows when several requests are returned", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        makeRequest({ id: "r-1", subject_id: "alice", status: "COMPLETED" }),
        makeRequest({ id: "r-2", subject_id: "bob", status: "FAILED" }),
        makeRequest({ id: "r-3", subject_id: "carol", status: "PARTIAL_COMPLETED" }),
      ],
      count: 3,
    });

    render(<History />);

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /view/i }).length).toBe(3);
  });

  it("applies the correct status-chip class per request status", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        makeRequest({ id: "r-1", status: "COMPLETED" }),
        makeRequest({ id: "r-2", status: "FAILED" }),
        makeRequest({ id: "r-3", status: "RETRYING" }),
      ],
      count: 3,
    });

    render(<History />);

    // Wait for the table to render
    await screen.findByText("r-1");

    // Scope chip queries to <span class="status-chip"> elements only
    const chips = document.querySelectorAll("td span.status-chip");
    const chipTextByClass = Array.from(chips).map((el) => ({
      text: el.textContent,
      classes: el.className,
    }));

    expect(chipTextByClass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Completed", classes: expect.stringContaining("completed") }),
        expect.objectContaining({ text: "Failed", classes: expect.stringContaining("failed") }),
        expect.objectContaining({ text: "Retrying", classes: expect.stringContaining("retrying") }),
      ])
    );
  });

  it("formats step counts as 'done / total'", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        makeRequest({
          steps: [
            { id: "s1", step_name: "primary", status: "SUCCEEDED", updated_at: "" },
            { id: "s2", step_name: "cache", status: "SUCCEEDED", updated_at: "" },
            { id: "s3", step_name: "search", status: "PENDING", updated_at: "" },
            { id: "s4", step_name: "analytics", status: "RUNNING", updated_at: "" },
          ],
        }),
      ],
      count: 1,
    });

    render(<History />);

    expect(await screen.findByText("2 / 4")).toBeInTheDocument();
  });

  it("counts SKIPPED_CIRCUIT_OPEN steps as 'done' for progress", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        makeRequest({
          status: "PARTIAL_COMPLETED",
          steps: [
            { id: "s1", step_name: "primary", status: "SUCCEEDED", updated_at: "" },
            { id: "s2", step_name: "cache", status: "SKIPPED_CIRCUIT_OPEN", updated_at: "" },
            { id: "s3", step_name: "search", status: "PENDING", updated_at: "" },
          ],
        }),
      ],
      count: 1,
    });

    render(<History />);

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("shows the empty state when no rows match the filters", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({ items: [], count: 0 });

    render(<History />);

    expect(await screen.findByText(/no requests found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Adjust the filters or submit a new deletion request/i)
    ).toBeInTheDocument();
  });

  it("shows a loading state on initial render", () => {
    (listDeletionRequests as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<History />);

    expect(screen.getByText(/loading history/i)).toBeInTheDocument();
  });

  it("shows an alert when the API rejects", async () => {
    (listDeletionRequests as jest.Mock).mockRejectedValueOnce(new Error("network"));

    render(<History />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/history unavailable/i);
    expect(alert).toHaveTextContent(/confirm the backend is running/i);
  });

  it("renders the truncated request ID under the subject", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [makeRequest({ id: "abcd-ef12-3456", subject_id: "alice" })],
      count: 1,
    });

    render(<History />);

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("abcd-ef12-3456")).toBeInTheDocument();
  });

  it("navigates with the correct state when View is clicked on a specific row", async () => {
    (listDeletionRequests as jest.Mock).mockResolvedValueOnce({
      items: [
        makeRequest({ id: "alpha" }),
        makeRequest({ id: "beta" }),
        makeRequest({ id: "gamma" }),
      ],
      count: 3,
    });

    render(<History />);

    const buttons = await screen.findAllByRole("button", { name: /view/i });
    await userEvent.click(buttons[1]); // click the middle row

    expect(mockNavigate).toHaveBeenCalledWith("/", { state: { requestId: "beta" } });
  });
});
