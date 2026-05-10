import { Test, TestingModule } from '@nestjs/testing';
import { DeletionRequestController } from './deletion-request.controller';
import { DeletionRequestService } from './deletion-request.service';

describe('DeletionRequestController', () => {
  let controller: DeletionRequestController;
  let deletionRequestService: any;

  beforeEach(async () => {
    deletionRequestService = {
      createDeletionRequest: jest.fn(),
      listDeletionRequests: jest.fn(),
      getDeletionRequest: jest.fn(),
      getDeletionProof: jest.fn(),
      verifyProofChain: jest.fn(),
      getProofPublicKey: jest.fn(),
      getDeletionAttestation: jest.fn(),
      getDeletionNotification: jest.fn(),
      ensureDeletionRequestExists: jest.fn(),
      observeDeletionProgress: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeletionRequestController],
      providers: [{ provide: DeletionRequestService, useValue: deletionRequestService }],
    }).compile();

    controller = module.get<DeletionRequestController>(DeletionRequestController);
  });

  afterEach(() => jest.clearAllMocks());

  it('createDeletionRequest delegates to service', async () => {
    const dto = { subject_id: 'u-1' };
    const expected = {
      request_id: 'req-1',
      status: 'PENDING',
      message: 'ok',
      trace_id: 'trace-1',
    };
    deletionRequestService.createDeletionRequest.mockResolvedValueOnce(expected);

    const result = await controller.createDeletionRequest(dto as any);

    expect(result).toEqual(expected);
    expect(deletionRequestService.createDeletionRequest).toHaveBeenCalledWith(dto);
  });

  it('listDeletionRequests delegates to service with query filters', async () => {
    const query = { status: 'FAILED', search: 'abc', limit: 5 };
    const expected = { items: [], count: 0 };
    deletionRequestService.listDeletionRequests.mockResolvedValueOnce(expected);

    const result = await controller.listDeletionRequests(query as any);

    expect(result).toEqual(expected);
    expect(deletionRequestService.listDeletionRequests).toHaveBeenCalledWith(query);
  });

  it('verifyProof delegates to verifyProofChain', async () => {
    const expected = { valid: true, verified: true, request_id: 'req-10' };
    deletionRequestService.verifyProofChain.mockResolvedValueOnce(expected);

    const result = await controller.verifyProof('req-10');

    expect(result).toEqual(expected);
    expect(deletionRequestService.verifyProofChain).toHaveBeenCalledWith('req-10');
  });

  it('getDeletionAttestation delegates to service', async () => {
    const expected = { report_version: 'v1' };
    deletionRequestService.getDeletionAttestation.mockResolvedValueOnce(expected);

    const result = await controller.getDeletionAttestation('req-11');

    expect(result).toEqual(expected);
    expect(deletionRequestService.getDeletionAttestation).toHaveBeenCalledWith('req-11');
  });

  it('getProofPublicKey delegates to service', async () => {
    const expected = {
      key_id: 'k1',
      algorithm: 'Ed25519',
      public_key_pem: 'pem',
    };
    deletionRequestService.getProofPublicKey.mockResolvedValueOnce(expected);

    const result = await controller.getProofPublicKey();

    expect(result).toEqual(expected);
    expect(deletionRequestService.getProofPublicKey).toHaveBeenCalledTimes(1);
  });

  it('getDeletionNotification delegates to service', async () => {
    const expected = {
      request_id: 'req-12',
      subject_id: 'u-12',
      notification_type: 'EMAIL',
      message: 'ok',
      delivered_at: new Date('2026-05-09T00:00:00.000Z'),
    };
    deletionRequestService.getDeletionNotification.mockResolvedValueOnce(expected);

    const result = await controller.getDeletionNotification('req-12');

    expect(result).toEqual(expected);
    expect(deletionRequestService.getDeletionNotification).toHaveBeenCalledWith('req-12');
  });
});
