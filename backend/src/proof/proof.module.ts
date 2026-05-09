import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofEvent } from '../database/entities';
import { ProofChainService } from './proof-chain.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProofEvent])],
  providers: [ProofChainService],
  exports: [ProofChainService],
})
export class ProofModule {}