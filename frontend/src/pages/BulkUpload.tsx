import axios from "axios";
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import {
  bulkDeleteCsv,
  BulkDeletionResponse,
  BulkDeletionRowResult,
} from "../services/api";

function statusChipClass(status: string): string {
  if (status === "created") return "status-chip completed";
  if (status === "skipped") return "status-chip failed";
  return "status-chip pending";
}

function BulkUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<BulkDeletionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setErrorMessage("Only .csv files are accepted.");
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setErrorMessage("");
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setErrorMessage("Only .csv files are accepted.");
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setErrorMessage("");
  };

  const handleTemplateDownload = () => {
    const csv = ["subject_id", "alice", "bob", "", "alice"].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-deletion-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("Select a CSV file before uploading.");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");
    setResult(null);

    try {
      const data = await bulkDeleteCsv(selectedFile);
      setResult(data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg =
          typeof error.response?.data?.message === "string"
            ? error.response.data.message
            : Array.isArray(error.response?.data?.message)
              ? (error.response?.data?.message as string[]).join(", ")
              : "";
        setErrorMessage(msg || "Upload failed. Check that the backend is running.");
      } else {
        setErrorMessage("An unexpected error occurred during upload.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="page-grid bulk-upload-page">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Batch operations</span>
            <h1 className="bulk-hero-title">
              Upload a CSV to submit multiple deletion requests at once.
            </h1>
            <p>
              Prepare a CSV file with a <code>subject_id</code> column. Each
              unique, non-blank row creates one deletion request. Duplicates and
              blank rows are skipped and reported.
            </p>
          </div>

          <aside className="hero-side-panel">
            <span className="hero-side-label">CSV format</span>
            <div className="hero-side-value">
              Bulk <span>upload</span>
            </div>
            <p className="hero-side-copy">
              The file must have a <code>subject_id</code> column header. Each
              data row becomes one deletion request.
            </p>
            <div className="hero-side-list">
              <div className="hero-side-row">
                <div className="hero-side-step">01</div>
                <div className="hero-side-content">
                  <strong>Prepare CSV</strong>
                  <span>
                    Create a file with <code>subject_id</code> as the first row,
                    then one ID per line.
                  </span>
                </div>
              </div>
              <div className="hero-side-row">
                <div className="hero-side-step">02</div>
                <div className="hero-side-content">
                  <strong>Upload &amp; process</strong>
                  <span>
                    The backend deduplicates rows and skips blanks before
                    creating requests.
                  </span>
                </div>
              </div>
              <div className="hero-side-row">
                <div className="hero-side-step">03</div>
                <div className="hero-side-content">
                  <strong>Review results</strong>
                  <span>
                    A per-row table shows whether each row was created or
                    skipped, and why.
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
                <h2>Bulk CSV upload</h2>
                <p>
                  Only <strong>.csv</strong> files are accepted. The file must
                  contain a <code>subject_id</code> column.
                </p>
              </div>
            </div>

            <div className="field-grid">
              <div className="form-field">
                <label htmlFor="csv-file">CSV file</label>
                <input
                  id="csv-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="visually-hidden-input"
                  onChange={handleFileChange}
                />
                <div
                  className={`file-dropzone ${isDragActive ? "is-drag-active" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragActive(true);
                  }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={handleDrop}
                >
                  <div className="file-dropzone-copy">
                    <strong>
                      {selectedFile ? selectedFile.name : "Drag and drop a CSV file here"}
                    </strong>
                    <span>
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                        : "or click to choose a file from your computer"}
                    </span>
                  </div>
                  <div className="file-dropzone-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose CSV
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={handleTemplateDownload}
                    >
                      Download template
                    </button>
                  </div>
                </div>
                {selectedFile && (
                  <span className="subtle-copy file-meta">
                    Ready to upload: <strong>{selectedFile.name}</strong>
                  </span>
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="submit-feedback error" role="alert">
                <strong>Upload failed</strong>
                <span>{errorMessage}</span>
              </div>
            )}

            {result && (
              <div className="submit-feedback success" role="status">
                <strong>Upload complete</strong>
                <span>
                  {result.created} request{result.created !== 1 ? "s" : ""}{" "}
                  created, {result.skipped} row
                  {result.skipped !== 1 ? "s" : ""} skipped.
                </span>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="button-primary"
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? "Uploading…" : "Upload CSV"}
              </button>
              {(result || errorMessage) && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleReset}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </article>

        <aside className="support-grid">
          <article className="summary-card glow-card">
            <h3>CSV example</h3>
            <div className="process-list">
              <div className="process-row">
                <span className="process-index">—</span>
                <div className="process-copy">
                  <strong>subject_id</strong>
                  <span>Header row (required)</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">1</span>
                <div className="process-copy">
                  <strong>alice</strong>
                  <span>Created</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">2</span>
                <div className="process-copy">
                  <strong>bob</strong>
                  <span>Created</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">3</span>
                <div className="process-copy">
                  <strong>(blank)</strong>
                  <span>Skipped — blank</span>
                </div>
              </div>
              <div className="process-row">
                <span className="process-index">4</span>
                <div className="process-copy">
                  <strong>alice</strong>
                  <span>Skipped — duplicate</span>
                </div>
              </div>
            </div>
          </article>

          {result ? (
            <SummaryCard result={result} />
          ) : (
            <article className="empty-state">
              <div>
                <h3>Awaiting upload</h3>
                <p>
                  After uploading, a per-row results table will appear here.
                </p>
              </div>
            </article>
          )}
        </aside>
      </section>

      {result && result.rows.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <article className="form-card glow-card">
            <div className="form-shell">
              <div className="section-heading" style={{ marginBottom: "1rem" }}>
                <h2>Per-row results</h2>
                <p>
                  {result.created} created · {result.skipped} skipped ·{" "}
                  {result.rows.length} total rows processed
                </p>
              </div>
              <ResultsTable rows={result.rows} />
            </div>
          </article>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ result }: { result: BulkDeletionResponse }) {
  return (
    <article className="detail-card glow-card">
      <div className="status-detail-top">
        <div>
          <h3>Upload summary</h3>
          <p className="status-meta">Breakdown of processed rows</p>
        </div>
        <span className="status-chip completed">done</span>
      </div>
      <div className="timeline-list">
        <div className="timeline-item">
          <span className="timeline-dot" />
          <div>
            <strong>Created</strong>
            <h4 className="mono">{result.created}</h4>
          </div>
        </div>
        <div className="timeline-item">
          <span className="timeline-dot" />
          <div>
            <strong>Skipped</strong>
            <h4 className="mono">{result.skipped}</h4>
          </div>
        </div>
        <div className="timeline-item">
          <span className="timeline-dot" />
          <div>
            <strong>Request IDs</strong>
            <div>
              {result.request_ids.map((id) => (
                <p key={id} className="mono" style={{ fontSize: "0.7rem", margin: "2px 0" }}>
                  {id}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ResultsTable({ rows }: { rows: BulkDeletionRowResult[] }) {
  return (
    <div className="bulk-results-wrap">
      <table className="bulk-results-table">
        <thead>
          <tr>
            {["Row", "Subject ID", "Status", "Reason / Request ID"].map((h) => (
              <th
                key={h}
                className="bulk-results-head"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row}>
              <td className="bulk-results-cell">{row.row}</td>
              <td className="bulk-results-cell bulk-results-mono">
                {row.subject_id || <em className="bulk-results-blank">(blank)</em>}
              </td>
              <td className="bulk-results-cell">
                <span className={statusChipClass(row.status)}>{row.status}</span>
              </td>
              <td className="bulk-results-cell bulk-results-mono bulk-results-reason">
                {row.status === "created"
                  ? row.request_id
                  : row.reason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BulkUpload;
