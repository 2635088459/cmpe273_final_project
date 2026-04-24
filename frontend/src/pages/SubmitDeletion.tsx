import { useState } from "react";
import API from "../services/api";

interface DeletionStep {
  step_name: string;
  status: string;
  error_message: string | null;
}

interface DeletionStatus {
  id: string;
  subject_id: string;
  status: string;
  trace_id: string;
  created_at: string;
  completed_at: string | null;
  steps: DeletionStep[];
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#16a34a",
  PENDING: "#d97706",
  FAILED: "#dc2626",
  SUCCEEDED: "#16a34a",
  IN_PROGRESS: "#2563eb",
};

function SubmitDeletion() {
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<DeletionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleSubmit = async () => {
    if (!subjectId.trim()) {
      setError("Subject ID is required");
      return;
    }
    setError(null);
    setRequestId(null);
    setStatusResult(null);
    setLoading(true);
    try {
      const res = await API.post("/deletions", { subject_id: subjectId.trim() });
      setRequestId(res.data.request_id);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to submit deletion request");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!requestId) return;
    setStatusLoading(true);
    setStatusResult(null);
    try {
      const res = await API.get(`/deletions/${requestId}`);
      setStatusResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to fetch status");
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Submit Deletion Request</h1>

      <input
        placeholder="Enter Subject ID (username or UUID)"
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        style={{ padding: "8px", width: "100%", marginBottom: "10px", boxSizing: "border-box" }}
      />
      <br />
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ padding: "8px 16px", cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? "Submitting..." : "Submit"}
      </button>

      {error && (
        <p style={{ marginTop: "10px", color: "#dc2626" }}>{error}</p>
      )}

      {requestId && (
        <div style={{ marginTop: "16px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px" }}>
          <p style={{ margin: 0, color: "#16a34a" }}>
            ✓ Request Created Successfully
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#374151" }}>
            <strong>Request ID:</strong> {requestId}
          </p>
          <button
            onClick={handleCheckStatus}
            disabled={statusLoading}
            style={{ marginTop: "10px", padding: "6px 14px", cursor: statusLoading ? "not-allowed" : "pointer" }}
          >
            {statusLoading ? "Checking..." : "Check Status"}
          </button>
        </div>
      )}

      {statusResult && (
        <div style={{ marginTop: "16px", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Overall Status: </strong>
            <span style={{ color: STATUS_COLORS[statusResult.status] || "#374151", fontWeight: "bold" }}>
              {statusResult.status}
            </span>
          </p>
          <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#6b7280" }}>
            Subject: <strong>{statusResult.subject_id}</strong>
            {statusResult.completed_at && (
              <> · Completed: {new Date(statusResult.completed_at).toLocaleTimeString()}</>
            )}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Step</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Status</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {statusResult.steps.map((step) => (
                <tr key={step.step_name}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{step.step_name}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6", color: STATUS_COLORS[step.status] || "#374151", fontWeight: "bold" }}>
                    {step.status}
                  </td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>
                    {step.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={handleCheckStatus}
            disabled={statusLoading}
            style={{ marginTop: "10px", padding: "6px 14px", cursor: statusLoading ? "not-allowed" : "pointer", fontSize: "12px" }}
          >
            {statusLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}

export default SubmitDeletion;
