import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeletionRequestStatus, DeletionStepStatus } from '../../database/entities';

export class ListDeletionRequestsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter requests by overall status',
    enum: DeletionRequestStatus
  })
  @IsOptional()
  @IsEnum(DeletionRequestStatus)
  status?: DeletionRequestStatus;

  @ApiPropertyOptional({
    description: 'Filter requests by exact subject ID'
  })
  @IsOptional()
  @IsString()
  subject_id?: string;

  @ApiPropertyOptional({
    description: 'Search by request ID or subject ID'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of requests to return',
    default: 25,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export class DeletionRequestListItemStepDto {
  @ApiPropertyOptional({ description: 'Unique step identifier' })
  id: string;

  @ApiPropertyOptional({ description: 'Step name' })
  step_name: string;

  @ApiPropertyOptional({
    description: 'Current step status',
    enum: DeletionStepStatus
  })
  status: DeletionStepStatus;

  @ApiPropertyOptional({ description: 'Error message if the step failed' })
  error_message?: string;

  @ApiPropertyOptional({ description: 'Last update timestamp' })
  updated_at: Date;
}

export class DeletionRequestListItemDto {
  @ApiPropertyOptional({ description: 'Unique deletion request identifier' })
  id: string;

  @ApiPropertyOptional({ description: 'Subject ID being deleted' })
  subject_id: string;

  @ApiPropertyOptional({
    description: 'Overall request status',
    enum: DeletionRequestStatus
  })
  status: DeletionRequestStatus;

  @ApiPropertyOptional({ description: 'Distributed tracing ID' })
  trace_id: string;

  @ApiPropertyOptional({ description: 'Request creation timestamp' })
  created_at: Date;

  @ApiPropertyOptional({ description: 'Completion timestamp' })
  completed_at?: Date;

  @ApiPropertyOptional({
    description: 'Deletion steps for this request',
    type: [DeletionRequestListItemStepDto]
  })
  steps: DeletionRequestListItemStepDto[];
}

export class ListDeletionRequestsResponseDto {
  @ApiPropertyOptional({
    description: 'Returned deletion requests',
    type: [DeletionRequestListItemDto]
  })
  items: DeletionRequestListItemDto[];

  @ApiPropertyOptional({ description: 'Number of returned requests' })
  count: number;
}
