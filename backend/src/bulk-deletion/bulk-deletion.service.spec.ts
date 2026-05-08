import { Test, TestingModule } from '@nestjs/testing';
import { BulkDeletionService } from './bulk-deletion.service';
import { DeletionRequestService } from '../deletion-request/deletion-request.service';

describe('BulkDeletionService', () => {
  let service: BulkDeletionService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn().mockImplementation((dto) =>
      Promise.resolve({
        request_id: `req-${dto.subject_id}`,
        status: 'PENDING',
        message: 'Deletion request created successfully',
        trace_id: 'trace-abc',
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkDeletionService,
        {
          provide: DeletionRequestService,
          useValue: { createDeletionRequest: mockCreate },
        },
      ],
    }).compile();

    service = module.get<BulkDeletionService>(BulkDeletionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ------------------------------------------------------------------
  // Test 1: 3 valid rows → 3 deletion requests created
  // ------------------------------------------------------------------
  it('creates 3 deletion requests for a CSV with 3 valid subject_id rows', async () => {
    const csv = Buffer.from('subject_id\nalice\nbob\ncharlie\n');

    const result = await service.processCsvBuffer(csv);

    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.request_ids).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockCreate).toHaveBeenCalledWith({ subject_id: 'alice' });
    expect(mockCreate).toHaveBeenCalledWith({ subject_id: 'bob' });
    expect(mockCreate).toHaveBeenCalledWith({ subject_id: 'charlie' });
  });

  // ------------------------------------------------------------------
  // Test 2: blank / empty rows are skipped and appear in skipped list
  // ------------------------------------------------------------------
  it('skips blank rows and reports them in the skipped list', async () => {
    const csv = Buffer.from('subject_id\nalice\n\nbob\n   \n');

    const result = await service.processCsvBuffer(csv);

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.request_ids).toHaveLength(2);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const skippedRows = result.rows.filter((r) => r.status === 'skipped');
    expect(skippedRows).toHaveLength(2);
    expect(skippedRows.every((r) => r.reason === 'blank')).toBe(true);
  });

  // ------------------------------------------------------------------
  // Test 3: duplicate subject_id rows are deduplicated
  // ------------------------------------------------------------------
  it('deduplicates duplicate subject_id rows within the same CSV', async () => {
    const csv = Buffer.from('subject_id\nalice\nbob\nalice\n');

    const result = await service.processCsvBuffer(csv);

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.request_ids).toHaveLength(2);

    // alice should only be created once
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledWith({ subject_id: 'alice' });
    expect(mockCreate).toHaveBeenCalledWith({ subject_id: 'bob' });

    const duplicateRow = result.rows.find((r) => r.reason === 'duplicate');
    expect(duplicateRow).toBeDefined();
    expect(duplicateRow!.subject_id).toBe('alice');
    expect(duplicateRow!.status).toBe('skipped');
  });

  // ------------------------------------------------------------------
  // Additional: 5-row CSV matching the integration test scenario
  // (3 valid, 1 blank, 1 duplicate)
  // ------------------------------------------------------------------
  it('handles a 5-row CSV (3 valid, 1 blank, 1 duplicate) → created:3 skipped:2', async () => {
    const csv = Buffer.from('subject_id\nuser-001\nuser-002\nuser-003\n\nuser-001\n');

    const result = await service.processCsvBuffer(csv);

    expect(result.created).toBe(3);
    expect(result.skipped).toBe(2);
    expect(result.request_ids).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});
