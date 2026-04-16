import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionRequest, DeletionStep, ProofEvent } from '../database/entities';
import { DeletionRequestController } from './deletion-request.controller';
import { DeletionRequestService } from './deletion-request.service';
import { EventPublisherService } from '../events/event-publisher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeletionRequest, DeletionStep, ProofEvent])
  ],
  controllers: [DeletionRequestController],
  providers: [DeletionRequestService, EventPublisherService],
  exports: [DeletionRequestService]
})
export class DeletionRequestModule {}