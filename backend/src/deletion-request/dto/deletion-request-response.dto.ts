import { ApiProperty } from '@nestjs/swagger';
import { DeletionRequestStatus, DeletionStepStatus } from '../../database/entities';

export class DeletionStepResponseDto {
  @ApiProperty({ description: 'Unique step identifier' })
  id: string;

  @ApiProperty({ description: 'Step name (e.g., "primary_data", "cache")' })
  step_name: string;

  @ApiProperty({ 
    description: 'Current step status', 
    enum: DeletionStepStatus 
  })
  status: DeletionStepStatus;

  @ApiProperty({ description: 'Error message if step failed', required: false })
  error_message?: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;
}

export class DeletionRequestResponseDto {
  @ApiProperty({ description: 'Unique deletion request identifier' })
  id: string;

  @ApiProperty({ description: 'Subject ID being deleted' })
  subject_id: string;

  @ApiProperty({ 
    description: 'Overall request status', 
    enum: DeletionRequestStatus 
  })
  status: DeletionRequestStatus;

  @ApiProperty({ description: 'Distributed tracing ID' })
  trace_id: string;

  @ApiProperty({ description: 'Request creation timestamp' })
  created_at: Date;

  @ApiProperty({ description: 'Completion timestamp', required: false })
  completed_at?: Date;

  @ApiProperty({ 
    description: 'Deletion steps progress',
    type: [DeletionStepResponseDto]
  })
  steps: DeletionStepResponseDto[];
}

export class DeletionRequestCreatedDto {
  @ApiProperty({ description: 'Created deletion request ID' })
  request_id: string;

  @ApiProperty({ description: 'Initial status', default: 'PENDING' })
  status: string;

  @ApiProperty({ description: 'Message confirmation' })
  message: string;

  @ApiProperty({ description: 'Distributed tracing ID for following the request' })
  trace_id: string;
}
