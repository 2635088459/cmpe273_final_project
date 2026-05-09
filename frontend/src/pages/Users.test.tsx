import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Users from "./Users";
import { listDemoUsers, restoreDemoUsers } from "../services/api";

jest.mock("../services/api", () => ({
  listDemoUsers: jest.fn(),
  restoreDemoUsers: jest.fn(),
}));

describe("Users", () => {
  beforeEach(() => {
    (listDemoUsers as jest.Mock).mockReset();
    (restoreDemoUsers as jest.Mock).mockReset();
  });

  it("loads and renders demo users", async () => {
    (listDemoUsers as jest.Mock).mockResolvedValueOnce([
      {
        id: "u1",
        username: "alice",
        email: "alice@example.com",
        created_at: "2026-05-09T10:00:00.000Z",
        updated_at: "2026-05-09T10:00:00.000Z",
      },
    ]);

    render(<Users />);

    await waitFor(() => {
      expect(listDemoUsers).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("heading", { level: 2, name: /demo users/i })).toBeInTheDocument();
    expect(await screen.findByText("alice")).toBeInTheDocument();
  });

  it("restores demo users and shows success message", async () => {
    (listDemoUsers as jest.Mock).mockResolvedValueOnce([]);
    (restoreDemoUsers as jest.Mock).mockResolvedValueOnce([
      {
        id: "u2",
        username: "bob",
        email: "bob@example.com",
        created_at: "2026-05-09T10:00:00.000Z",
        updated_at: "2026-05-09T10:00:00.000Z",
      },
    ]);

    render(<Users />);

    const restoreButton = await screen.findByRole("button", { name: /restore demo users/i });
    await userEvent.click(restoreButton);

    await waitFor(() => {
      expect(restoreDemoUsers).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/demo users restored/i)).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });
});
