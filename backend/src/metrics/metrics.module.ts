import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionRequest } from '../database/entities/deletion-request.entity';
import { DeletionStep } from '../database/entities/deletion-step.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { PrometheusService } from './prometheus.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeletionRequest, DeletionStep, ProofEvent])],
  providers: [MetricsService, PrometheusService],
  controllers: [MetricsController],
})
export class MetricsModule {}
