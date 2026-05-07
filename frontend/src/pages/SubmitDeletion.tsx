import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import API, {
  createDeletionRequest,
  CreateDeletionRequestResponse,
  DeletionStep,
} from "../services/api";

const STEP_ORDER = [
  "primary_data",
  "cache",
  "search_cleanup",
  "analytics_cleanup",
  "backup",
] as const;

const STEP_LABELS: Record<string, string> = {
  primary_data: "Primary database",
  cache: "Cache (Redis)",
  search_cleanup: "Search index",
  analytics_cleanup: "Analytics (delayed)",
  backup: "Backup markers",
};

function sseBaseUrl(): string {
  const raw =
    process.env.REACT_APP_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    API.defaults.baseURL ||
    "http://localhost:3001";
  return String(raw).replace(/\/$/, "");
}

function SubmitDeletion() {
  const [subjectId, setSubjectId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] =
    useState<CreateDeletionRequestResponse | null>(null);

  const [liveSteps, setLiveSteps] = useState<DeletionStep[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [streamProcessing, setStreamProcessing] = useState(false);
  const [streamFinished, setStreamFinished] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [finalStatus, setFinalStatus] = useState<string>("");

  const stepMap = useMemo(() => {
    const m = new Map<string, DeletionStep>();
    for (const s of liveSteps) {
      m.set(s.step_name, s);
    }
    return m;
  }, [liveSteps]);

  useEffect(() => {
    const id = createdRequest?.request_id;
    if (!id) {
      return undefined;
    }

    setStreamProcessing(true);
    setStreamFinished(false);
    setStreamError("");
    setFinalStatus("");
    setLiveSteps([]);
    setLiveStatus("");

    const url = `${sseBaseUrl()}/deletions/${id}/stream`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          status?: string;
          steps?: DeletionStep[];
        };
        if (typeof data.status === "string") {
          setLiveStatus(data.status);
        }
        if (data.steps?.length) {
          setLiveSteps(data.steps);
        }
      } catch {
        /* ignore malformed chunks */
      }
    };

    es.addEventListener("done", (ev: Event) => {
      const me = ev as MessageEvent;
      try {
        const payload = JSON.parse(me.data) as { status?: string };
        const st = payload.status || "";
        setFinalStatus(st);
        if (st === "FAILED") {
          setStreamError(
            "One or more deletion steps failed. Check history or Jaeger for details."
          );
        }
      } finally {
        setStreamFinished(true);
        setStreamProcessing(false);
        es.close();
      }
    });

    es.onerror = () => {
      setStreamError(
        "Lost connection to the live progress stream. You can still track this request on the History page."
      );
      setStreamProcessing(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [createdRequest?.request_id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedSubjectId = subjectId.trim();

    if (!normalizedSubjectId) {
      setErrorMessage("Enter a subject ID to start the deletion workflow.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setCreatedRequest(null);
    setLiveSteps([]);
    setStreamFinished(false);
    setStreamError("");
    setFinalStatus("");

    try {
      const response = await createDeletionRequest({
        subject_id: normalizedSubjectId,
      });
      setCreatedRequest(response);
      setSubjectId("");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage =
          typeof error.response?.data?.message === "string"
            ? error.response.data.message
            : Array.isArray(error.response?.data?.message)
              ? error.response?.data?.message.join(", ")
              : "";

        setErrorMessage(
          apiMessage ||
            `We couldn't submit the request. Make sure the backend is running on ${API.defaults.baseURL}.`
        );
      } else {
        setErrorMessage("Something unexpected happened while submitting the request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const showCompleteBanner =
    streamFinished && !streamError && finalStatus === "COMPLETED";

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Deletion requests</span>
            <h1>Submit a deletion request and capture the identifiers needed for follow-up.</h1>
            <p>
              Use this form to initiate a deletion workflow, receive the request
              and trace identifiers, and preserve the information required for
              tracking and verification.
            </p>
          </div>

          <aside className="hero-side-panel">
            <span className="hero-side-label">Request overview</span>
            <div className="hero-side-value">
              Request <span>submission</span>
            </div>
            <p className="hero-side-copy">
              A submitted request creates a traceable record that can be used
              for downstream status review, operational follow-up, and proof
              verification.
            </p>
            <div className="hero-side-list">
              <div className="hero-side-row">
                <div className="hero-side-step">01</div>
                <div className="hero-side-content">
                  <strong>Request capture</strong>
                  <span>
                    Register the subject identifier and create the request
                    record for processing.
                  </span>
                </div>
              </div>
              <div className="hero-side-row">
                <div className="hero-side-step">02</div>
                <div className="hero-side-content">
                  <strong>Identifier generation</strong>
                  <span>
                    Store the request ID and trace ID returned after
                    submission for later tracking.
                  </span>
                </div>
              </div>
              <div className="hero-side-row">
                <div className="hero-side-step">03</div>
                <div className="hero-side-content">
                  <strong>Workflow follow-up</strong>
                  <span>
                    Use the saved identifiers to review progress and validate
                    completion in the dashboard.
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="submit-grid">
        <article className="form-card glow-card">
          <div className="form-shell">
            <div className="form-header-row">
              <div className="section-heading">
                <h2>Submit deletion request</h2>
                <p>
                  Enter the user or entity identifier exactly as stored in your
                  system. A successful request returns a unique request ID and
                  trace ID.
                </p>
              </div>
            </div>

            <form className="form-layout" onSubmit={handleSubmit}>
              <div className="field-grid">
                <div className="form-field">
                  <label htmlFor="subject-id">Subject ID</label>
                  <input
                    id="subject-id"
                    className="text-input"
                    placeholder="user_10293 or customer-8f3a"
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                    autoComplete="off"
                  />
                  <span className="subtle-copy">
                    Example values: internal user ID, customer reference, or tenant
                    subject key.
                  </span>
                </div>
              </div>

              {errorMessage ? (
                <div className="submit-feedback error" role="alert">
                  <strong>Submission failed</strong>
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              {createdRequest ? (
                <div className="submit-feedback success" role="status">
                  <strong>Request accepted</strong>
                  <span>{createdRequest.message}</span>
                </div>
              ) : null}

              {streamProcessing ? (
                <div className="submit-feedback" role="status" style={{ borderColor: "rgba(100,149,237,0.35)" }}>
                  <strong>Processing…</strong>
                  <span>
                    Live updates via SSE — no polling. Overall status:{" "}
                    <span className="mono">{liveStatus || createdRequest?.status || "—"}</span>
                  </span>
                </div>
              ) : null}

              {showCompleteBanner ? (
                <div className="submit-feedback success" role="status">
                  <strong>Deletion complete</strong>
                  <span>All tracked steps finished successfully. Proof and notification endpoints are ready to inspect.</span>
                </div>
              ) : null}

              {streamError ? (
                <div className="submit-feedback error" role="alert">
                  <strong>Workflow notice</strong>
                  <span>{streamError}</span>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  type="submit"
                  className="button-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Create request"}
                </button>
              </div>
            </form>
          </div>
        </article>

        <aside className="support-grid">
          <article className="summary-card glow-card">
            <h3>What happens next</h3>
            <div className="process-list">
              <div className="process-row">
                <span className="process-index">1</span>
                <div className="process-copy">
                  <strong>Request accepted</strong>
                  <span>The backend returns a request ID and trace ID.</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">2</span>
                <div className="process-copy">
                  <strong>Deletion workflow</strong>
                  <span>Downstream services process the request in parallel (analytics may finish later).</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">3</span>
                <div className="process-copy">
                  <strong>Status + proof</strong>
                  <span>Use the saved IDs for dashboard and audit tracking.</span>
                </div>
              </div>
            </div>
          </article>

          <article className="metric-card summary-card glow-card">
            <div className="metric-copy">
              <strong>202</strong>
              <p>Expected response when the backend accepts a new request.</p>
            </div>
          </article>

          {createdRequest ? (
            <>
              <article className="detail-card glow-card">
                <div className="status-detail-top">
                  <div>
                    <h3>Created request</h3>
                    <p className="status-meta">
                      Keep these values for status tracking and proof lookup.
                    </p>
                  </div>
                  <span className="status-chip pending">
                    {(liveStatus || createdRequest.status).toLowerCase()}
                  </span>
                </div>

                <div className="timeline-list">
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <div>
                      <strong>Request ID</strong>
                      <h4 className="mono">{createdRequest.request_id}</h4>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <div>
                      <strong>Trace ID</strong>
                      <h4 className="mono">{createdRequest.trace_id}</h4>
                    </div>
                  </div>
                </div>
              </article>

              <article className="detail-card glow-card">
                <div className="section-heading" style={{ marginBottom: "0.75rem" }}>
                  <h3 style={{ margin: 0 }}>Pipeline steps</h3>
                  <p className="status-meta" style={{ margin: "0.25rem 0 0" }}>
                    Updated in real time from the SSE stream (
                    <span className="mono">GET /deletions/:id/stream</span>).
                  </p>
                </div>
                <div className="process-list">
                  {STEP_ORDER.map((key) => {
                    const st = stepMap.get(key)?.status || "PENDING";
                    const chipClass =
                      st === "SUCCEEDED" || st === "SKIPPED_CIRCUIT_OPEN"
                        ? "completed"
                        : st === "FAILED"
                          ? "failed"
                          : st === "RUNNING" || st === "RETRYING"
                            ? "retrying"
                            : "pending";
                    return (
                      <div className="process-row" key={key}>
                        <span className={`status-chip ${chipClass}`} style={{ minWidth: "5.5rem", textAlign: "center" }}>
                          {st}
                        </span>
                        <div className="process-copy">
                          <strong>{STEP_LABELS[key] || key}</strong>
                          <span className="mono">{key}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </>
          ) : (
            <article className="empty-state">
              <div>
                <h3>Awaiting submission</h3>
                <p>
                  Once the request is accepted, the generated request ID and
                  trace ID will appear here.
                </p>
              </div>
            </article>
          )}
        </aside>
      </section>
    </div>
  );
}

export default SubmitDeletion;
