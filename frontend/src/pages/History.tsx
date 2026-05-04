import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeletionRequest, listDeletionRequests } from "../services/api";

const statusOptions = [
  "",
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "PARTIAL_COMPLETED",
  "FAILED",
  "RETRYING",
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stepsDone(request: DeletionRequest) {
  const done = request.steps.filter((s) =>
    ["SUCCEEDED", "FAILED", "SKIPPED_CIRCUIT_OPEN"].includes(s.status.toUpperCase())
  ).length;
  return `${done} / ${request.steps.length}`;
}

function History() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await listDeletionRequests({
          search: search.trim() || undefined,
          status: status || undefined,
          limit: 50,
        });
        if (isActive) setRequests(data.items);
      } catch {
        if (isActive) setErrorMessage("Unable to load history. Confirm the backend is running.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    load();
    return () => { isActive = false; };
  }, [search, status]);

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Deletion history</span>
            <h1>All past deletion requests in one place.</h1>
            <p>
              Browse, search, and filter every deletion request submitted to
              EraseGraph. Click View to inspect proof events for any request.
            </p>
          </div>
        </div>
      </section>

      <section className="status-toolbar content-panel">
        <div className="section-heading">
          <h2>Request history</h2>
          <p>Showing up to 50 most recent requests. Use the filters to narrow results.</p>
        </div>
        <div className="status-search-row">
          <div className="input-group">
            <label htmlFor="history-search">Search</label>
            <input
              id="history-search"
              className="text-input"
              placeholder="Request ID or subject ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="select-group">
            <label htmlFor="history-status">Status</label>
            <select
              id="history-status"
              className="select-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {statusOptions.map((opt) => (
                <option key={opt || "all"} value={opt}>
                  {opt ? formatLabel(opt) : "All statuses"}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button-primary button-compact"
            onClick={() => { setSearch(""); setStatus(""); }}
          >
            Clear filters
          </button>
        </div>
      </section>

      {errorMessage ? (
        <div className="inline-message error" role="alert">
          <strong>History unavailable</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <section className="content-panel">
        {isLoading ? (
          <div className="empty-state">
            <div>
              <h3>Loading history</h3>
              <p>Fetching deletion requests from the backend.</p>
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No requests found</h3>
              <p>Adjust the filters or submit a new deletion request.</p>
            </div>
          </div>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Subject ID</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <strong>{req.subject_id}</strong>
                      <div className="history-id">{req.id}</div>
                    </td>
                    <td>
                      <span className={`status-chip ${req.status.toLowerCase()}`}>
                        {formatLabel(req.status)}
                      </span>
                    </td>
                    <td>{stepsDone(req)}</td>
                    <td>{formatDate(req.created_at)}</td>
                    <td>
                      <button
                        className="button-secondary button-compact"
                        onClick={() => navigate("/", { state: { requestId: req.id } })}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default History;
