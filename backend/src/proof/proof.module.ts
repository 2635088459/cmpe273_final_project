import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofEvent } from '../database/entities';
import { ProofAttestationService } from './proof-attestation.service';
import { ProofChainService } from './proof-chain.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProofEvent])],
  providers: [ProofChainService, ProofAttestationService],
  exports: [ProofChainService, ProofAttestationService],
})
export class ProofModule {}