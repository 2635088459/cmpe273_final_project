import { Controller, Get, Param } from '@nestjs/common';
import { ProofService } from './proof.service';

@Controller('proof')
export class ProofController {
  constructor(private readonly proofService: ProofService) {}

  @Get(':requestId')
  async getProof(@Param('requestId') requestId: string) {
    return this.proofService.getProofByRequestId(requestId);
  }
}
