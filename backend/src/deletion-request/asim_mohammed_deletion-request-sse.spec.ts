import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeletionRequestController } from './deletion-request.controller';
import { DeletionRequestService } from './deletion-request.service';
import {
  DeletionRequest,
  DeletionStep,
  ProofEvent,
  DeletionNotification,
} from '../database/entities';
import { EventPublisherService } from '../events/event-publisher.service';

const sampleId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('DeletionRequestController (SSE)', () => {
  let app: INestApplication;
  let mockEnsure: jest.Mock;
  let mockObserve: jest.Mock;

  beforeEach(async () => {
    mockEnsure = jest.fn().mockResolvedValue(undefined);
    mockObserve = jest.fn().mockReturnValue(
      new Observable<MessageEvent>((sub) => {
        sub.next({ data: JSON.stringify({ status: 'PENDING', steps: [] }) } as MessageEvent);
        sub.complete();
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeletionRequestController],
      providers: [
        {
          provide: DeletionRequestService,
          useValue: {
            ensureDeletionRequestExists: mockEnsure,
            observeDeletionProgress: mockObserve,
          },
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

  it('GET /deletions/:id/stream responds with Content-Type text/event-stream', async () => {
    await request(app.getHttpServer())
      .get(`/deletions/${sampleId}/stream`)
      .expect(200)
      .expect('Content-Type', /text\/event-stream/i);

    expect(mockEnsure).toHaveBeenCalledWith(sampleId);
    expect(mockObserve).toHaveBeenCalledWith(sampleId);
  });

  it('returns 404 immediately when the request id does not exist', async () => {
    mockEnsure.mockRejectedValueOnce(new NotFoundException('missing'));

    await request(app.getHttpServer()).get(`/deletions/${sampleId}/stream`).expect(404);

    expect(mockObserve).not.toHaveBeenCalled();
  });
});

describe('DeletionRequestService.observeDeletionProgress', () => {
  let service: DeletionRequestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletionRequestService,
        { provide: getRepositoryToken(DeletionRequest), useValue: {} },
        { provide: getRepositoryToken(DeletionStep), useValue: {} },
        { provide: getRepositoryToken(ProofEvent), useValue: {} },
        { provide: getRepositoryToken(DeletionNotification), useValue: {} },
        { provide: EventPublisherService, useValue: {} },
      ],
    }).compile();

    service = module.get(DeletionRequestService);
  });

  it('emits an update when deletion step snapshot changes', async () => {
    jest.useFakeTimers();
    const dtoBase = {
      id: sampleId,
      subject_id: 'u1',
      trace_id: 'tr',
      created_at: new Date().toISOString(),
      completed_at: null as string | null,
    };
    jest
      .spyOn(service, 'getDeletionRequest')
      .mockResolvedValueOnce({
        ...dtoBase,
        status: 'RUNNING',
        steps: [{ id: '1', step_name: 'primary_data', status: 'RUNNING', updated_at: '2026-05-07T10:00:00.000Z' }],
      } as any)
      .mockResolvedValueOnce({
        ...dtoBase,
        status: 'RUNNING',
        steps: [
          { id: '1', step_name: 'primary_data', status: 'SUCCEEDED', updated_at: '2026-05-07T10:00:01.000Z' },
        ],
      } as any)
      .mockResolvedValue({
        ...dtoBase,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        steps: [
          { id: '1', step_name: 'primary_data', status: 'SUCCEEDED', updated_at: '2026-05-07T10:00:01.000Z' },
        ],
      } as any);

    const payloads: string[] = [];
    const sub = service.observeDeletionProgress(sampleId).subscribe({
      next: (e) => {
        if (!(e as MessageEvent).type) {
          payloads.push(String((e as MessageEvent).data));
        }
      },
    });

    await Promise.resolve();
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    sub.unsubscribe();
    jest.useRealTimers();

    expect(payloads.length).toBeGreaterThanOrEqual(2);
    const second = JSON.parse(payloads[1]);
    expect(second.steps[0].status).toBe('SUCCEEDED');
  });

  it('sends event type done and completes when status is COMPLETED', async () => {
    jest.useFakeTimers();
    const dtoBase = {
      id: sampleId,
      subject_id: 'u99',
      trace_id: 'tr',
      created_at: new Date().toISOString(),
      completed_at: null as string | null,
    };
    jest.spyOn(service, 'getDeletionRequest').mockResolvedValue({
      ...dtoBase,
      status: 'COMPLETED',
      steps: [],
    } as any);

    const doneEvents: MessageEvent[] = [];
    const sub = service.observeDeletionProgress(sampleId).subscribe({
      next: (e) => {
        if ((e as MessageEvent).type === 'done') {
          doneEvents.push(e as MessageEvent);
        }
      },
      error: () => undefined,
    });

    await Promise.resolve();
    jest.advanceTimersByTime(600);
    await Promise.resolve();

    sub.unsubscribe();
    jest.useRealTimers();

    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].type).toBe('done');
  });

  it('sends event type done when status is FAILED', async () => {
    jest.useFakeTimers();
    jest.spyOn(service, 'getDeletionRequest').mockResolvedValue({
      id: sampleId,
      subject_id: 'u',
      status: 'FAILED',
      trace_id: 't',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      steps: [],
    } as any);

    const doneTypes: string[] = [];
    const sub = service.observeDeletionProgress(sampleId).subscribe({
      next: (e) => {
        if ((e as MessageEvent).type) {
          doneTypes.push(String((e as MessageEvent).type));
        }
      },
    });

    await Promise.resolve();
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    sub.unsubscribe();
    jest.useRealTimers();

    expect(doneTypes).toContain('done');
  });
});
