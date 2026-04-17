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

export const EventTypes = {
  DELETION_STEP_SUCCEEDED: 'DeletionStepSucceeded',
  DELETION_STEP_FAILED: 'DeletionStepFailed',
} as const;
