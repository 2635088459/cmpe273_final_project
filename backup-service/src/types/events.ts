export interface DeletionRequestedEvent {
  request_id: string;
  subject_id: string;
  trace_id: string;
  timestamp: string;
  requested_by?: string;
}

export interface DeletionStepSucceededEvent {
  request_id: string;
  step_name: string;
  service_name: string;
  trace_id: string;
  timestamp: string;
  metadata?: { [key: string]: any };
}

export interface DeletionStepFailedEvent {
  request_id: string;
  step_name: string;
  service_name: string;
  trace_id: string;
  timestamp: string;
  error_message: string;
  error_code?: string;
  retry_count?: number;
  metadata?: { [key: string]: any };
}

export const EventTypes = {
  DELETION_REQUESTED: 'DeletionRequested',
  DELETION_STEP_SUCCEEDED: 'DeletionStepSucceeded',
  DELETION_STEP_FAILED: 'DeletionStepFailed',
} as const;
