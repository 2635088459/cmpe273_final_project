export interface DeletionRequestedEvent {
  event_id: string;
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
  metadata?: {
    cache_keys_removed?: string[];
    [key: string]: any;
  };
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

export interface DeletionStepRetryingEvent {
  request_id: string;
  step_name: string;
  service_name: string;
  trace_id: string;
  timestamp: string;
  error_message: string;
  retry_count: number;
  next_retry_delay_ms: number;
  metadata?: { [key: string]: any };
}

export interface ProofOnlyEvent {
  request_id: string;
  step_name: string;
  service_name: string;
  trace_id: string;
  timestamp: string;
  duplicate_event_id?: string;
  metadata?: { [key: string]: any };
}

export const EventTypes = {
  DELETION_REQUESTED: 'DeletionRequested',
  DELETION_STEP_SUCCEEDED: 'DeletionStepSucceeded',
  DELETION_STEP_FAILED: 'DeletionStepFailed',
  DELETION_STEP_RETRYING: 'DeletionStepRetrying',
  DUPLICATE_EVENT_IGNORED: 'DUPLICATE_EVENT_IGNORED',
  CIRCUIT_OPEN_SKIP: 'CIRCUIT_OPEN_SKIP',
} as const;
