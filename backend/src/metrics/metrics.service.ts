import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeletionRequest } from '../database/entities/deletion-request.entity';
import { DeletionStep } from '../database/entities/deletion-step.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(DeletionRequest)
    private deletionRequestRepo: Repository<DeletionRequest>,
    @InjectRepository(DeletionStep)
    private deletionStepRepo: Repository<DeletionStep>,
    @InjectRepository(ProofEvent)
    private proofEventRepo: Repository<ProofEvent>,
  ) {}

  async getMetrics() {
    const [requestsByStatus, stepsByStatus, totalProofEvents, retryEvents] =
      await Promise.all([
        this.deletionRequestRepo
          .createQueryBuilder('dr')
          .select('dr.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('dr.status')
          .getRawMany(),
        this.deletionStepRepo
          .createQueryBuilder('ds')
          .select('ds.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('ds.status')
          .getRawMany(),
        this.proofEventRepo.count(),
        this.proofEventRepo
          .createQueryBuilder('pe')
          .where('pe.event_type = :type', { type: 'RETRY' })
          .getCount(),
      ]);

    const totalRequests = requestsByStatus.reduce(
      (sum: number, row: { status: string; count: string }) =>
        sum + parseInt(row.count, 10),
      0,
    );

    return {
      deletion_requests: {
        total: totalRequests,
        by_status: requestsByStatus.reduce(
          (
            acc: Record<string, number>,
            row: { status: string; count: string },
          ) => {
            acc[row.status] = parseInt(row.count, 10);
            return acc;
          },
          {},
        ),
      },
      deletion_steps: {
        by_status: stepsByStatus.reduce(
          (
            acc: Record<string, number>,
            row: { status: string; count: string },
          ) => {
            acc[row.status] = parseInt(row.count, 10);
            return acc;
          },
          {},
        ),
      },
      proof_events: {
        total: totalProofEvents,
        retries: retryEvents,
      },
      collected_at: new Date().toISOString(),
    };
  }
}
