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
  ParseUUIDPipe,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
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

  @Get(':id/notification')
  @ApiOperation({
    summary: 'GDPR-style deletion notification record',
    description: 'Returns the simulated user notification written when the workflow completes or fails',
  })
  @ApiParam({ name: 'id', description: 'Deletion request UUID' })
  @ApiResponse({ status: 200, description: 'Notification record' })
  @ApiResponse({ status: 404, description: 'Request or notification not found' })
  async getDeletionNotification(@Param('id', ParseUUIDPipe) id: string) {
    return this.deletionRequestService.getDeletionNotification(id);
  }

  @Sse(':id/stream')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Server-Sent Events stream of deletion progress',
    description: 'Pushes step updates until the request reaches COMPLETED or FAILED',
  })
  @ApiParam({ name: 'id', description: 'Deletion request UUID' })
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  async streamDeletionProgress(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observable<MessageEvent>> {
    await this.deletionRequestService.ensureDeletionRequestExists(id);
    return this.deletionRequestService.observeDeletionProgress(id);
  }

  @Get('proof/public-key')
  @ApiOperation({
    summary: 'Get proof attestation public key',
    description: 'Returns the public key used to verify signed deletion attestation reports',
  })
  @ApiResponse({ status: 200, description: 'Proof attestation public key' })
  async getProofPublicKey() {
    return this.deletionRequestService.getProofPublicKey();
  }

  @Get(':id/proof/verify')
  @ApiOperation({
    summary: 'Verify tamper-evident proof hash chain',
    description: 'Recomputes hashes for all proof events for this request',
  })
  @ApiParam({ name: 'id', description: 'Deletion request UUID' })
  @ApiResponse({ status: 200, description: 'Verification outcome' })
  async verifyProof(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.deletionRequestService.verifyProofChain(id);
    return result;
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
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DeletionProofResponseDto> {
    return this.deletionRequestService.getDeletionProof(id);
  }

  @Get(':id/proof/attestation')
  @ApiOperation({
    summary: 'Get signed deletion attestation report',
    description:
      'Returns a signed, tamper-resistant report with cryptographic hash-chain verification and operational evidence across required cleanup services',
  })
  @ApiParam({
    name: 'id',
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed deletion attestation report',
  })
  async getDeletionAttestation(@Param('id', ParseUUIDPipe) id: string) {
    return this.deletionRequestService.getDeletionAttestation(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get deletion request status',
    description: 'Retrieves the current status and progress of a deletion request',
  })
  @ApiParam({
    name: 'id',
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion request details',
    type: DeletionRequestResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Deletion request not found',
  })
  async getDeletionRequest(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DeletionRequestResponseDto> {
    return this.deletionRequestService.getDeletionRequest(id);
  }
}
