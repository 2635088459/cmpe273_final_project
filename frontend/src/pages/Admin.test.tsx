import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "./Admin";
import { getCircuitStates, getHealthAll, getSlaViolations } from "../services/api";

jest.mock("../services/api", () => ({
  getHealthAll: jest.fn(),
  getCircuitStates: jest.fn(),
  getSlaViolations: jest.fn(),
}));

describe("Admin", () => {
  beforeEach(() => {
    (getHealthAll as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockReset();
    (getSlaViolations as jest.Mock).mockReset();
  });

  it("loads and shows health/circuit/sla data", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "UP",
      services: {
        backend: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" },
        cache_cleanup: { status: "DOWN", lastSeenUp: "2026-05-09T09:58:00.000Z", error: "timeout" },
      },
    });
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      { service_name: "cache_cleanup", state: "OPEN", failure_count: 3, open_until: Date.now() + 30000 },
    ]);
    (getSlaViolations as jest.Mock).mockResolvedValueOnce([
      {
        request_id: "req-1",
        subject_id: "alice",
        stuck_since: "2026-05-09T09:00:00.000Z",
        duration_minutes: 70,
      },
    ]);

    render(<Admin />);

    await waitFor(() => {
      expect(getHealthAll).toHaveBeenCalledTimes(1);
      expect(getCircuitStates).toHaveBeenCalledTimes(1);
      expect(getSlaViolations).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole("heading", { level: 2, name: /service health/i })).toBeInTheDocument();
    expect(screen.getAllByText("OPEN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SLA_VIOLATED/i)).toBeInTheDocument();
  });

  it("refresh button triggers another load", async () => {
    (getHealthAll as jest.Mock).mockResolvedValue({ overall: "UP", services: {} });
    (getCircuitStates as jest.Mock).mockResolvedValue([]);
    (getSlaViolations as jest.Mock).mockResolvedValue([]);

    render(<Admin />);

    await waitFor(() => {
      expect(getHealthAll).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(getHealthAll).toHaveBeenCalledTimes(2);
    });
  });
});
