import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SlaMonitorService } from './sla-monitor.service';
import { DeletionRequest, DeletionRequestStatus } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

const mockDeletionRequestRepository = () => ({
  find: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn()
});

const mockProofEventRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn()
});

const mockConfigService = () => ({
  get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
    if (key === 'SLA_THRESHOLD_MINUTES') return 5;
    return defaultVal;
  })
});

describe('SlaMonitorService', () => {
  let service: SlaMonitorService;
  let deletionRequestRepo: ReturnType<typeof mockDeletionRequestRepository>;
  let proofEventRepo: ReturnType<typeof mockProofEventRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaMonitorService,
        { provide: getRepositoryToken(DeletionRequest), useFactory: mockDeletionRequestRepository },
        { provide: getRepositoryToken(ProofEvent), useFactory: mockProofEventRepository },
        { provide: ConfigService, useFactory: mockConfigService }
      ]
    }).compile();

    service = module.get<SlaMonitorService>(SlaMonitorService);
    deletionRequestRepo = module.get(getRepositoryToken(DeletionRequest));
    proofEventRepo = module.get(getRepositoryToken(ProofEvent));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkSlaViolations()', () => {
    it('flags a PENDING request stuck longer than the threshold', async () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      const stuckRequest: Partial<DeletionRequest> = {
        id: 'req-1',
        subject_id: 'user-abc',
        status: DeletionRequestStatus.PENDING,
        created_at: oldDate
      };

      deletionRequestRepo.find.mockResolvedValue([stuckRequest]);
      proofEventRepo.findOne.mockResolvedValue(null);
      proofEventRepo.create.mockReturnValue({ id: 'evt-1' });
      proofEventRepo.save.mockResolvedValue({});
      deletionRequestRepo.update.mockResolvedValue({});

      await service.checkSlaViolations();

      expect(deletionRequestRepo.update).toHaveBeenCalledWith('req-1', {
        status: DeletionRequestStatus.SLA_VIOLATED
      });
    });

    it('does not flag a COMPLETED request regardless of duration', async () => {
      // COMPLETED is not in the IN_PROGRESS query, so find() returns empty
      deletionRequestRepo.find.mockResolvedValue([]);

      await service.checkSlaViolations();

      expect(deletionRequestRepo.update).not.toHaveBeenCalled();
    });

    it('updates the status column to SLA_VIOLATED for a violating row', async () => {
      const stuckRequest: Partial<DeletionRequest> = {
        id: 'req-2',
        subject_id: 'user-xyz',
        status: DeletionRequestStatus.RUNNING,
        created_at: new Date(Date.now() - 20 * 60 * 1000)
      };

      deletionRequestRepo.find.mockResolvedValue([stuckRequest]);
      proofEventRepo.findOne.mockResolvedValue(null);
      proofEventRepo.create.mockReturnValue({ id: 'evt-2' });
      proofEventRepo.save.mockResolvedValue({});
      deletionRequestRepo.update.mockResolvedValue({});

      await service.checkSlaViolations();

      expect(deletionRequestRepo.update).toHaveBeenCalledTimes(1);
      expect(deletionRequestRepo.update).toHaveBeenCalledWith('req-2', {
        status: DeletionRequestStatus.SLA_VIOLATED
      });
    });

    it('records a ProofEvent of type SLA_VIOLATED when a violation is detected', async () => {
      const stuckRequest: Partial<DeletionRequest> = {
        id: 'req-3',
        subject_id: 'user-def',
        status: DeletionRequestStatus.PARTIAL_COMPLETED,
        created_at: new Date(Date.now() - 15 * 60 * 1000)
      };

      deletionRequestRepo.find.mockResolvedValue([stuckRequest]);
      proofEventRepo.findOne.mockResolvedValue(null);
      const mockEvent = { id: 'evt-3', event_type: 'SLA_VIOLATED' };
      proofEventRepo.create.mockReturnValue(mockEvent);
      proofEventRepo.save.mockResolvedValue(mockEvent);
      deletionRequestRepo.update.mockResolvedValue({});

      await service.checkSlaViolations();

      expect(proofEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-3',
          service_name: 'sla-monitor',
          event_type: 'SLA_VIOLATED',
          dedupe_key: 'sla-violated-req-3'
        })
      );
      expect(proofEventRepo.save).toHaveBeenCalled();
    });

    it('does not create a duplicate ProofEvent if one already exists for the same request', async () => {
      const stuckRequest: Partial<DeletionRequest> = {
        id: 'req-4',
        subject_id: 'user-dup',
        status: DeletionRequestStatus.RUNNING,
        created_at: new Date(Date.now() - 10 * 60 * 1000)
      };

      deletionRequestRepo.find.mockResolvedValue([stuckRequest]);
      // Simulate already-recorded proof event
      proofEventRepo.findOne.mockResolvedValue({ id: 'existing-evt' });
      deletionRequestRepo.update.mockResolvedValue({});

      await service.checkSlaViolations();

      expect(proofEventRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getSlaViolations()', () => {
    it('returns only SLA_VIOLATED requests', async () => {
      const violatedRequest: Partial<DeletionRequest> = {
        id: 'req-v1',
        subject_id: 'user-v',
        status: DeletionRequestStatus.SLA_VIOLATED,
        created_at: new Date(Date.now() - 30 * 60 * 1000)
      };

      deletionRequestRepo.find.mockResolvedValue([violatedRequest]);

      const result = await service.getSlaViolations();

      expect(deletionRequestRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: DeletionRequestStatus.SLA_VIOLATED }
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].request_id).toBe('req-v1');
    });

    it('returns response with request_id, subject_id, stuck_since, and duration_minutes', async () => {
      const stuckSince = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
      const violatedRequest: Partial<DeletionRequest> = {
        id: 'req-v2',
        subject_id: 'user-w',
        status: DeletionRequestStatus.SLA_VIOLATED,
        created_at: stuckSince
      };

      deletionRequestRepo.find.mockResolvedValue([violatedRequest]);

      const result = await service.getSlaViolations();

      expect(result[0]).toMatchObject({
        request_id: 'req-v2',
        subject_id: 'user-w',
        stuck_since: stuckSince
      });
      expect(typeof result[0].duration_minutes).toBe('number');
      expect(result[0].duration_minutes).toBeGreaterThanOrEqual(59);
    });

    it('returns empty array when there are no violations', async () => {
      deletionRequestRepo.find.mockResolvedValue([]);

      const result = await service.getSlaViolations();

      expect(result).toEqual([]);
    });
  });
});
