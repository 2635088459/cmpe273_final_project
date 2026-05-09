import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DeletionProof,
  DeletionRequest,
  ProofEvent,
  DeletionNotificationRecord,
  ProofVerifyResult,
  DeletionAttestation,
  getDeletionNotification,
  getDeletionProof,
  getDeletionAttestation,
  listDeletionRequests,
  verifyProofChain,
} from "../services/api";

const statusOptions = ["", "PENDING", "RUNNING", "COMPLETED", "PARTIAL_COMPLETED", "FAILED"];

function formatDate(value?: string | null) {
  if (!value) {
    return "Not completed";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLabel(value: string) {
  const spacedValue = value.replace(/([a-z])([A-Z])/g, "$1 $2");

  return spacedValue
    .toLowerCase()
    .split("_")
    .flatMap((part) => part.split(" "))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeRequiredServices(required: unknown): { count: number; list: string[] } {
  if (Array.isArray(required)) {
    const list = required
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return { count: list.length, list };
  }

  if (typeof required === "number" && Number.isFinite(required)) {
    return { count: required, list: [] };
  }

  if (typeof required === "string") {
    const parsed = Number(required);
    if (Number.isFinite(parsed)) {
      return { count: parsed, list: [] };
    }
  }

  return { count: 0, list: [] };
}

function buildProofExportFileName(request: DeletionRequest | null, extension: string) {
  const suffix = request?.subject_id ? `-${request.subject_id}` : "";
  return `erasegraph-proof-${request?.id || "request"}${suffix}.${extension}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintableProofHtml(
  proof: DeletionProof,
  selectedRequest: DeletionRequest
) {
  const printableEvents = [...proof.proof_events]
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    )
    .map(
      (event) => `
        <section class="event">
          <div class="meta">${escapeHtml(formatDate(event.created_at))}</div>
          <h3>${escapeHtml(formatLabel(event.service_name))}</h3>
          <p>${escapeHtml(formatLabel(event.event_type))}</p>
          <pre>${escapeHtml(JSON.stringify(event.payload, null, 2))}</pre>
        </section>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(buildProofExportFileName(selectedRequest, "pdf"))}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #111827;
          }
          h1, h2, h3 {
            margin: 0 0 8px;
          }
          .summary {
            margin: 0 0 24px;
            padding: 16px;
            border: 1px solid #d1d5db;
            border-radius: 12px;
            background: #f8fafc;
          }
          .summary p, .event p, .meta {
            margin: 6px 0;
            line-height: 1.5;
          }
          .event {
            margin-bottom: 18px;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            page-break-inside: avoid;
          }
          pre {
            white-space: pre-wrap;
            word-break: break-word;
            padding: 12px;
            border-radius: 10px;
            background: #f3f4f6;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <h1>EraseGraph Proof Export</h1>
        <section class="summary">
          <h2>Request Summary</h2>
          <p><strong>Request ID:</strong> ${escapeHtml(proof.request_id)}</p>
          <p><strong>Subject ID:</strong> ${escapeHtml(proof.subject_id)}</p>
          <p><strong>Status:</strong> ${escapeHtml(formatLabel(proof.status))}</p>
          <p><strong>Trace ID:</strong> ${escapeHtml(proof.trace_id)}</p>
          <p><strong>Succeeded Steps:</strong> ${proof.verification_summary.succeeded_steps}</p>
          <p><strong>Failed Steps:</strong> ${proof.verification_summary.failed_steps}</p>
        </section>
        ${printableEvents}
      </body>
    </html>
  `;
}

function Home() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [selectedRequest, setSelectedRequest] =
    useState<DeletionRequest | null>(null);
  const [proof, setProof] = useState<DeletionProof | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProofLoading, setIsProofLoading] = useState(false);
  const [isAttestationLoading, setIsAttestationLoading] = useState(false);
  const [proofVerify, setProofVerify] = useState<ProofVerifyResult | null>(null);
  const [notification, setNotification] = useState<DeletionNotificationRecord | null>(null);
  const [attestation, setAttestation] = useState<DeletionAttestation | null>(null);
  const [attestationError, setAttestationError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadRequests() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await listDeletionRequests({
          search: search.trim() || undefined,
          status: status || undefined,
          limit: 25,
        });

        if (!isActive) {
          return;
        }

        setRequests(data.items);

        const stillSelected = data.items.find(
          (request) => request.id === selectedRequest?.id
        );
        setSelectedRequest(stillSelected || data.items[0] || null);
      } catch (error) {
        if (isActive) {
          setErrorMessage("Unable to load deletion requests. Confirm the backend is running.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadRequests();

    return () => {
      isActive = false;
    };
  }, [search, status, selectedRequest?.id]);

  useEffect(() => {
    let isActive = true;

    async function loadAttestation(requestId: string) {
      setIsAttestationLoading(true);
      setAttestationError("");
      setAttestation(null);

      try {
        const att = await getDeletionAttestation(requestId);
        if (isActive) {
          setAttestation(att);
          setAttestationError("");
        }
      } catch (error: any) {
        if (isActive) {
          const statusCode = error?.response?.status;
          const fallback = "Attestation request failed. Please retry.";
          setAttestation(null);
          setAttestationError(
            statusCode
              ? `Attestation unavailable (HTTP ${statusCode}).`
              : fallback
          );
        }
      } finally {
        if (isActive) {
          setIsAttestationLoading(false);
        }
      }
    }

    async function loadProof() {
      if (!selectedRequest) {
        setProof(null);
        setProofVerify(null);
        setNotification(null);
        setAttestation(null);
        setAttestationError("");
        setIsAttestationLoading(false);
        return;
      }

      setIsProofLoading(true);
      setProofVerify(null);
      setNotification(null);

      try {
        const data = await getDeletionProof(selectedRequest.id);

        if (isActive) {
          setProof(data);
          setExpandedEventIds(data.proof_events.slice(0, 1).map((event) => event.id));
        }

        try {
          const verify = await verifyProofChain(selectedRequest.id);
          if (isActive) {
            setProofVerify(verify);
          }
        } catch {
          if (isActive) {
            setProofVerify(null);
          }
        }

        try {
          const note = await getDeletionNotification(selectedRequest.id);
          if (isActive) {
            setNotification(note);
          }
        } catch {
          if (isActive) {
            setNotification(null);
          }
        }

        await loadAttestation(selectedRequest.id);
      } catch (error) {
        if (isActive) {
          setProof(null);
          setExpandedEventIds([]);
          setProofVerify(null);
          setNotification(null);
          setAttestation(null);
          setAttestationError("");
          setIsAttestationLoading(false);
        }
      } finally {
        if (isActive) {
          setIsProofLoading(false);
        }
      }
    }

    loadProof();

    return () => {
      isActive = false;
    };
  }, [selectedRequest]);

  async function retryAttestation() {
    if (!selectedRequest) {
      return;
    }

    setIsAttestationLoading(true);
    setAttestationError("");
    setAttestation(null);

    try {
      const att = await getDeletionAttestation(selectedRequest.id);
      setAttestation(att);
    } catch (error: any) {
      const statusCode = error?.response?.status;
      setAttestationError(
        statusCode
          ? `Attestation unavailable (HTTP ${statusCode}).`
          : "Attestation request failed. Please retry."
      );
    } finally {
      setIsAttestationLoading(false);
    }
  }

  function toggleEvent(eventId: string) {
    setExpandedEventIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    );
  }

  function exportProofAsJson() {
    if (!proof || !selectedRequest) {
      return;
    }

    const blob = new Blob([JSON.stringify(proof, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildProofExportFileName(selectedRequest, "json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportProofAsPdf() {
    if (!proof || !selectedRequest) {
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument;

    if (!iframeWindow || !iframeDocument) {
      document.body.removeChild(iframe);
      return;
    }

    iframeDocument.open();
    iframeDocument.write(buildPrintableProofHtml(proof, selectedRequest));
    iframeDocument.close();

    const cleanup = () => {
      window.setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    };

    iframe.onload = () => {
      iframeWindow.focus();
      iframeWindow.print();
      cleanup();
    };

    window.setTimeout(() => {
      iframeWindow.focus();
      iframeWindow.print();
      cleanup();
    }, 250);
  }

  const proofEvents = proof
    ? [...proof.proof_events].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      )
    : [];

  const proofSummaryItems = proof
    ? [
        {
          label: "Services involved",
          value: String(proof.verification_summary.services_involved.length),
        },
        {
          label: "Audit events",
          value: String(proof.proof_events.length),
        },
      ]
    : [];

  const completedCount = requests.filter(
    (request) => request.status === "COMPLETED"
  ).length;
  const activeCount = requests.filter(
    (request) => request.status === "PENDING" || request.status === "RUNNING"
  ).length;
  const failedCount = requests.filter((request) => request.status === "FAILED").length;

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Deletion operations</span>
            <h1>Monitor deletion requests from intake through verification.</h1>
            <p>
              Review request status, inspect service-level progress, and keep
              proof events visible for audit and operational follow-up.
            </p>
            <div className="hero-actions">
              <Link to="/submit" className="button-primary">
                Create deletion request
              </Link>
              <button className="button-secondary" onClick={() => setSearch("")}>
                Reset search
              </button>
            </div>
          </div>

          <aside className="hero-side-panel">
            <span className="hero-side-label">Dashboard snapshot</span>
            <div className="hero-side-value">
              {requests.length || 0} <span>requests</span>
            </div>
            <p className="hero-side-copy">
              Recent deletion activity is grouped by lifecycle state so teams
              can quickly identify what completed, what is still processing, and
              what needs review.
            </p>
            <div className="metric-grid compact">
              <div className="metric-card">
                <div className="metric-copy">
                  <strong>{activeCount}</strong>
                  <p>Active</p>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-copy">
                  <strong>{completedCount}</strong>
                  <p>Completed</p>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-copy">
                  <strong>{failedCount}</strong>
                  <p>Failed</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="status-toolbar content-panel">
        <div className="section-heading">
          <h2>Request tracking</h2>
          <p>
            Search by request ID or subject ID, filter by status, and select any
            request to view proof events.
          </p>
        </div>
        <div className="status-search-row">
          <div className="input-group">
            <label htmlFor="dashboard-search">Search</label>
            <input
              id="dashboard-search"
              className="text-input"
              placeholder="Request ID or subject ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="select-group">
            <label htmlFor="dashboard-status">Status</label>
            <select
              id="dashboard-status"
              className="select-input"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option || "all"} value={option}>
                  {option ? formatLabel(option) : "All statuses"}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button-primary button-compact"
            onClick={() => {
              setSearch("");
              setStatus("");
            }}
          >
            Clear filters
          </button>
        </div>
      </section>

      {errorMessage ? (
        <div className="inline-message error" role="alert">
          <strong>Dashboard unavailable</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <section className="dashboard-layout">
        <div className="status-list">
          {isLoading ? (
            <div className="empty-state">
              <div>
                <h3>Loading requests</h3>
                <p>Fetching recent deletion activity from the backend.</p>
              </div>
            </div>
          ) : null}

          {!isLoading && requests.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>No deletion requests found</h3>
                <p>Create a request or adjust the current filters.</p>
              </div>
            </div>
          ) : null}

          {requests.map((request) => (
            <article
              key={request.id}
              className={`status-card${
                selectedRequest?.id === request.id ? " is-active" : ""
              }`}
              onClick={() => setSelectedRequest(request)}
            >
              <div className="status-card-top">
                <div>
                  <h3>{request.subject_id}</h3>
                  <p className="status-id">{request.id}</p>
                </div>
                <span className={`status-chip ${request.status.toLowerCase()}`}>
                  {formatLabel(request.status)}
                </span>
              </div>

              <div className="step-bar">
                {request.steps.map((step) => (
                  <div key={step.id} className="step-node">
                    <span className={`step-chip ${step.status.toLowerCase()}`}>
                      {formatLabel(step.status)}
                    </span>
                    <span>{formatLabel(step.step_name)}</span>
                  </div>
                ))}
              </div>

              <div className="status-card-bottom">
                <span className={`status-chip ${request.status.toLowerCase()}`}>
                  {formatLabel(request.status)}
                </span>
                <span className="status-meta">Created {formatDate(request.created_at)}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className="detail-card">
          {selectedRequest ? (
            <>
              <div className="status-detail-top">
                <div>
                  <h3>Proof and audit trail</h3>
                  <p className="status-id">{selectedRequest.id}</p>
                </div>
                <span
                  className={`status-chip ${selectedRequest.status.toLowerCase()}`}
                >
                  {formatLabel(selectedRequest.status)}
                </span>
              </div>

              {proof ? (
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-copy">
                      <strong>{proof.verification_summary.succeeded_steps}</strong>
                      <p>Succeeded steps</p>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-copy">
                      <strong>{proof.verification_summary.failed_steps}</strong>
                      <p>Failed steps</p>
                    </div>
                  </div>
                  {proofSummaryItems.map((item) => (
                    <div className="metric-card" key={item.label}>
                      <div className="metric-copy">
                        <strong>{item.value}</strong>
                        <p>{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {proof && proofVerify ? (
                <p
                  className={
                    proofVerify.valid ? "proof-chain-status proof-chain-ok" : "proof-chain-status proof-chain-bad"
                  }
                >
                  {proofVerify.valid
                    ? "Proof verified ✓ (hash chain intact)"
                    : `Proof tampered ✗ — ${proofVerify.message || "verification failed"}`}
                </p>
              ) : null}

              {isAttestationLoading || attestation || attestationError ? (
                <div className="cryptographic-attestation-card">
                  <div className="attestation-header">
                    <h4>🔐 Cryptographic Attestation (Ed25519 Signed)</h4>
                    {attestation ? (
                      <span className={attestation.signature ? "attestation-verified" : ""}>
                        {attestation.signature ? "✓ Signed" : "Unsigned"}
                      </span>
                    ) : null}
                  </div>

                  {isAttestationLoading ? (
                    <p className="attestation-loading">Loading signed attestation...</p>
                  ) : null}

                  {!isAttestationLoading && attestationError ? (
                    <div className="inline-message error">
                      <strong>Attestation unavailable</strong>
                      <span>{attestationError}</span>
                      <button className="button-secondary button-compact" onClick={retryAttestation}>
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {!isAttestationLoading && attestation ? (
                    <>
                      {(() => {
                        const required = normalizeRequiredServices(
                          attestation.operational_evidence.required_services
                        );
                        const statusServiceCount = Object.keys(
                          attestation.operational_evidence.step_statuses || {}
                        ).length;

                        return (
                          <>
                      <div className="attestation-answer">
                        <h5>Deletion Proof Question:</h5>
                        <p className="question">{attestation.answer.question}</p>
                        <p className={`answer ${attestation.answer.can_prove_deleted_across_all_systems ? "answer-yes" : "answer-no"}`}>
                          <strong>
                            {attestation.answer.can_prove_deleted_across_all_systems
                              ? "✓ YES - We can cryptographically prove deletion across all systems"
                              : "✗ NO - Cannot prove complete deletion"}
                          </strong>
                        </p>
                        <p className="rationale">{attestation.answer.rationale}</p>
                      </div>

                      <div className="attestation-grid">
                        <div className="attestation-item">
                          <span className="label">Algorithm</span>
                          <strong>{attestation.signature.algorithm}</strong>
                        </div>
                        <div className="attestation-item">
                          <span className="label">Key ID</span>
                          <code>{attestation.signature.key_id}</code>
                        </div>
                        <div className="attestation-item">
                          <span className="label">Services Verified</span>
                          <strong>{required.count || statusServiceCount}</strong>
                          <span className="attestation-subtle">
                            {statusServiceCount} services reported statuses
                          </span>
                        </div>
                        <div className="attestation-item">
                          <span className="label">Proof Events</span>
                          <strong>{attestation.total_proof_events}</strong>
                        </div>
                      </div>

                      <details className="attestation-details">
                        <summary>View Signature Details</summary>
                        <div className="signature-content">
                          <div className="signature-field">
                            <label>Signed Payload Hash (SHA256):</label>
                            <code className="hash-code">{attestation.signature.signed_payload_sha256}</code>
                          </div>
                          <div className="signature-field">
                            <label>Signature (Base64):</label>
                            <code className="sig-code">{attestation.signature.signature_base64.substring(0, 80)}...</code>
                          </div>
                          <div className="signature-field">
                            <label>Public Key (for verification):</label>
                            <code className="key-code">{attestation.verification_material.public_key_pem.substring(0, 80)}...</code>
                          </div>
                        </div>
                      </details>

                      <details className="operational-evidence-details">
                        <summary>View Operational Evidence</summary>
                        <div className="evidence-content">
                          {required.list.length > 0 ? (
                            <>
                              <h6>Required Services:</h6>
                              <div className="required-services-chips">
                                {required.list.map((service) => (
                                  <span key={service} className="service-chip">
                                    {formatLabel(service)}
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : null}
                          <h6>Services Involved:</h6>
                          <ul>
                            {Object.entries(attestation.operational_evidence.step_statuses).map(([service, status]) => (
                              <li key={service}>
                                <span className={`status-badge ${String(status).toLowerCase()}`}>{String(status)}</span>
                                <strong>{formatLabel(service)}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                </div>
              ) : null}

              {notification ? (
                <div className="notification-card">
                  <h4>Deletion notification (simulated GDPR)</h4>
                  <p className="notification-type">{notification.notification_type}</p>
                  <p className="notification-body">{notification.message}</p>
                  <p className="status-meta">
                    Delivered {formatDate(notification.delivered_at)}
                  </p>
                </div>
              ) : null}

              {proof ? (
                <div className="proof-toolbar">
                  <div className="proof-toolbar-copy">
                    <strong>Export proof package</strong>
                    <span>
                      Download the full proof record as JSON or open a print-ready PDF export.
                    </span>
                  </div>
                  <div className="proof-toolbar-actions">
                    <button className="button-secondary button-compact" onClick={exportProofAsJson}>
                      Export JSON
                    </button>
                    <button className="button-secondary button-compact" onClick={exportProofAsPdf}>
                      Export PDF
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="timeline-list">
                {isProofLoading ? (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <div>
                      <h4>Loading proof events</h4>
                      <p>Retrieving audit records for this request.</p>
                    </div>
                  </div>
                ) : null}

                {!isProofLoading && proof?.proof_events.length === 0 ? (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <div>
                      <h4>No proof events yet</h4>
                      <p>The request has been accepted but no service results have arrived.</p>
                    </div>
                  </div>
                ) : null}

                {proofEvents.map((event) => {
                  const isExpanded = expandedEventIds.includes(event.id);

                  return (
                    <div className="timeline-item timeline-item-expanded" key={event.id}>
                      <span className="timeline-dot" />
                      <div className="timeline-card">
                        <div className="timeline-card-header">
                          <div>
                            <strong>{formatDate(event.created_at)}</strong>
                            <h4>{formatLabel(event.service_name)}</h4>
                            <p>{formatLabel(event.event_type)}</p>
                          </div>
                          <button
                            className="button-secondary button-compact"
                            onClick={() => toggleEvent(event.id)}
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                        </div>

                        <div className="timeline-meta-grid">
                          <div className="timeline-meta-card">
                            <span>Action</span>
                            <strong>{formatLabel(event.event_type)}</strong>
                          </div>
                          <div className="timeline-meta-card">
                            <span>Service</span>
                            <strong>{formatLabel(event.service_name)}</strong>
                          </div>
                          <div className="timeline-meta-card">
                            <span>Result</span>
                            <strong>
                              {event.event_type.toLowerCase().includes("failed")
                                ? "Failed"
                                : "Succeeded"}
                            </strong>
                          </div>
                        </div>

                        {event.payload?.error_message ? (
                          <p className="timeline-error">
                            {event.payload.error_message}
                          </p>
                        ) : null}

                        {isExpanded ? (
                          <ProofEventDetails event={event} />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div>
                <h3>Select a request</h3>
                <p>Choose a deletion request to inspect its proof events.</p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function ProofEventDetails({ event }: { event: ProofEvent }) {
  return (
    <div className="proof-event-details">
      <div className="proof-detail-grid">
        <div className="proof-detail-card">
          <span>Timestamp</span>
          <strong>{new Date(event.created_at).toISOString()}</strong>
        </div>
        <div className="proof-detail-card">
          <span>Service</span>
          <strong>{event.service_name}</strong>
        </div>
        <div className="proof-detail-card">
          <span>Event type</span>
          <strong>{event.event_type}</strong>
        </div>
      </div>

      <div className="proof-json-viewer">
        <div className="proof-json-header">
          <strong>Payload JSON</strong>
          <span>Structured event data captured for audit verification.</span>
        </div>
        <pre className="json-block">
          <code>{JSON.stringify(event.payload, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
}

export default Home;
