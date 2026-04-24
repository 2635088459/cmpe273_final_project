import axios from "axios";

const API = axios.create({
  baseURL:
    process.env.REACT_APP_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    "http://localhost:3001",
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

export async function listDemoUsers(): Promise<DemoUser[]> {
  const response = await API.get<DemoUser[]>("/users");

  return response.data;
}

export async function restoreDemoUsers(): Promise<DemoUser[]> {
  const response = await API.post<DemoUser[]>("/users/restore-demo");

  return response.data;
}

export default API;
