import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofEvent } from '../entities';
import { ProofController } from './proof.controller';
import { ProofService } from './proof.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProofEvent])],
  controllers: [ProofController],
  providers: [ProofService],
})
export class ProofModule {}
