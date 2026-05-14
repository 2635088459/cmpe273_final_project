/**
 * Admin operations page.
 *
 * Three independent panels rendered side by side:
 *   1. Service health — live status of every downstream microservice from
 *      `GET /health/all`. Up = green chip, Down = red chip with the last
 *      `lastSeenUp` timestamp and any reported error.
 *   2. Circuit breaker states — current `CLOSED`/`HALF_OPEN`/`OPEN` per
 *      cleanup service from `GET /admin/circuits`. Open breakers also show
 *      the `open_until` cooldown deadline.
 *   3. SLA violations — deletion requests currently in `SLA_VIOLATED`
 *      status from `GET /admin/sla-violations`. Sourced from the
 *      backend `SlaMonitorService` 60-second scanner.
 *
 * The three sections load in parallel via `Promise.allSettled` so a
 * failure in one endpoint doesn't block the others. Each section has
 * its own loading, empty, and error rendering path.
 */
import { useEffect, useState } from "react";
import {
  CircuitSnapshot,
  HealthAllResponse,
  ServiceStatus,
  SlaViolation,
  getCircuitStates,
  getHealthAll,
  getSlaViolations,
} from "../services/api";

/** Formats an ISO timestamp into a short, locale-aware date+time string. */
function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

/**
 * Converts a snake_case or kebab-case service name (e.g.
 * `cache_cleanup_service`) into Title Case (`Cache Cleanup Service`)
 * for display in the admin badges.
 */
function formatServiceName(name: string) {
  return name
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * One row in the Service Health panel. Renders the service name, a
 * UP/DOWN status chip, and any contextual metadata (last-checked
 * timestamp for UP services, last-seen-up timestamp and error message
 * for DOWN services).
 */
function ServiceHealthBadge({ name, info }: { name: string; info: ServiceStatus }) {
  const isUp = info.status === "UP";
  return (
    <div className="admin-service-row">
      <div className="admin-service-info">
        <strong>{formatServiceName(name)}</strong>
        {isUp && info.checkedAt ? (
          <span className="admin-service-meta">Checked {formatDate(info.checkedAt)}</span>
        ) : null}
        {!isUp && info.lastSeenUp ? (
          <span className="admin-service-meta">Last up {formatDate(info.lastSeenUp)}</span>
        ) : null}
        {!isUp && info.error ? (
          <span className="admin-service-meta admin-service-error">{info.error}</span>
        ) : null}
      </div>
      <span className={`status-chip ${isUp ? "completed" : "failed"}`}>
        {isUp ? "UP" : "DOWN"}
      </span>
    </div>
  );
}

/**
 * One row in the Circuit Breaker panel. CSS chip class is picked from the
 * breaker state — CLOSED maps to the "completed" green chip, OPEN maps
 * to the "failed" red chip, HALF_OPEN maps to the "retrying" yellow
 * chip. The `open until` deadline is only shown for breakers whose
 * cooldown window is in the future.
 */
function CircuitRow({ circuit }: { circuit: CircuitSnapshot }) {
  const stateClass =
    circuit.state === "CLOSED"
      ? "completed"
      : circuit.state === "OPEN"
      ? "failed"
      : "retrying";

  const openUntilDate =
    circuit.open_until && circuit.open_until > Date.now()
      ? new Date(circuit.open_until).toLocaleTimeString()
      : null;

  return (
    <div className="admin-service-row">
      <div className="admin-service-info">
        <strong>{formatServiceName(circuit.service_name)}</strong>
        <span className="admin-service-meta">
          {circuit.failure_count} failure{circuit.failure_count !== 1 ? "s" : ""}
          {openUntilDate ? ` · open until ${openUntilDate}` : ""}
        </span>
      </div>
      <span className={`status-chip ${stateClass}`}>{circuit.state}</span>
    </div>
  );
}

/**
 * One row in the SLA Violations panel. Surfaced from the backend
 * `SlaMonitorService` scanner; the request ID and subject ID identify
 * which deletion has been stuck, and `duration_minutes` is the
 * live-computed time since the request was created (recomputed each
 * call to `GET /admin/sla-violations`).
 */
function SlaViolationRow({ v }: { v: SlaViolation }) {
  return (
    <div className="admin-service-row">
      <div className="admin-service-info">
        <strong style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{v.request_id}</strong>
        <span className="admin-service-meta">
          subject: {v.subject_id} · stuck {v.duration_minutes}m ·{" "}
          since {formatDate(v.stuck_since)}
        </span>
      </div>
      <span className="status-chip failed">SLA_VIOLATED</span>
    </div>
  );
}

function Admin() {
  const [health, setHealth] = useState<HealthAllResponse | null>(null);
  const [circuits, setCircuits] = useState<CircuitSnapshot[]>([]);
  const [slaViolations, setSlaViolations] = useState<SlaViolation[]>([]);
  const [healthError, setHealthError] = useState("");
  const [circuitsError, setCircuitsError] = useState("");
  const [slaError, setSlaError] = useState("");
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [isLoadingCircuits, setIsLoadingCircuits] = useState(true);
  const [isLoadingSla, setIsLoadingSla] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  /**
   * Loads all three admin data sources in parallel. We use
   * `Promise.allSettled` (not `Promise.all`) so a failure in one
   * endpoint does not poison the other two — each section renders its
   * own success / error path independently.
   */
  async function loadAll() {
    setIsLoadingHealth(true);
    setIsLoadingCircuits(true);
    setIsLoadingSla(true);
    setHealthError("");
    setCircuitsError("");
    setSlaError("");

    const [healthResult, circuitsResult, slaResult] = await Promise.allSettled([
      getHealthAll(),
      getCircuitStates(),
      getSlaViolations(),
    ]);

    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value);
    } else {
      setHealthError("Unable to reach /health/all. Check that the backend is running.");
    }
    setIsLoadingHealth(false);

    if (circuitsResult.status === "fulfilled") {
      setCircuits(circuitsResult.value);
    } else {
      setCircuitsError("Unable to reach /admin/circuits.");
    }
    setIsLoadingCircuits(false);

    if (slaResult.status === "fulfilled") {
      setSlaViolations(slaResult.value);
    } else {
      setSlaError("Unable to reach /admin/sla-violations.");
    }
    setIsLoadingSla(false);
    setLastRefreshed(new Date());
  }

  useEffect(() => {
    loadAll();
  }, []);

  const serviceEntries = health ? Object.entries(health.services) : [];
  const upCount = serviceEntries.filter(([, s]) => s.status === "UP").length;

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Admin panel</span>
            <h1>System health and circuit breaker states.</h1>
            <p>
              Monitor live service health and circuit breaker states across all
              EraseGraph microservices.
            </p>
            <div className="hero-actions">
              <button className="button-primary" onClick={loadAll}>
                Refresh
              </button>
              <a
                href="http://34.58.58.190/"
                target="_blank"
                rel="noreferrer"
                className="button-secondary"
              >
                Open Grafana
              </a>
              <a
                href="http://34.63.108.15/"
                target="_blank"
                rel="noreferrer"
                className="button-secondary"
              >
                Open RabbitMQ UI
              </a>
              <a
                href="http://35.222.66.229/"
                target="_blank"
                rel="noreferrer"
                className="button-secondary"
              >
                Open Jaeger UI
              </a>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", alignSelf: "center" }}>
                Grafana login — username: <code>admin</code> · password: <code>erasegraph2026</code>
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", alignSelf: "center" }}>
                RabbitMQ login — username: <code>erasegraph</code> · password: <code>Wj5dF3hY8cPnAt6Z</code>
              </span>
              {lastRefreshed ? (
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", alignSelf: "center" }}>
                  Last refreshed {lastRefreshed.toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </div>

          {health ? (
            <aside className="hero-side-panel">
              <span className="hero-side-label">Overall health</span>
              <div className="hero-side-value">
                <span className={health.overall === "UP" ? "text-success" : "text-warn"}>
                  {health.overall}
                </span>
              </div>
              <div className="metric-grid compact">
                <div className="metric-card">
                  <div className="metric-copy">
                    <strong>{upCount}</strong>
                    <p>Services up</p>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-copy">
                    <strong>{serviceEntries.length - upCount}</strong>
                    <p>Services down</p>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      <section className="dashboard-layout">
        <div className="content-panel admin-panel-section">
          <div className="section-heading">
            <h2>Service health</h2>
            <p>Live status of all downstream microservices via /health/all.</p>
          </div>

          {healthError ? (
            <div className="inline-message error" role="alert">
              <strong>Health check unavailable</strong>
              <span>{healthError}</span>
            </div>
          ) : isLoadingHealth ? (
            <div className="empty-state">
              <div><h3>Loading health data</h3></div>
            </div>
          ) : serviceEntries.length === 0 ? (
            <div className="empty-state">
              <div><h3>No services reported</h3><p>Backend returned an empty services map.</p></div>
            </div>
          ) : (
            <div className="admin-service-list">
              {serviceEntries.map(([name, info]) => (
                <ServiceHealthBadge key={name} name={name} info={info} />
              ))}
            </div>
          )}
        </div>

        <div className="content-panel admin-panel-section">
          <div className="section-heading">
            <h2>Circuit breaker states</h2>
            <p>Current state per service from /admin/circuits.</p>
          </div>

          {circuitsError ? (
            <div className="inline-message error" role="alert">
              <strong>Circuit data unavailable</strong>
              <span>{circuitsError}</span>
            </div>
          ) : isLoadingCircuits ? (
            <div className="empty-state">
              <div><h3>Loading circuit states</h3></div>
            </div>
          ) : circuits.length === 0 ? (
            <div className="empty-state">
              <div><h3>No circuits tracked</h3><p>No circuit breaker data found.</p></div>
            </div>
          ) : (
            <div className="admin-service-list">
              {circuits.map((c) => (
                <CircuitRow key={c.service_name} circuit={c} />
              ))}
            </div>
          )}

          <div className="admin-legend">
            <div className="admin-legend-item">
              <span className="status-chip completed">CLOSED</span>
              <span>Normal — requests flow through</span>
            </div>
            <div className="admin-legend-item">
              <span className="status-chip retrying">HALF_OPEN</span>
              <span>Testing — one probe request allowed</span>
            </div>
            <div className="admin-legend-item">
              <span className="status-chip failed">OPEN</span>
              <span>Tripped — requests skipped until cooldown</span>
            </div>
          </div>
        </div>

        <div className="content-panel admin-panel-section">
          <div className="section-heading">
            <h2>SLA Violations</h2>
            <p>
              Deletion requests stuck in PENDING / RUNNING / PARTIAL_COMPLETED beyond the
              configured SLA threshold.
            </p>
          </div>

          {slaError ? (
            <div className="inline-message error" role="alert">
              <strong>SLA data unavailable</strong>
              <span>{slaError}</span>
            </div>
          ) : isLoadingSla ? (
            <div className="empty-state">
              <div><h3>Loading SLA violations</h3></div>
            </div>
          ) : slaViolations.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>No SLA violations</h3>
                <p>All active requests are within the SLA threshold.</p>
              </div>
            </div>
          ) : (
            <div className="admin-service-list">
              {slaViolations.map((v) => (
                <SlaViolationRow key={v.request_id} v={v} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Admin;
