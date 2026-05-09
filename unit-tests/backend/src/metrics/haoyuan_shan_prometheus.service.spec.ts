import { PrometheusService } from './prometheus.service';

describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(() => {
    // Construct directly — no DI dependencies needed
    service = new PrometheusService();
  });

  it('registry contains all five expected metric names', async () => {
    const output = await service.registry.metrics();
    expect(output).toContain('erasegraph_deletion_requests_total');
    expect(output).toContain('erasegraph_deletion_requests_by_status');
    expect(output).toContain('erasegraph_deletion_steps_by_status');
    expect(output).toContain('erasegraph_proof_events_total');
    expect(output).toContain('erasegraph_proof_retries_total');
  });

  it('updateMetrics sets the total deletion requests gauge', async () => {
    service.updateMetrics({
      deletion_requests: { total: 42, by_status: {} },
      deletion_steps: { by_status: {} },
      proof_events: { total: 10, retries: 2 },
    });

    const output = await service.registry.metrics();
    // prom-client appends default labels: {app="erasegraph-backend"}
    expect(output).toContain('erasegraph_deletion_requests_total{app="erasegraph-backend"} 42');
  });

  it('updateMetrics sets per-status labels for deletion requests', async () => {
    service.updateMetrics({
      deletion_requests: {
        total: 11,
        by_status: { COMPLETED: 8, FAILED: 2, PENDING: 1 },
      },
      deletion_steps: { by_status: {} },
      proof_events: { total: 0, retries: 0 },
    });

    const output = await service.registry.metrics();
    expect(output).toContain('status="COMPLETED"');
    expect(output).toContain('status="FAILED"');
    expect(output).toContain('status="PENDING"');
  });

  it('updateMetrics sets proof events total and retries', async () => {
    service.updateMetrics({
      deletion_requests: { total: 0, by_status: {} },
      deletion_steps: { by_status: {} },
      proof_events: { total: 99, retries: 7 },
    });

    const output = await service.registry.metrics();
    expect(output).toContain('erasegraph_proof_events_total{app="erasegraph-backend"} 99');
    expect(output).toContain('erasegraph_proof_retries_total{app="erasegraph-backend"} 7');
  });

  it('registry contentType is Prometheus text format', () => {
    expect(service.registry.contentType).toMatch(/text\/plain/);
  });
});
