import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeletionNotification,
  DeletionRequest,
  DeletionStep,
  DeletionStepStatus,
  ProofEvent,
} from '../database/entities';
import { EventPublisherService } from '../events/event-publisher.service';
import { computeProofEventHash, genesisHashForRequest } from '../proof/proof-hash.util';
import { ProofAttestationService } from '../proof/proof-attestation.service';
import { DeletionRequestService } from './deletion-request.service';

describe('DeletionRequestService', () => {
  let service: DeletionRequestService;
  let deletionRequestRepository: any;
  let deletionStepRepository: any;
  let proofEventRepository: any;
  let deletionNotificationRepository: any;
  let eventPublisher: any;
  let proofAttestationService: any;

  beforeEach(async () => {
    deletionRequestRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(),
      findOne: jest.fn(),
      exist: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    deletionStepRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    };

    proofEventRepository = {
      find: jest.fn(),
    };

    deletionNotificationRepository = {
      findOne: jest.fn(),
    };

    eventPublisher = {
      publishDeletionRequested: jest.fn(),
      publishDeletionCompleted: jest.fn(),
      publishDeletionFailed: jest.fn(),
    };

    proofAttestationService = {
      getPublicKey: jest.fn().mockReturnValue({
        key_id: 'k1',
        algorithm: 'Ed25519',
        public_key_pem: 'pem',
      }),
      signPayload: jest.fn().mockReturnValue({
        algorithm: 'Ed25519',
        key_id: 'k1',
        signature_base64: 'sig',
        signed_payload_sha256: 'digest',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletionRequestService,
        { provide: getRepositoryToken(DeletionRequest), useValue: deletionRequestRepository },
        { provide: getRepositoryToken(DeletionStep), useValue: deletionStepRepository },
        { provide: getRepositoryToken(ProofEvent), useValue: proofEventRepository },
        { provide: getRepositoryToken(DeletionNotification), useValue: deletionNotificationRepository },
        { provide: EventPublisherService, useValue: eventPublisher },
        { provide: ProofAttestationService, useValue: proofAttestationService },
      ],
    }).compile();

    service = module.get(DeletionRequestService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createDeletionRequest creates request, creates 5 steps, and publishes event', async () => {
    deletionRequestRepository.save.mockResolvedValueOnce({
      id: 'req-1',
      subject_id: 'u-1',
      trace_id: 'trace-1',
    });
    deletionStepRepository.save.mockResolvedValueOnce(undefined);
    eventPublisher.publishDeletionRequested.mockResolvedValueOnce(undefined);

    const result = await service.createDeletionRequest({ subject_id: 'u-1' });

    expect(result.request_id).toBe('req-1');
    expect(result.status).toBe('PENDING');
    expect(result.message).toMatch(/created/i);

    expect(deletionStepRepository.create).toHaveBeenCalledTimes(5);
    expect(eventPublisher.publishDeletionRequested).toHaveBeenCalledTimes(1);

    const eventArg = eventPublisher.publishDeletionRequested.mock.calls[0][0];
    expect(eventArg.request_id).toBe('req-1');
    expect(eventArg.subject_id).toBe('u-1');
    expect(eventArg.trace_id).toBe(result.trace_id);
  });

  it('verifyProofChain returns success when request has no proof events', async () => {
    deletionRequestRepository.findOne.mockResolvedValueOnce({ id: 'req-2' });
    proofEventRepository.find.mockResolvedValueOnce([]);

    const result = await service.verifyProofChain('req-2');

    expect(result.valid).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.message).toBe('no_proof_events');
  });

  it('verifyProofChain returns mismatch when event hash is tampered', async () => {
    const requestId = 'req-3';
    const ts = '2026-05-09T01:02:03.000Z';
    const payload = { step_name: 'cache', timestamp: ts };
    const previousHash = genesisHashForRequest(requestId);

    deletionRequestRepository.findOne.mockResolvedValueOnce({ id: requestId });
    proofEventRepository.find.mockResolvedValueOnce([
      {
        id: 'evt-1',
        request_id: requestId,
        service_name: 'cache_cleanup',
        event_type: 'DeletionStepSucceeded',
        payload,
        created_at: new Date(ts),
        previous_hash: previousHash,
        event_hash: computeProofEventHash(
          previousHash,
          requestId,
          'cache_cleanup',
          'DeletionStepSucceeded',
          payload,
          ts,
        ),
      },
      {
        id: 'evt-2',
        request_id: requestId,
        service_name: 'backup',
        event_type: 'DeletionStepSucceeded',
        payload,
        created_at: new Date(ts),
        previous_hash: 'broken-previous-hash',
        event_hash: 'broken-event-hash',
      },
    ]);

    const result = await service.verifyProofChain(requestId);

    expect(result.valid).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.message).toBe('previous_hash_mismatch');
    expect(result.broken_event_id).toBe('evt-2');
  });

  it('getDeletionNotification throws when notification row is missing', async () => {
    deletionRequestRepository.findOne.mockResolvedValueOnce({ id: 'req-4' });
    deletionNotificationRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.getDeletionNotification('req-4')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getDeletionAttestation sets can_prove_deleted_across_all_systems true on completed success path', async () => {
    const requestId = 'req-5';
    const now = new Date('2026-05-09T12:00:00.000Z');

    deletionRequestRepository.findOne.mockResolvedValueOnce({
      id: requestId,
      subject_id: 'u-5',
      trace_id: 'tr-5',
      status: 'COMPLETED',
      completed_at: now,
      steps: [
        { step_name: 'primary_data', status: DeletionStepStatus.SUCCEEDED, error_message: null, updated_at: now },
        { step_name: 'cache', status: DeletionStepStatus.SUCCEEDED, error_message: null, updated_at: now },
        { step_name: 'search_cleanup', status: DeletionStepStatus.SUCCEEDED, error_message: null, updated_at: now },
        { step_name: 'analytics_cleanup', status: DeletionStepStatus.SUCCEEDED, error_message: null, updated_at: now },
        { step_name: 'backup', status: DeletionStepStatus.SUCCEEDED, error_message: null, updated_at: now },
      ],
      proof_events: [],
    });

    jest.spyOn(service, 'verifyProofChain').mockResolvedValueOnce({
      valid: true,
      verified: true,
      request_id: requestId,
    });

    const report = await service.getDeletionAttestation(requestId);

    expect(report.answer).toBeDefined();
    expect((report.answer as Record<string, unknown>).can_prove_deleted_across_all_systems).toBe(true);
    expect(report.signature).toBeDefined();
    expect(proofAttestationService.signPayload).toHaveBeenCalledTimes(1);
  });
});
