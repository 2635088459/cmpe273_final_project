import axios from "axios";

const API = axios.create({
  baseURL:
    process.env.REACT_APP_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    "http://localhost:3001",
  headers: {
    "X-Service-Token":
      process.env.REACT_APP_SERVICE_TOKEN || "Eg2026SvcInternal!",
  },
});

export type CreateDeletionRequestPayload = {
  subject_id: string;
};

export type CreateDeletionRequestResponse = {
  request_id: string;
  status: string;
  message: string;
  trace_id: string;
};

export type DeletionStep = {
  id: string;
  step_name: string;
  status: string;
  error_message?: string | null;
  updated_at: string;
};

export type DeletionRequest = {
  id: string;
  subject_id: string;
  status: string;
  trace_id: string;
  created_at: string;
  completed_at?: string | null;
  steps: DeletionStep[];
};

export type ListDeletionRequestsResponse = {
  items: DeletionRequest[];
  count: number;
};

export type ProofEvent = {
  id: string;
  service_name: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  previous_hash?: string;
  event_hash?: string;
};

export type ProofVerifyResult = {
  valid: boolean;
  verified: boolean;
  request_id: string;
  message?: string;
  broken_event_id?: string;
};

export type DeletionNotificationRecord = {
  request_id: string;
  subject_id: string;
  notification_type: string;
  message: string;
  delivered_at: string;
};

export type DeletionProof = {
  request_id: string;
  subject_id: string;
  status: string;
  trace_id: string;
  completed_at?: string | null;
  proof_events: ProofEvent[];
  verification_summary: {
    total_steps: number;
    succeeded_steps: number;
    failed_steps: number;
    services_involved: string[];
  };
};

export type DemoUser = {
  id: string;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
};

// --- Bulk CSV deletion types ---

export type BulkDeletionRowResult = {
  row: number;
  subject_id: string;
  status: "created" | "skipped";
  reason?: string;
  request_id?: string;
};

export type BulkDeletionResponse = {
  created: number;
  skipped: number;
  request_ids: string[];
  rows: BulkDeletionRowResult[];
};

export async function createDeletionRequest(
  payload: CreateDeletionRequestPayload
): Promise<CreateDeletionRequestResponse> {
  const response = await API.post<CreateDeletionRequestResponse>(
    "/deletions",
    payload
  );

  return response.data;
}

export async function listDeletionRequests(params: {
  status?: string;
  search?: string;
  limit?: number;
}): Promise<ListDeletionRequestsResponse> {
  const response = await API.get<ListDeletionRequestsResponse>("/deletions", {
    params,
  });

  return response.data;
}

export async function getDeletionProof(id: string): Promise<DeletionProof> {
  const response = await API.get<DeletionProof>(`/deletions/${id}/proof`);

  return response.data;
}

export async function verifyProofChain(id: string): Promise<ProofVerifyResult> {
  const response = await API.get<ProofVerifyResult>(`/deletions/${id}/proof/verify`);
  return response.data;
}

export async function getDeletionNotification(
  id: string
): Promise<DeletionNotificationRecord> {
  const response = await API.get<DeletionNotificationRecord>(
    `/deletions/${id}/notification`
  );
  return response.data;
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  const response = await API.get<DemoUser[]>("/users");

  return response.data;
}

export async function restoreDemoUsers(): Promise<DemoUser[]> {
  const response = await API.post<DemoUser[]>("/users/restore-demo");

  return response.data;
}

export async function bulkDeleteCsv(
  file: File
): Promise<BulkDeletionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await API.post<BulkDeletionResponse>(
    "/deletions/bulk",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export type ServiceStatus = {
  status: string;
  checkedAt?: string | null;
  lastSeenUp?: string | null;
  error?: string | null;
};

export type HealthAllResponse = {
  overall: string;
  services: Record<string, ServiceStatus>;
};

export type CircuitSnapshot = {
  service_name: string;
  state: string;
  failure_count: number;
  open_until?: number | null;
};

export async function getHealthAll(): Promise<HealthAllResponse> {
  const response = await API.get<HealthAllResponse>("/health/all");
  return response.data;
}

export type SlaViolationRow = {
  request_id: string;
  subject_id: string;
  stuck_since: string;
  duration_minutes: number;
};

export async function getSlaViolations(): Promise<SlaViolationRow[]> {
  const response = await API.get<SlaViolationRow[]>("/admin/sla-violations");
  return response.data;
}
