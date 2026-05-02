import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DlqReplayService } from './dlq-replay.service';
import { RedisCircuitStore } from './redis-circuit-store.service';

@Module({
  imports: [ConfigModule],
  controllers: [AdminController],
  providers: [CircuitBreakerService, DlqReplayService, RedisCircuitStore],
  exports: [CircuitBreakerService]
})
export class AdminModule {}
