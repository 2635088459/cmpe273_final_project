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

describe("Admin — service health rendering", () => {
  beforeEach(() => {
    (getHealthAll as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockReset();
    (getSlaViolations as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockResolvedValue([]);
    (getSlaViolations as jest.Mock).mockResolvedValue([]);
  });

  it("renders all three top-level sections", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({ overall: "UP", services: {} });

    render(<Admin />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /service health/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /circuit breaker states/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /sla violations/i })
    ).toBeInTheDocument();
  });

  it("shows UP badge for healthy services", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "UP",
      services: {
        backend: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" },
        proof_service: { status: "UP", checkedAt: "2026-05-09T10:00:01.000Z" },
      },
    });

    render(<Admin />);

    const upBadges = await screen.findAllByText("UP");
    expect(upBadges.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Backend/)).toBeInTheDocument();
    expect(screen.getByText(/Proof Service/)).toBeInTheDocument();
  });

  it("shows DOWN badge with error message for failed services", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "DEGRADED",
      services: {
        cache_cleanup: {
          status: "DOWN",
          lastSeenUp: "2026-05-09T09:58:00.000Z",
          error: "connection refused",
        },
      },
    });

    render(<Admin />);

    expect(await screen.findByText("DOWN")).toBeInTheDocument();
    expect(screen.getByText(/Cache Cleanup/)).toBeInTheDocument();
    expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
    expect(screen.getByText(/Last up/i)).toBeInTheDocument();
  });

  it("formats snake_case service names to Title Case", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "UP",
      services: {
        analytics_cleanup_service: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" },
      },
    });

    render(<Admin />);

    expect(await screen.findByText(/Analytics Cleanup Service/)).toBeInTheDocument();
  });

  it("renders empty state when services map is empty", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({ overall: "UP", services: {} });

    render(<Admin />);

    expect(await screen.findByText(/No services reported/i)).toBeInTheDocument();
  });

  it("shows overall health metric tiles with up/down counters", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "DEGRADED",
      services: {
        a: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" },
        b: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" },
        c: { status: "DOWN" },
      },
    });

    render(<Admin />);

    await screen.findByText(/Overall health/i);
    // 2 services up
    expect(screen.getByText("2")).toBeInTheDocument();
    // 1 service down
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("displays an error message when health API rejects", async () => {
    (getHealthAll as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    render(<Admin />);

    expect(
      await screen.findByText(/Unable to reach \/health\/all/i)
    ).toBeInTheDocument();
  });
});

describe("Admin — circuit breaker rendering", () => {
  beforeEach(() => {
    (getHealthAll as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockReset();
    (getSlaViolations as jest.Mock).mockReset();
    (getHealthAll as jest.Mock).mockResolvedValue({ overall: "UP", services: {} });
    (getSlaViolations as jest.Mock).mockResolvedValue([]);
  });

  it("shows CLOSED state with completed style chip", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      { service_name: "primary_data", state: "CLOSED", failure_count: 0 },
    ]);

    render(<Admin />);

    const chip = await screen.findByText("CLOSED");
    expect(chip).toHaveClass("status-chip");
    expect(chip).toHaveClass("completed");
  });

  it("shows OPEN state with failure count and open_until time", async () => {
    const openUntil = Date.now() + 30_000;
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      {
        service_name: "cache_cleanup",
        state: "OPEN",
        failure_count: 3,
        open_until: openUntil,
      },
    ]);

    render(<Admin />);

    const chip = await screen.findByText("OPEN");
    expect(chip).toHaveClass("failed");
    expect(screen.getByText(/3 failures/i)).toBeInTheDocument();
    expect(screen.getByText(/open until/i)).toBeInTheDocument();
  });

  it("shows HALF_OPEN state with retrying style chip", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      {
        service_name: "search_cleanup",
        state: "HALF_OPEN",
        failure_count: 3,
        open_until: Date.now() + 10_000,
      },
    ]);

    render(<Admin />);

    const chip = await screen.findByText("HALF_OPEN");
    expect(chip).toHaveClass("retrying");
  });

  it("uses singular 'failure' label when failure_count is 1", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      { service_name: "backup", state: "CLOSED", failure_count: 1 },
    ]);

    render(<Admin />);

    expect(await screen.findByText(/^1 failure/i)).toBeInTheDocument();
  });

  it("hides open_until when timestamp is already in the past", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([
      {
        service_name: "cache_cleanup",
        state: "CLOSED",
        failure_count: 0,
        open_until: Date.now() - 60_000,
      },
    ]);

    render(<Admin />);

    await screen.findByText("CLOSED");
    expect(screen.queryByText(/open until/i)).not.toBeInTheDocument();
  });

  it("renders an empty state when no circuits are tracked", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([]);

    render(<Admin />);

    expect(await screen.findByText(/No circuits tracked/i)).toBeInTheDocument();
  });

  it("renders the legend with CLOSED/HALF_OPEN/OPEN explanations", async () => {
    (getCircuitStates as jest.Mock).mockResolvedValueOnce([]);

    render(<Admin />);

    await screen.findByText(/No circuits tracked/i);
    expect(screen.getByText(/Normal — requests flow through/i)).toBeInTheDocument();
    expect(screen.getByText(/Testing — one probe request allowed/i)).toBeInTheDocument();
    expect(screen.getByText(/Tripped — requests skipped until cooldown/i)).toBeInTheDocument();
  });

  it("shows an error when circuit API rejects", async () => {
    (getCircuitStates as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    render(<Admin />);

    expect(
      await screen.findByText(/Unable to reach \/admin\/circuits/i)
    ).toBeInTheDocument();
  });
});

describe("Admin — SLA violations rendering", () => {
  beforeEach(() => {
    (getHealthAll as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockReset();
    (getSlaViolations as jest.Mock).mockReset();
    (getHealthAll as jest.Mock).mockResolvedValue({ overall: "UP", services: {} });
    (getCircuitStates as jest.Mock).mockResolvedValue([]);
  });

  it("renders a violation row with subject and duration", async () => {
    (getSlaViolations as jest.Mock).mockResolvedValueOnce([
      {
        request_id: "abcd-1234",
        subject_id: "alice",
        stuck_since: "2026-05-09T08:00:00.000Z",
        duration_minutes: 42,
      },
    ]);

    render(<Admin />);

    expect(await screen.findByText(/SLA_VIOLATED/i)).toBeInTheDocument();
    expect(screen.getByText(/abcd-1234/)).toBeInTheDocument();
    expect(screen.getByText(/subject: alice/i)).toBeInTheDocument();
    expect(screen.getByText(/stuck 42m/i)).toBeInTheDocument();
  });

  it("renders multiple violation rows in order returned", async () => {
    (getSlaViolations as jest.Mock).mockResolvedValueOnce([
      {
        request_id: "r-1",
        subject_id: "alice",
        stuck_since: "2026-05-09T08:00:00.000Z",
        duration_minutes: 30,
      },
      {
        request_id: "r-2",
        subject_id: "bob",
        stuck_since: "2026-05-09T08:30:00.000Z",
        duration_minutes: 15,
      },
    ]);

    render(<Admin />);

    await screen.findByText(/r-1/);
    expect(screen.getByText(/r-2/)).toBeInTheDocument();
    expect(screen.getAllByText(/SLA_VIOLATED/i).length).toBe(2);
  });

  it("shows reassuring empty state when no violations exist", async () => {
    (getSlaViolations as jest.Mock).mockResolvedValueOnce([]);

    render(<Admin />);

    expect(await screen.findByText(/No SLA violations/i)).toBeInTheDocument();
    expect(
      screen.getByText(/All active requests are within the SLA threshold/i)
    ).toBeInTheDocument();
  });

  it("shows an error message when SLA API rejects", async () => {
    (getSlaViolations as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    render(<Admin />);

    expect(
      await screen.findByText(/Unable to reach \/admin\/sla-violations/i)
    ).toBeInTheDocument();
  });
});

describe("Admin — refresh and last refreshed", () => {
  beforeEach(() => {
    (getHealthAll as jest.Mock).mockReset();
    (getCircuitStates as jest.Mock).mockReset();
    (getSlaViolations as jest.Mock).mockReset();
  });

  it("shows the Last refreshed timestamp once the initial load completes", async () => {
    (getHealthAll as jest.Mock).mockResolvedValue({ overall: "UP", services: {} });
    (getCircuitStates as jest.Mock).mockResolvedValue([]);
    (getSlaViolations as jest.Mock).mockResolvedValue([]);

    render(<Admin />);

    await screen.findByText(/Last refreshed/i);
  });

  it("refresh reloads all three independent API calls", async () => {
    (getHealthAll as jest.Mock).mockResolvedValue({ overall: "UP", services: {} });
    (getCircuitStates as jest.Mock).mockResolvedValue([]);
    (getSlaViolations as jest.Mock).mockResolvedValue([]);

    render(<Admin />);

    await waitFor(() => {
      expect(getHealthAll).toHaveBeenCalledTimes(1);
      expect(getCircuitStates).toHaveBeenCalledTimes(1);
      expect(getSlaViolations).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(getHealthAll).toHaveBeenCalledTimes(2);
      expect(getCircuitStates).toHaveBeenCalledTimes(2);
      expect(getSlaViolations).toHaveBeenCalledTimes(2);
    });
  });

  it("renders independently when only one of three APIs fails", async () => {
    (getHealthAll as jest.Mock).mockResolvedValueOnce({
      overall: "UP",
      services: { backend: { status: "UP", checkedAt: "2026-05-09T10:00:00.000Z" } },
    });
    (getCircuitStates as jest.Mock).mockRejectedValueOnce(new Error("circuits down"));
    (getSlaViolations as jest.Mock).mockResolvedValueOnce([]);

    render(<Admin />);

    // health still renders
    expect(await screen.findByText(/^Backend$/)).toBeInTheDocument();
    // circuit shows error
    expect(screen.getByText(/Unable to reach \/admin\/circuits/i)).toBeInTheDocument();
    // sla shows empty state (success)
    expect(screen.getByText(/No SLA violations/i)).toBeInTheDocument();
  });
});
