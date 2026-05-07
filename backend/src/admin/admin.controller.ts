import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CircuitBreakerService, CircuitSnapshot } from './circuit-breaker.service';
import { DlqReplayResult, DlqReplayService } from './dlq-replay.service';
import { SlaMonitorService, SlaViolationRow } from './sla-monitor.service';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private circuitBreakerService: CircuitBreakerService,
    private dlqReplayService: DlqReplayService,
    private slaMonitorService: SlaMonitorService,
  ) {}

  @Get('circuits')
  @ApiOperation({ summary: 'List current downstream circuit breaker states' })
  @ApiResponse({ status: 200, description: 'Current circuit states' })
  async getCircuitStates(): Promise<CircuitSnapshot[]> {
    return this.circuitBreakerService.getCircuitStates();
  }

  @Get('sla-violations')
  @ApiOperation({
    summary: 'List deletion requests flagged as SLA_VIOLATED',
    description: 'Includes request_id, subject_id, stuck_since, and duration_minutes',
  })
  @ApiResponse({ status: 200, description: 'SLA violation rows' })
  async getSlaViolations(): Promise<SlaViolationRow[]> {
    return this.slaMonitorService.listViolations();
  }

  @Post('dlq/:queue/replay')
  @ApiOperation({ summary: 'Replay supported DLQ messages back to the main event exchange' })
  @ApiParam({
    name: 'queue',
    description: 'DLQ name or alias. Supported: erasegraph.dlq.cache-cleanup, cache-cleanup'
  })
  @ApiResponse({ status: 201, description: 'DLQ messages replayed' })
  async replayDlq(@Param('queue') queue: string): Promise<DlqReplayResult> {
    return this.dlqReplayService.replay(queue);
  }
}
