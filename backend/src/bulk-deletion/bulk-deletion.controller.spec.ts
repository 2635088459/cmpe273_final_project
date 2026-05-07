import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import * as request from 'supertest';
import { BulkDeletionController } from './bulk-deletion.controller';
import { BulkDeletionService } from './bulk-deletion.service';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

describe('BulkDeletionController', () => {
  let app: INestApplication;
  let mockProcessCsvBuffer: jest.Mock;

  const mockBulkResponse = {
    created: 3,
    skipped: 2,
    request_ids: ['req-user-001', 'req-user-002', 'req-user-003'],
    rows: [
      { row: 1, subject_id: 'user-001', status: 'created', request_id: 'req-user-001' },
      { row: 2, subject_id: 'user-002', status: 'created', request_id: 'req-user-002' },
      { row: 3, subject_id: 'user-003', status: 'created', request_id: 'req-user-003' },
      { row: 4, subject_id: '', status: 'skipped', reason: 'blank' },
      { row: 5, subject_id: 'user-001', status: 'skipped', reason: 'duplicate' },
    ],
  };

  beforeEach(async () => {
    mockProcessCsvBuffer = jest.fn().mockResolvedValue(mockBulkResponse);

    const module: TestingModule = await Test.createTestingModule({
      imports: [MulterModule.register({ storage: memoryStorage() })],
      controllers: [BulkDeletionController],
      providers: [
        {
          provide: BulkDeletionService,
          useValue: { processCsvBuffer: mockProcessCsvBuffer },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Test 4: no file attached → 400 Bad Request
  // ------------------------------------------------------------------
  it('returns 400 Bad Request when no file is attached', async () => {
    const response = await request(app.getHttpServer())
      .post('/deletions/bulk')
      .expect(400);

    expect(response.body.message).toMatch(/no file uploaded/i);
  });

  // ------------------------------------------------------------------
  // Test 5: non-CSV file → 400 Bad Request
  // ------------------------------------------------------------------
  it('returns 400 Bad Request when uploading a non-CSV file', async () => {
    const response = await request(app.getHttpServer())
      .post('/deletions/bulk')
      .attach('file', Buffer.from('not,a,csv\nsome,other,data'), {
        filename: 'data.json',
        contentType: 'application/json',
      })
      .expect(400);

    expect(response.body.message).toMatch(/only csv files/i);
  });

  // ------------------------------------------------------------------
  // Test 6: valid CSV upload → 200 with created, skipped, request_ids
  // ------------------------------------------------------------------
  it('returns 200 with created, skipped, and request_ids fields for a valid CSV upload', async () => {
    const csvContent = 'subject_id\nuser-001\nuser-002\nuser-003\n\nuser-001\n';

    const response = await request(app.getHttpServer())
      .post('/deletions/bulk')
      .attach('file', Buffer.from(csvContent), {
        filename: 'test.csv',
        contentType: 'text/csv',
      })
      .expect(200);

    expect(response.body).toHaveProperty('created', 3);
    expect(response.body).toHaveProperty('skipped', 2);
    expect(response.body).toHaveProperty('request_ids');
    expect(response.body.request_ids).toHaveLength(3);
    expect(mockProcessCsvBuffer).toHaveBeenCalledTimes(1);
  });
});
