import { Test, TestingModule } from '@nestjs/testing';
import { ProofController } from './proof.controller';
import { ProofService } from './proof.service';

describe('ProofController', () => {
  let controller: ProofController;
  let proofService: { getProofByRequestId: jest.Mock };

  beforeEach(async () => {
    proofService = {
      getProofByRequestId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProofController],
      providers: [{ provide: ProofService, useValue: proofService }],
    }).compile();

    controller = module.get<ProofController>(ProofController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates getProof to service', async () => {
    const expected = {
      request_id: 'req-1',
      events: [],
      verification_summary: { total_events: 0, services_involved: [] },
    };
    proofService.getProofByRequestId.mockResolvedValueOnce(expected);

    const result = await controller.getProof('req-1');

    expect(result).toEqual(expected);
    expect(proofService.getProofByRequestId).toHaveBeenCalledWith('req-1');
  });
});
