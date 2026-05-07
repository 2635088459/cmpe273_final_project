import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, QueryFailedError } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DeletionRequest, DeletionRequestStatus } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';
import { EventTypes } from '../events/types';
import { computeProofEventHash, genesisHashForRequest } from '../proof/proof-hash.util';

const SLA_SERVICE_NAME = 'sla_monitor';

export type SlaViolationRow = {
  request_id: string;
  subject_id: string;
  stuck_since: string;
  duration_minutes: number;
};

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    @InjectRepository(DeletionRequest)
    private readonly deletionRequestRepository: Repository<DeletionRequest>,
    @InjectRepository(ProofEvent)
    private readonly proofEventRepository: Repository<ProofEvent>,
    private readonly configService: ConfigService,
  ) {}

  /** Every 30s so demos with SLA_THRESHOLD_MINUTES=1 do not wait a full wall-clock minute. */
  @Cron(process.env.SLA_CRON_EXPRESSION || '*/30 * * * * *')
  async scanCron(): Promise<void> {
    await this.checkSlaViolations();
  }

  async listViolations(): Promise<SlaViolationRow[]> {
    const rows = await this.deletionRequestRepository.find({
      where: { status: DeletionRequestStatus.SLA_VIOLATED },
      order: { created_at: 'ASC' },
    });

    const now = Date.now();
    return rows.map((r) => ({
      request_id: r.id,
      subject_id: r.subject_id,
      stuck_since: r.created_at.toISOString(),
      duration_minutes: Math.floor((now - r.created_at.getTime()) / 60_000),
    }));
  }

  async checkSlaViolations(): Promise<number> {
    const thresholdMin = Number(this.configService.get('SLA_THRESHOLD_MINUTES') ?? 5);
    const thresholdMs = thresholdMin * 60 * 1000;
    const cutoff = new Date(Date.now() - thresholdMs);

    const candidates = await this.deletionRequestRepository
      .createQueryBuilder('r')
      .where('r.status IN (:...statuses)', {
        statuses: [
          DeletionRequestStatus.PENDING,
          DeletionRequestStatus.RUNNING,
          DeletionRequestStatus.PARTIAL_COMPLETED,
        ],
      })
      .andWhere('r.created_at < :cutoff', { cutoff })
      .getMany();

    let flagged = 0;
    for (const row of candidates) {
      const did = await this.flagViolation(row);
      if (did) {
        flagged += 1;
      }
    }
    return flagged;
  }

  private async flagViolation(req: DeletionRequest): Promise<boolean> {
    const upd = await this.deletionRequestRepository.update(
      {
        id: req.id,
        status: In([
          DeletionRequestStatus.PENDING,
          DeletionRequestStatus.RUNNING,
          DeletionRequestStatus.PARTIAL_COMPLETED,
        ]),
      },
      { status: DeletionRequestStatus.SLA_VIOLATED },
    );

    if (!upd.affected) {
      return false;
    }

    try {
      await this.appendSlaProofEvent(req.id);
    } catch (err) {
      this.logger.error(`Failed to record SLA proof for ${req.id}`, err);
    }

    this.logger.warn(`SLA_VIOLATED for request ${req.id} (subject_id=${req.subject_id})`);
    return true;
  }

  private async appendSlaProofEvent(requestId: string): Promise<void> {
    const timestampIso = new Date().toISOString();
    const thresholdMin = Number(this.configService.get('SLA_THRESHOLD_MINUTES') ?? 5);
    const dedupeKey = `${requestId}:${SLA_SERVICE_NAME}:${EventTypes.SLA_VIOLATED}`;
    const payload: Record<string, unknown> = {
      timestamp: timestampIso,
      threshold_minutes: thresholdMin,
      message: 'Deletion workflow exceeded configured SLA time',
    };

    const last = await this.proofEventRepository
      .createQueryBuilder('p')
      .where('p.request_id = :rid', { rid: requestId })
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .getOne();

    const previous_hash =
      last?.event_hash && last.event_hash.length > 0
        ? last.event_hash
        : genesisHashForRequest(requestId);

    const event_hash = computeProofEventHash(
      previous_hash,
      requestId,
      SLA_SERVICE_NAME,
      EventTypes.SLA_VIOLATED,
      payload,
      timestampIso,
    );

    try {
      await this.proofEventRepository.save({
        request_id: requestId,
        service_name: SLA_SERVICE_NAME,
        event_type: EventTypes.SLA_VIOLATED,
        dedupe_key: dedupeKey,
        payload,
        previous_hash,
        event_hash,
        created_at: new Date(timestampIso),
      } as ProofEvent);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error as { driverError?: { code?: string } }).driverError?.code;
        if (code === '23505') {
          return;
        }
      }
      throw error;
    }
  }
}
