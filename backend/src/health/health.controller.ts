import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthAggregatorService, ServiceStatus } from './health-aggregator.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthAggregatorService: HealthAggregatorService) {}

  @Get('all')
  @ApiOperation({ summary: 'Aggregate health check for all downstream services' })
  async checkAll(): Promise<{
    overall: string;
    services: Record<string, ServiceStatus>;
    checkedAt: string;
  }> {
    const services = await this.healthAggregatorService.checkAll();
    const allUp = Object.values(services).every((s) => s.status === 'UP');
    return {
      overall: allUp ? 'UP' : 'DEGRADED',
      services,
      checkedAt: new Date().toISOString(),
    };
  }
}
