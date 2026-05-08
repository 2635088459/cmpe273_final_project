export interface BulkDeletionRowResult {
  row: number;
  subject_id: string;
  status: 'created' | 'skipped';
  reason?: string;
  request_id?: string;
}

export interface BulkDeletionResponseDto {
  created: number;
  skipped: number;
  request_ids: string[];
  rows: BulkDeletionRowResult[];
}
