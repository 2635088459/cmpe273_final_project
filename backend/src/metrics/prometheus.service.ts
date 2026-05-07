import { Injectable } from '@nestjs/common';
import { Registry, Gauge } from 'prom-client';

@Injectable()
export class PrometheusService {
  readonly registry: Registry;

  private readonly deletionRequestsTotal: Gauge;
  private readonly deletionRequestsByStatus: Gauge;
  private readonly deletionStepsByStatus: Gauge;
  private readonly proofEventsTotal: Gauge;
  private readonly proofRetriesTotal: Gauge;

  constructor() {
    // Use a fresh registry (not the global default) to avoid conflicts
    this.registry = new Registry();
    this.registry.setDefaultLabels({ app: 'erasegraph-backend' });

    this.deletionRequestsTotal = new Gauge({
      name: 'erasegraph_deletion_requests_total',
      help: 'Total number of deletion requests across all statuses',
      registers: [this.registry],
    });

    this.deletionRequestsByStatus = new Gauge({
      name: 'erasegraph_deletion_requests_by_status',
      help: 'Deletion requests grouped by status (PENDING, COMPLETED, FAILED, …)',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.deletionStepsByStatus = new Gauge({
      name: 'erasegraph_deletion_steps_by_status',
      help: 'Deletion steps grouped by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.proofEventsTotal = new Gauge({
      name: 'erasegraph_proof_events_total',
      help: 'Total number of proof events recorded',
      registers: [this.registry],
    });

    this.proofRetriesTotal = new Gauge({
      name: 'erasegraph_proof_retries_total',
      help: 'Total number of RETRY proof events',
      registers: [this.registry],
    });
  }

  /**
   * Update all gauges from the JSON metrics snapshot.
   * Called by MetricsController before returning the Prometheus endpoint response.
   */
  updateMetrics(data: {
    deletion_requests: { total: number; by_status: Record<string, number> };
    deletion_steps: { by_status: Record<string, number> };
    proof_events: { total: number; retries: number };
  }): void {
    this.deletionRequestsTotal.set(data.deletion_requests.total);

    for (const [status, count] of Object.entries(
      data.deletion_requests.by_status,
    )) {
      this.deletionRequestsByStatus.labels(status).set(count);
    }

    for (const [status, count] of Object.entries(
      data.deletion_steps.by_status,
    )) {
      this.deletionStepsByStatus.labels(status).set(count);
    }

    this.proofEventsTotal.set(data.proof_events.total);
    this.proofRetriesTotal.set(data.proof_events.retries);
  }
}
