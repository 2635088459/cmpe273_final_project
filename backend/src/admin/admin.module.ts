import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DlqReplayService } from './dlq-replay.service';
import { RedisCircuitStore } from './redis-circuit-store.service';
import { SlaMonitorService } from './sla-monitor.service';
import { DeletionRequest } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DeletionRequest, ProofEvent])],
  controllers: [AdminController],
  providers: [CircuitBreakerService, DlqReplayService, RedisCircuitStore, SlaMonitorService],
  exports: [CircuitBreakerService, SlaMonitorService]
})
export class AdminModule {}
