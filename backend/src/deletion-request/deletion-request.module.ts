import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionRequest, DeletionStep, ProofEvent, ProcessedEvent, DeletionNotification } from '../database/entities';
import { ProofModule } from '../proof/proof.module';
import { DeletionRequestController } from './deletion-request.controller';
import { DeletionRequestService } from './deletion-request.service';
import { DataDiscoveryService } from './data-discovery.service';
import { EventPublisherService } from '../events/event-publisher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeletionRequest, DeletionStep, ProofEvent, ProcessedEvent, DeletionNotification]),
    ProofModule,
  ],
  controllers: [DeletionRequestController],
  providers: [DeletionRequestService, DataDiscoveryService, EventPublisherService],
  exports: [DeletionRequestService]
})
export class DeletionRequestModule {}
