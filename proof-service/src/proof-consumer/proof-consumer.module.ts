import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofEvent } from '../entities';
import { ProofConsumerService } from './proof-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProofEvent])],
  providers: [ProofConsumerService],
})
export class ProofConsumerModule {}
