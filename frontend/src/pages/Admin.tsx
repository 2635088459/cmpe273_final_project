import { useEffect, useState } from "react";
import {
  CircuitSnapshot,
  HealthAllResponse,
  ServiceStatus,
  SlaViolationRow,
  getCircuitStates,
  getHealthAll,
  getSlaViolations,
} from "../services/api";

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

function formatServiceName(name: string) {
  return name
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

function Admin() {
  const [health, setHealth] = useState<HealthAllResponse | null>(null);
  const [circuits, setCircuits] = useState<CircuitSnapshot[]>([]);
  const [healthError, setHealthError] = useState("");
  const [circuitsError, setCircuitsError] = useState("");
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [isLoadingCircuits, setIsLoadingCircuits] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [slaRows, setSlaRows] = useState<SlaViolationRow[]>([]);
  const [slaError, setSlaError] = useState("");
  const [isLoadingSla, setIsLoadingSla] = useState(true);

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
    setLastRefreshed(new Date());

    if (slaResult.status === "fulfilled") {
      setSlaRows(slaResult.value);
    } else {
      setSlaError("Unable to reach /admin/sla-violations.");
    }
    setIsLoadingSla(false);
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
            <h2>SLA violations</h2>
            <p>
              Requests flagged when they stay in-flight longer than{" "}
              <code>SLA_THRESHOLD_MINUTES</code> (backend scanner).
            </p>
          </div>

          {slaError ? (
            <div className="inline-message error" role="alert">
              <strong>SLA API unavailable</strong>
              <span>{slaError}</span>
            </div>
          ) : isLoadingSla ? (
            <div className="empty-state">
              <div><h3>Loading SLA data</h3></div>
            </div>
          ) : slaRows.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>No active SLA violations</h3>
                <p>Stuck requests will appear here with duration and subject id.</p>
              </div>
            </div>
          ) : (
            <div className="admin-service-list">
              {slaRows.map((row) => (
                <div className="admin-service-row" key={row.request_id}>
                  <div className="admin-service-info">
                    <strong className="mono">{row.request_id}</strong>
                    <span className="admin-service-meta">
                      subject <span className="mono">{row.subject_id}</span> · stuck since{" "}
                      {formatDate(row.stuck_since)} · {row.duration_minutes} min over SLA window
                    </span>
                  </div>
                  <span className="status-chip failed">SLA_VIOLATED</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="content-panel admin-panel-section">
          <div className="section-heading">
            <h2>Metrics dashboard</h2>
            <p>Live Prometheus metrics visualised in Grafana — deletion pipeline throughput, step status, and proof event counts.</p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="http://34.58.58.190/d/erasegraph-main/erasegraph-deletion-pipeline?orgId=1&refresh=5s"
              target="_blank"
              rel="noreferrer"
              className="button-primary"
              style={{ textDecoration: "none" }}
            >
              Open Grafana Dashboard ↗
            </a>
            <a
              href="http://34.58.58.190"
              target="_blank"
              rel="noreferrer"
              className="button-secondary"
              style={{ textDecoration: "none" }}
            >
              Grafana Home ↗
            </a>
          </div>
          <p style={{ marginTop: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Login: <code>admin</code> / <code>erasegraph2026</code>
          </p>
        </div>
      </section>
    </div>
  );
}

export default Admin;
