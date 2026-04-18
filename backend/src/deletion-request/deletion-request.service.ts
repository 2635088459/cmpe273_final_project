import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { 
  DeletionRequest, 
  DeletionStep, 
  ProofEvent, 
  DeletionRequestStatus,
  DeletionStepStatus 
} from '../database/entities';
import { 
  CreateDeletionRequestDto,
  DeletionRequestResponseDto,
  DeletionRequestCreatedDto,
  DeletionProofResponseDto 
} from './dto';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class DeletionRequestService {
  private readonly logger = new Logger(DeletionRequestService.name);

  constructor(
    @InjectRepository(DeletionRequest)
    private deletionRequestRepository: Repository<DeletionRequest>,
    @InjectRepository(DeletionStep)
    private deletionStepRepository: Repository<DeletionStep>,
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
    private eventPublisher: EventPublisherService
  ) {}

  async createDeletionRequest(dto: CreateDeletionRequestDto): Promise<DeletionRequestCreatedDto> {
    const traceId = uuidv4();
    
    this.logger.log(`Creating deletion request for subject: ${dto.subject_id}, trace: ${traceId}`);

    // Create the main deletion request
    const deletionRequest = this.deletionRequestRepository.create({
      subject_id: dto.subject_id,
      status: DeletionRequestStatus.PENDING,
      trace_id: traceId
    });

    const savedRequest = await this.deletionRequestRepository.save(deletionRequest);

    // Create initial deletion steps
    const steps = [
      { request_id: savedRequest.id, step_name: 'primary_data' },
      { request_id: savedRequest.id, step_name: 'cache' },
      { request_id: savedRequest.id, step_name: 'backup' }
    ];

    const deletionSteps = steps.map(step => 
      this.deletionStepRepository.create({
        ...step,
        status: DeletionStepStatus.PENDING
      })
    );

    await this.deletionStepRepository.save(deletionSteps);

    // Publish deletion requested event
    await this.eventPublisher.publishDeletionRequested({
      request_id: savedRequest.id,
      subject_id: dto.subject_id,
      trace_id: traceId,
      timestamp: new Date().toISOString()
    });

    this.logger.log(`Deletion request created: ${savedRequest.id}`);

    return {
      request_id: savedRequest.id,
      status: 'PENDING',
      message: 'Deletion request created successfully',
      trace_id: traceId
    };
  }

  async getDeletionRequest(id: string): Promise<DeletionRequestResponseDto> {
    const request = await this.deletionRequestRepository.findOne({
      where: { id },
      relations: ['steps']
    });

    if (!request) {
      throw new NotFoundException(`Deletion request with ID ${id} not found`);
    }

    return {
      id: request.id,
      subject_id: request.subject_id,
      status: request.status,
      trace_id: request.trace_id,
      created_at: request.created_at,
      completed_at: request.completed_at,
      steps: request.steps.map(step => ({
        id: step.id,
        step_name: step.step_name,
        status: step.status,
        error_message: step.error_message,
        updated_at: step.updated_at
      }))
    };
  }

  async getDeletionProof(id: string): Promise<DeletionProofResponseDto> {
    const request = await this.deletionRequestRepository.findOne({
      where: { id },
      relations: ['steps', 'proof_events']
    });

    if (!request) {
      throw new NotFoundException(`Deletion request with ID ${id} not found`);
    }

    const succeededSteps = request.steps.filter(step => step.status === DeletionStepStatus.SUCCEEDED).length;
    const failedSteps = request.steps.filter(step => step.status === DeletionStepStatus.FAILED).length;
    
    const servicesInvolved = Array.from(
      new Set(request.proof_events.map(event => event.service_name))
    );

    return {
      request_id: request.id,
      subject_id: request.subject_id,
      status: request.status,
      trace_id: request.trace_id,
      completed_at: request.completed_at,
      proof_events: request.proof_events.map(event => ({
        id: event.id,
        service_name: event.service_name,
        event_type: event.event_type,
        payload: event.payload,
        created_at: event.created_at
      })),
      verification_summary: {
        total_steps: request.steps.length,
        succeeded_steps: succeededSteps,
        failed_steps: failedSteps,
        services_involved: servicesInvolved
      }
    };
  }

  async updateStepStatus(
    requestId: string, 
    stepName: string, 
    status: DeletionStepStatus, 
    errorMessage?: string
  ): Promise<void> {
    await this.deletionStepRepository.update(
      { request_id: requestId, step_name: stepName },
      { 
        status, 
        error_message: errorMessage
      }
    );

    // Check if all steps are completed to update the main request
    await this.updateRequestStatusIfNeeded(requestId);

    this.logger.log(`Updated step ${stepName} for request ${requestId} to ${status}`);
  }

  private async updateRequestStatusIfNeeded(requestId: string): Promise<void> {
    const steps = await this.deletionStepRepository.find({
      where: { request_id: requestId }
    });

    const allCompleted = steps.every(step => 
      step.status === DeletionStepStatus.SUCCEEDED || step.status === DeletionStepStatus.FAILED
    );

    if (allCompleted) {
      const hasFailures = steps.some(step => step.status === DeletionStepStatus.FAILED);
      const newStatus = hasFailures ? DeletionRequestStatus.FAILED : DeletionRequestStatus.COMPLETED;
      
      await this.deletionRequestRepository.update(requestId, {
        status: newStatus,
        completed_at: new Date()
      });

      this.logger.log(`Request ${requestId} marked as ${newStatus}`);
    }
  }
}