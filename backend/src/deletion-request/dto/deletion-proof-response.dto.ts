import { ApiProperty } from '@nestjs/swagger';

export class ProofEventDto {
  @ApiProperty({ description: 'Unique proof event identifier' })
  id: string;

  @ApiProperty({ description: 'Service that generated this event' })
  service_name: string;

  @ApiProperty({ description: 'Type of event (e.g., "DeletionStepSucceeded", "DeletionStepFailed")' })
  event_type: string;

  @ApiProperty({ description: 'Event payload with service-specific data' })
  payload: any;

  @ApiProperty({ description: 'Event creation timestamp' })
  created_at: Date;
}

export class DeletionProofResponseDto {
  @ApiProperty({ description: 'Deletion request ID' })
  request_id: string;

  @ApiProperty({ description: 'Subject ID that was deleted' })
  subject_id: string;

  @ApiProperty({ description: 'Overall deletion status' })
  status: string;

  @ApiProperty({ description: 'Distributed tracing ID for cross-service verification' })
  trace_id: string;

  @ApiProperty({ description: 'Request completion timestamp' })
  completed_at: Date;

  @ApiProperty({ 
    description: 'Chronological list of proof events from all services',
    type: [ProofEventDto]
  })
  proof_events: ProofEventDto[];

  @ApiProperty({ description: 'Summary of verification results' })
  verification_summary: {
    total_steps: number;
    succeeded_steps: number;
    failed_steps: number;
    services_involved: string[];
  };
}