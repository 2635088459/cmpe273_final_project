import { Injectable, Logger, MessageEvent, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DeletionRequest,
  DeletionStep,
  ProofEvent,
  DeletionRequestStatus,
  DeletionStepStatus,
  DeletionNotification,
} from '../database/entities';
import { computeProofEventHash, genesisHashForRequest } from '../proof/proof-hash.util';
import { 
  CreateDeletionRequestDto,
  DeletionRequestResponseDto,
  DeletionRequestCreatedDto,
  DeletionProofResponseDto,
  ListDeletionRequestsQueryDto,
  ListDeletionRequestsResponseDto
} from './dto';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class DeletionRequestService {
  private readonly logger = new Logger(DeletionRequestService.name);

  private static readonly FAST_STEP_NAMES = [
    'primary_data',
    'cache',
    'search_cleanup',
    'backup',
  ] as const;

  constructor(
    @InjectRepository(DeletionRequest)
    private deletionRequestRepository: Repository<DeletionRequest>,
    @InjectRepository(DeletionStep)
    private deletionStepRepository: Repository<DeletionStep>,
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
    @InjectRepository(DeletionNotification)
    private deletionNotificationRepository: Repository<DeletionNotification>,
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

    // Create initial deletion steps (Member 2: search, delayed analytics, backup)
    const steps = [
      { request_id: savedRequest.id, step_name: 'primary_data' },
      { request_id: savedRequest.id, step_name: 'cache' },
      { request_id: savedRequest.id, step_name: 'search_cleanup' },
      { request_id: savedRequest.id, step_name: 'analytics_cleanup' },
      { request_id: savedRequest.id, step_name: 'backup' },
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
      event_id: uuidv4(),
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

  async listDeletionRequests(
    query: ListDeletionRequestsQueryDto
  ): Promise<ListDeletionRequestsResponseDto> {
    const limit = query.limit ?? 25;

    const queryBuilder = this.deletionRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.steps', 'steps')
      .orderBy('request.created_at', 'DESC')
      .addOrderBy('steps.updated_at', 'ASC')
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('request.status = :status', { status: query.status });
    }

    if (query.subject_id) {
      queryBuilder.andWhere('request.subject_id = :subjectId', {
        subjectId: query.subject_id
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('request.id::text ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'request.subject_id ILIKE :search',
            { search: `%${query.search}%` }
          );
        })
      );
    }

    const requests = await queryBuilder.getMany();

    return {
      items: requests.map((request) => ({
        id: request.id,
        subject_id: request.subject_id,
        status: request.status,
        trace_id: request.trace_id,
        created_at: request.created_at,
        completed_at: request.completed_at,
        steps: request.steps.map((step) => ({
          id: step.id,
          step_name: step.step_name,
          status: step.status,
          error_message: step.error_message,
          updated_at: step.updated_at
        }))
      })),
      count: requests.length
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
      relations: ['steps', 'proof_events'],
      order: {
        proof_events: {
          created_at: 'ASC'
        }
      }
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
      proof_events: request.proof_events.map((event) => ({
        id: event.id,
        service_name: event.service_name,
        event_type: event.event_type,
        payload: event.payload,
        created_at: event.created_at,
        previous_hash: event.previous_hash ?? undefined,
        event_hash: event.event_hash ?? undefined,
      })),
      verification_summary: {
        total_steps: request.steps.length,
        succeeded_steps: succeededSteps,
        failed_steps: failedSteps,
        services_involved: servicesInvolved
      }
    };
  }

  async verifyProofChain(id: string): Promise<{
    valid: boolean;
    verified: boolean;
    request_id: string;
    message?: string;
    broken_event_id?: string;
  }> {
    const request = await this.deletionRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Deletion request with ID ${id} not found`);
    }

    const events = await this.proofEventRepository.find({
      where: { request_id: id },
      order: { created_at: 'ASC', id: 'ASC' },
    });

    if (events.length === 0) {
      return { valid: true, verified: true, request_id: id, message: 'no_proof_events' };
    }

    let expectedPrevious = genesisHashForRequest(id);

    for (const e of events) {
      if (!e.event_hash || e.previous_hash == null) {
        return {
          valid: false,
          verified: false,
          request_id: id,
          message: 'incomplete_chain_or_legacy_row',
          broken_event_id: e.id,
        };
      }

      if (e.previous_hash !== expectedPrevious) {
        return {
          valid: false,
          verified: false,
          request_id: id,
          message: 'previous_hash_mismatch',
          broken_event_id: e.id,
        };
      }

      const ts =
        (e.payload && typeof e.payload.timestamp === 'string' && e.payload.timestamp) ||
        new Date(e.created_at).toISOString();

      const expectedHash = computeProofEventHash(
        expectedPrevious,
        e.request_id,
        e.service_name,
        e.event_type,
        e.payload,
        ts
      );

      if (expectedHash !== e.event_hash) {
        return {
          valid: false,
          verified: false,
          request_id: id,
          message: 'event_hash_mismatch',
          broken_event_id: e.id,
        };
      }

      expectedPrevious = e.event_hash;
    }

    return { valid: true, verified: true, request_id: id };
  }

  async getDeletionNotification(id: string): Promise<{
    request_id: string;
    subject_id: string;
    notification_type: string;
    message: string;
    delivered_at: Date;
  }> {
    const request = await this.deletionRequestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Deletion request with ID ${id} not found`);
    }

    const row = await this.deletionNotificationRepository.findOne({
      where: { request_id: id },
      order: { delivered_at: 'DESC' },
    });

    if (!row) {
      throw new NotFoundException(`No deletion notification recorded yet for request ${id}`);
    }

    return {
      request_id: row.request_id,
      subject_id: row.subject_id,
      notification_type: row.notification_type,
      message: row.message,
      delivered_at: row.delivered_at,
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
        error_message: errorMessage ?? null
      }
    );

    // Check if all steps are completed to update the main request
    await this.updateRequestStatusIfNeeded(requestId);

    this.logger.log(`Updated step ${stepName} for request ${requestId} to ${status}`);
  }

  private async updateRequestStatusIfNeeded(requestId: string): Promise<void> {
    const before = await this.deletionRequestRepository.findOne({ where: { id: requestId } });
    if (!before) {
      return;
    }

    const steps = await this.deletionStepRepository.find({
      where: { request_id: requestId },
    });

    const terminal = (step: DeletionStep) =>
      step.status === DeletionStepStatus.SUCCEEDED ||
      step.status === DeletionStepStatus.FAILED ||
      step.status === DeletionStepStatus.SKIPPED_CIRCUIT_OPEN;

    const analytics = steps.find((s) => s.step_name === 'analytics_cleanup');
    const allCompleted = steps.length > 0 && steps.every(terminal);

    if (!allCompleted && analytics) {
      const fastDone = DeletionRequestService.FAST_STEP_NAMES.every((name) => {
        const s = steps.find((x) => x.step_name === name);
        return s && terminal(s);
      });
      const analyticsDone = terminal(analytics);
      if (fastDone && !analyticsDone && before.status !== DeletionRequestStatus.PARTIAL_COMPLETED) {
        await this.deletionRequestRepository.update(requestId, {
          status: DeletionRequestStatus.PARTIAL_COMPLETED,
        });
        this.logger.log(`Request ${requestId} marked PARTIAL_COMPLETED (awaiting analytics)`);
      }
      return;
    }

    if (!allCompleted) {
      return;
    }

    const hasFailures = steps.some((step) => step.status === DeletionStepStatus.FAILED);
    const hasSkipped = steps.some((step) => step.status === DeletionStepStatus.SKIPPED_CIRCUIT_OPEN);
    const newStatus = hasFailures
      ? DeletionRequestStatus.FAILED
      : hasSkipped
        ? DeletionRequestStatus.PARTIAL_COMPLETED
        : DeletionRequestStatus.COMPLETED;

    if (before.status === newStatus) {
      return;
    }

    await this.deletionRequestRepository.update(requestId, {
      status: newStatus,
      completed_at: new Date(),
    });

    this.logger.log(`Request ${requestId} marked as ${newStatus}`);

    const completedStepNames = steps
      .filter(
        (s) =>
          s.status === DeletionStepStatus.SUCCEEDED ||
          s.status === DeletionStepStatus.SKIPPED_CIRCUIT_OPEN
      )
      .map((s) => s.step_name);
    const failedStepNames = steps
      .filter((s) => s.status === DeletionStepStatus.FAILED)
      .map((s) => s.step_name);

    if (newStatus === DeletionRequestStatus.FAILED) {
      const errors = steps
        .filter((s) => s.status === DeletionStepStatus.FAILED && s.error_message)
        .map((s) => `${s.step_name}: ${s.error_message}`)
        .join('; ');
      await this.eventPublisher.publishDeletionFailed({
        request_id: requestId,
        subject_id: before.subject_id,
        trace_id: before.trace_id || '',
        reason: errors || 'One or more deletion steps failed',
        failed_steps: failedStepNames,
      });
    } else {
      await this.eventPublisher.publishDeletionCompleted({
        request_id: requestId,
        subject_id: before.subject_id,
        trace_id: before.trace_id || '',
        completed_steps: completedStepNames,
        status: newStatus,
      });
    }
  }

  async ensureDeletionRequestExists(id: string): Promise<void> {
    const found = await this.deletionRequestRepository.exist({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Deletion request with ID ${id} not found`);
    }
  }

  observeDeletionProgress(requestId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let stopped = false;
      const cleanup = () => {
        stopped = true;
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      let lastSig = '';

      const tick = async () => {
        if (stopped) {
          return;
        }
        try {
          const dto = await this.getDeletionRequest(requestId);
          const sig = JSON.stringify({
            st: dto.status,
            steps: dto.steps.map((s) => [s.step_name, s.status, s.updated_at]),
          });
          if (sig !== lastSig) {
            lastSig = sig;
            subscriber.next({
              data: JSON.stringify({
                status: dto.status,
                subject_id: dto.subject_id,
                steps: dto.steps,
              }),
            } as MessageEvent);
          }
          if (
            dto.status === DeletionRequestStatus.COMPLETED ||
            dto.status === DeletionRequestStatus.FAILED
          ) {
            subscriber.next({
              type: 'done',
              data: JSON.stringify({ status: dto.status }),
            } as MessageEvent);
            subscriber.complete();
            cleanup();
          }
        } catch (err) {
          subscriber.error(err);
          cleanup();
        }
      };

      void (async () => {
        await tick();
        if (stopped) {
          return;
        }
        intervalId = setInterval(() => {
          void tick();
        }, 500);
      })();

      return cleanup;
    });
  }
}
