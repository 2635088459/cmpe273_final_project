import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DeletionRequest, DeletionRequestStatus } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

export interface SlaViolationItem {
  request_id: string;
  subject_id: string;
  stuck_since: Date;
  duration_minutes: number;
}

@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaMonitorService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(DeletionRequest)
    private readonly deletionRequestRepository: Repository<DeletionRequest>,
    @InjectRepository(ProofEvent)
    private readonly proofEventRepository: Repository<ProofEvent>,
    private readonly configService: ConfigService
  ) {}

  onModuleInit() {
    this.intervalHandle = setInterval(() => this.checkSlaViolations(), 60_000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  async checkSlaViolations(): Promise<void> {
    const thresholdMinutes = this.configService.get<number>('SLA_THRESHOLD_MINUTES', 5);
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const stuck = await this.deletionRequestRepository.find({
      where: [
        { status: DeletionRequestStatus.PENDING, created_at: LessThan(cutoff) },
        { status: DeletionRequestStatus.RUNNING, created_at: LessThan(cutoff) },
        { status: DeletionRequestStatus.PARTIAL_COMPLETED, created_at: LessThan(cutoff) }
      ]
    });

    for (const request of stuck) {
      await this.deletionRequestRepository.update(request.id, {
        status: DeletionRequestStatus.SLA_VIOLATED
      });

      const dedupe = `sla-violated-${request.id}`;
      const alreadyRecorded = await this.proofEventRepository.findOne({
        where: { dedupe_key: dedupe }
      });
      if (alreadyRecorded) continue;

      const proofEvent = this.proofEventRepository.create({
        id: uuidv4(),
        request_id: request.id,
        service_name: 'sla-monitor',
        event_type: 'SLA_VIOLATED',
        dedupe_key: dedupe,
        payload: {
          threshold_minutes: thresholdMinutes,
          stuck_since: request.created_at,
          detected_at: new Date().toISOString()
        }
      });
      await this.proofEventRepository.save(proofEvent);
      this.logger.warn(`SLA violation detected for request ${request.id}`);
    }
  }

  async getSlaViolations(): Promise<SlaViolationItem[]> {
    const requests = await this.deletionRequestRepository.find({
      where: { status: DeletionRequestStatus.SLA_VIOLATED },
      order: { created_at: 'DESC' }
    });

    const now = Date.now();
    return requests.map(r => ({
      request_id: r.id,
      subject_id: r.subject_id,
      stuck_since: r.created_at,
      duration_minutes: Math.floor((now - r.created_at.getTime()) / 60_000)
    }));
  }
}
