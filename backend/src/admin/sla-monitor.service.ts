import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DeletionRequest, DeletionRequestStatus } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

/**
 * Shape returned by {@link SlaMonitorService.getSlaViolations} and surfaced
 * by the `GET /admin/sla-violations` admin endpoint.
 *
 * `duration_minutes` is computed at read time (not stored), so the value
 * keeps increasing on every call until the request leaves the
 * `SLA_VIOLATED` status (e.g. because workers eventually completed it,
 * or operators replayed the DLQ).
 */
export interface SlaViolationItem {
  request_id: string;
  subject_id: string;
  stuck_since: Date;
  duration_minutes: number;
}

/**
 * Background scanner that flips silent stalls into visible SLA violations.
 *
 * On a 60-second tick, the service queries `deletion_requests` for rows in
 * a non-terminal status (`PENDING`, `RUNNING`, `PARTIAL_COMPLETED`) that
 * are older than the configured `SLA_THRESHOLD_MINUTES`. Matching rows
 * are updated to `SLA_VIOLATED` and a deduplicated `SLA_VIOLATED` proof
 * event is appended to the audit chain.
 *
 * Design notes:
 *  - Read-only against the message bus (never publishes a RabbitMQ event).
 *  - Per-request deduplication via `dedupe_key = sla-violated-<id>` so a
 *    long stall produces a single audit event, not one per scanner tick.
 *  - Self-healing: once a request reaches a terminal state, it leaves the
 *    `SLA_VIOLATED` list naturally — no manual dismiss endpoint exists.
 *
 * See `project-docs/design-docs/sla_monitoring_architecture.md` for the
 * full design rationale, state transitions, and failure modes.
 */
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

  /**
   * Starts the 60-second scan loop when the module boots. We use a plain
   * `setInterval` rather than `@nestjs/schedule` because a single fixed-rate
   * timer doesn't justify pulling in a scheduling library and its
   * `ScheduleModule` import.
   */
  onModuleInit() {
    this.intervalHandle = setInterval(() => this.checkSlaViolations(), 60_000);
  }

  /**
   * Clears the scan loop on module shutdown. Without this, Jest test
   * teardown leaves the interval handle alive and `--forceExit` is the
   * only way to make the test process exit.
   */
  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /**
   * One scan pass. Looks for any request in `PENDING`/`RUNNING`/
   * `PARTIAL_COMPLETED` whose `created_at` is older than the SLA threshold
   * and flips it to `SLA_VIOLATED`, writing a single audit event per
   * request.
   *
   * Exposed (not private) so it can be invoked directly from unit tests
   * without waiting for the interval.
   */
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

  /**
   * Returns all requests currently in `SLA_VIOLATED` status, ordered by
   * most recently created first. `duration_minutes` is computed against
   * the current wall clock at call time — it intentionally is not stored
   * so the value reflects how long the request has been stuck *right now*.
   *
   * Returns an empty array (not throws) when there are no violations, so
   * the frontend admin panel can render a reassuring empty state.
   */
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
