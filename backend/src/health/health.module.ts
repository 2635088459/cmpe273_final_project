import { Module } from '@nestjs/common';
import { HealthAggregatorService } from './health-aggregator.service';
import { HealthController } from './health.controller';

@Module({
  providers: [HealthAggregatorService],
  controllers: [HealthController],
})
export class HealthAggregatorModule {}
