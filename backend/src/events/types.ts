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
  metadata?: {
    deleted_records?: number;
    deleted_files?: string[];
    cache_keys_removed?: string[];
    backup_location?: string;
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
  metadata?: {
    [key: string]: any;
  };
}

export interface DeletionCompletedEvent {
  request_id: string;
  subject_id: string;
  trace_id: string;
  timestamp: string;
  completed_steps: string[];
  total_duration_ms: number;
}

// Union type for all events
export type DeletionEvent = 
  | DeletionRequestedEvent 
  | DeletionStepSucceededEvent 
  | DeletionStepFailedEvent
  | DeletionCompletedEvent;

// Event type constants
export const EventTypes = {
  DELETION_REQUESTED: 'DeletionRequested',
  DELETION_STEP_SUCCEEDED: 'DeletionStepSucceeded',
  DELETION_STEP_FAILED: 'DeletionStepFailed',
  DELETION_COMPLETED: 'DeletionCompleted'
} as const;

// Routing keys for RabbitMQ
export const RoutingKeys = {
  DELETION_REQUESTED: 'deletion.requested',
  DELETION_STEP_RESULT: 'deletion.step.result',
  DELETION_COMPLETED: 'deletion.completed'
} as const;