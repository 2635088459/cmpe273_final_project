import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Sse
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { DeletionRequestService } from './deletion-request.service';
import { 
  CreateDeletionRequestDto,
  DeletionRequestCreatedDto,
  DeletionRequestResponseDto,
  DeletionProofResponseDto,
  ListDeletionRequestsQueryDto,
  ListDeletionRequestsResponseDto
} from './dto';

@ApiTags('Deletion Requests')
@Controller('deletions')
export class DeletionRequestController {
  constructor(private readonly deletionRequestService: DeletionRequestService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Create a new deletion request',
    description: 'Initiates a verifiable deletion process for the specified subject ID'
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Deletion request created successfully',
    type: DeletionRequestCreatedDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request payload'
  })
  async createDeletionRequest(
    @Body(ValidationPipe) dto: CreateDeletionRequestDto
  ): Promise<DeletionRequestCreatedDto> {
    return this.deletionRequestService.createDeletionRequest(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List deletion requests',
    description: 'Returns recent deletion requests with optional filtering and search for dashboard use'
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by request status' })
  @ApiQuery({ name: 'subject_id', required: false, description: 'Filter by exact subject ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by request ID or subject ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of requests to return' })
  @ApiResponse({
    status: 200,
    description: 'Filtered list of deletion requests',
    type: ListDeletionRequestsResponseDto
  })
  async listDeletionRequests(
    @Query(ValidationPipe) query: ListDeletionRequestsQueryDto
  ): Promise<ListDeletionRequestsResponseDto> {
    return this.deletionRequestService.listDeletionRequests(query);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get deletion request status',
    description: 'Retrieves the current status and progress of a deletion request'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Deletion request details',
    type: DeletionRequestResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Deletion request not found'
  })
  async getDeletionRequest(
    @Param('id') id: string
  ): Promise<DeletionRequestResponseDto> {
    return this.deletionRequestService.getDeletionRequest(id);
  }

  @Sse(':id/stream')
  @ApiOperation({
    summary: 'Stream real-time deletion request status updates via Server-Sent Events',
  })
  @ApiParam({ name: 'id', description: 'Deletion request UUID' })
  streamDeletionStatus(@Param('id') id: string): Observable<MessageEvent> {
    const TERMINAL = ['COMPLETED', 'FAILED'];
    return new Observable<MessageEvent>((observer) => {
      let handle: ReturnType<typeof setInterval>;

      const poll = async () => {
        try {
          const request = await this.deletionRequestService.getDeletionRequest(id);
          observer.next({ data: request } as MessageEvent);
          if (TERMINAL.includes(request.status)) {
            observer.complete();
            clearInterval(handle);
          }
        } catch (err) {
          observer.error(err);
          clearInterval(handle);
        }
      };

      poll();
      handle = setInterval(poll, 1500);
      return () => clearInterval(handle);
    });
  }

  @Get(':id/proof')
  @ApiOperation({
    summary: 'Get deletion proof and audit trail',
    description: 'Retrieves the complete audit trail and proof events for a deletion request'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Deletion proof and audit trail',
    type: DeletionProofResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Deletion request not found'
  })
  async getDeletionProof(
    @Param('id') id: string
  ): Promise<DeletionProofResponseDto> {
    return this.deletionRequestService.getDeletionProof(id);
  }
}
