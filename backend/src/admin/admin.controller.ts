import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CircuitBreakerService, CircuitSnapshot } from './circuit-breaker.service';
import { DlqReplayResult, DlqReplayService } from './dlq-replay.service';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private circuitBreakerService: CircuitBreakerService,
    private dlqReplayService: DlqReplayService
  ) {}

  @Get('circuits')
  @ApiOperation({ summary: 'List current downstream circuit breaker states' })
  @ApiResponse({ status: 200, description: 'Current circuit states' })
  async getCircuitStates(): Promise<CircuitSnapshot[]> {
    return this.circuitBreakerService.getCircuitStates();
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
