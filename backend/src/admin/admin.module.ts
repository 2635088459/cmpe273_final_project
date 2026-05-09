import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DlqReplayService } from './dlq-replay.service';
import { RedisCircuitStore } from './redis-circuit-store.service';
import { SlaMonitorService } from './sla-monitor.service';
import { DeletionRequest } from '../database/entities';
import { ProofModule } from '../proof/proof.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DeletionRequest]), ProofModule],
  controllers: [AdminController],
  providers: [CircuitBreakerService, DlqReplayService, RedisCircuitStore, SlaMonitorService],
  exports: [CircuitBreakerService, SlaMonitorService]
})
export class AdminModule {}
