import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BulkUpload from "./BulkUpload";
import { bulkDeleteCsv } from "../services/api";

jest.mock("../services/api", () => ({
  bulkDeleteCsv: jest.fn(),
}));

describe("BulkUpload", () => {
  beforeEach(() => {
    (bulkDeleteCsv as jest.Mock).mockReset();
  });

  it("shows validation error when uploading without file", async () => {
    render(<BulkUpload />);
    expect(screen.getByRole("button", { name: /upload csv/i })).toBeDisabled();
  });

  it("uploads csv file and shows summary", async () => {
    (bulkDeleteCsv as jest.Mock).mockResolvedValueOnce({
      created: 2,
      skipped: 1,
      request_ids: ["r1", "r2"],
      rows: [
        { row: 1, subject_id: "alice", status: "created", request_id: "r1" },
        { row: 2, subject_id: "bob", status: "created", request_id: "r2" },
        { row: 3, subject_id: "", status: "skipped", reason: "blank" },
      ],
    });

    render(<BulkUpload />);

    const input = screen.getByLabelText(/csv file/i);
    const file = new File(["subject_id\nalice\nbob\n"], "input.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => {
      expect(bulkDeleteCsv).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /upload csv/i })).toBeEnabled();
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/2 requests? created, 1 row skipped/i)).toBeInTheDocument();
  });
});
