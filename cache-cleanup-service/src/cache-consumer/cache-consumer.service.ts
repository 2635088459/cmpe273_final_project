import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import Redis from 'ioredis';
import {
  DeletionRequestedEvent,
  DeletionStepSucceededEvent,
  DeletionStepFailedEvent,
  EventTypes,
} from '../types/events';

const EXCHANGE_NAME = 'erasegraph.events';
const RETRY_EXCHANGE_NAME = 'erasegraph.retry';
const CONSUME_QUEUE = 'erasegraph.deletion-requests.cache-cleanup';
const RETRY_ROUTING_KEY = 'retry.cache-cleanup';
const ROUTING_KEY_STEP_SUCCEEDED = 'step.succeeded';
const ROUTING_KEY_STEP_FAILED = 'step.failed';
const SERVICE_NAME = 'cache_cleanup';
const STEP_NAME = 'cache';

/**
 * Tracks how many times we have processed each request_id.
 * Persists in memory for the lifetime of the service instance.
 * On first attempt (attempt === 1) we intentionally fail if SIMULATE_FAILURE=true.
 * On subsequent attempts we proceed normally.
 */
const attemptTracker = new Map<string, number>();

@Injectable()
export class CacheConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheConsumerService.name);
  private connection: any = null;
  private consumerChannel: any = null;
  private publisherChannel: any = null;
  private redis: Redis | null = null;

  /**
   * SIMULATE_FAILURE (default: true) — first attempt always fails intentionally.
   * Set SIMULATE_FAILURE=false in env to disable for non-demo runs.
   */
  private readonly simulateFailure: boolean;

  constructor(private configService: ConfigService) {
    const raw = this.configService.get<string>('SIMULATE_FAILURE', 'true');
    this.simulateFailure = raw !== 'false';
  }

  async onModuleInit() {
    await this.connectRedis();
    await this.connectRabbitMQ();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  // ─────────────────────────────────────────────────────────────
  // Connection helpers
  // ─────────────────────────────────────────────────────────────

  private async connectRedis() {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(url);
    this.redis.on('error', (err) => this.logger.error('Redis error', err));
    this.logger.log('Connected to Redis');
  }

  private async connectRabbitMQ() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(url);

    this.consumerChannel = await this.connection.createChannel();
    await this.consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true });
    await this.consumerChannel.prefetch(1);

    this.publisherChannel = await this.connection.createChannel();
    await this.publisherChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.publisherChannel.assertExchange(RETRY_EXCHANGE_NAME, 'topic', { durable: true });

    this.logger.log('Connected to RabbitMQ');
  }

  private async disconnect() {
    try {
      if (this.consumerChannel) await this.consumerChannel.close();
      if (this.publisherChannel) await this.publisherChannel.close();
      if (this.connection) await this.connection.close();
      if (this.redis) await this.redis.quit();
    } catch (err) {
      this.logger.error('Error during disconnect', err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Consumer loop
  // ─────────────────────────────────────────────────────────────

  private async startConsuming() {
    await this.consumerChannel.consume(
      CONSUME_QUEUE,
      async (msg: any) => {
        if (!msg) return;
        try {
          const event: DeletionRequestedEvent = JSON.parse(msg.content.toString());
          await this.processMessage(event, msg);
          this.consumerChannel.ack(msg);
        } catch (err) {
          this.logger.error('Unexpected error processing message', err);
          this.consumerChannel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.logger.log(`Consuming from ${CONSUME_QUEUE} (simulateFailure=${this.simulateFailure})`);
  }

  // ─────────────────────────────────────────────────────────────
  // Core processing — failure simulation + retry
  // ─────────────────────────────────────────────────────────────

  private async processMessage(event: DeletionRequestedEvent, _msg: any) {
    const { request_id, subject_id, trace_id } = event;

    const attempt = (attemptTracker.get(request_id) || 0) + 1;
    attemptTracker.set(request_id, attempt);

    this.logger.log(
      `Processing cache cleanup for request_id=${request_id} subject_id=${subject_id} attempt=${attempt}`,
    );

    if (this.simulateFailure && attempt === 1) {
      // ── INTENTIONAL FIRST-ATTEMPT FAILURE ──────────────────
      const errorMsg = `[SIMULATED] Cache cleanup service temporarily unavailable (attempt ${attempt})`;
      this.logger.warn(`Simulating failure for request_id=${request_id}: ${errorMsg}`);

      await this.publishFailed({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        error_message: errorMsg,
        error_code: 'CACHE_CLEANUP_SIMULATED_FAILURE',
        retry_count: attempt,
      });

      // Re-publish to retry exchange — message will sit in erasegraph.retry.cache-cleanup
      // for 30 s (TTL), then dead-letter back to erasegraph.events → cache-cleanup queue.
      this.publisherChannel.publish(
        RETRY_EXCHANGE_NAME,
        RETRY_ROUTING_KEY,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          headers: { 'trace-id': trace_id, 'retry-attempt': attempt },
        },
      );

      this.logger.log(
        `Queued retry for request_id=${request_id} — will reappear in ~30 s`,
      );
      return;
    }

    // ── ACTUAL CACHE DELETION ───────────────────────────────
    try {
      const removedKeys = await this.deleteCacheKeys(subject_id);

      this.logger.log(
        `Removed ${removedKeys.length} cache keys for subject_id=${subject_id} request_id=${request_id}`,
      );

      // Clean up tracker so memory doesn't grow unbounded
      attemptTracker.delete(request_id);

      await this.publishSucceeded({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        metadata: { cache_keys_removed: removedKeys, subject_id, attempt_number: attempt },
      });
    } catch (err: any) {
      this.logger.error(`Cache deletion failed for request_id=${request_id}`, err);

      await this.publishFailed({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        error_message: err.message || 'Unknown Redis error',
        error_code: 'CACHE_CLEANUP_REDIS_ERROR',
        retry_count: attempt,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Redis deletion
  // ─────────────────────────────────────────────────────────────

  private async deleteCacheKeys(subjectId: string): Promise<string[]> {
    if (!this.redis) throw new Error('Redis not connected');

    // Patterns that might hold user data in cache
    const patterns = [
      `user:${subjectId}`,
      `user:${subjectId}:*`,
      `session:${subjectId}:*`,
      `profile:${subjectId}`,
    ];

    const deletedKeys: string[] = [];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // SCAN for wildcard patterns (safer than KEYS in production)
        const keys = await this.scanKeys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedKeys.push(...keys);
        }
      } else {
        const deleted = await this.redis.del(pattern);
        if (deleted > 0) {
          deletedKeys.push(pattern);
        }
      }
    }

    return deletedKeys;
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, found] = await this.redis!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    return keys;
  }

  // ─────────────────────────────────────────────────────────────
  // Event publishing
  // ─────────────────────────────────────────────────────────────

  private async publishSucceeded(event: DeletionStepSucceededEvent) {
    const message = { eventType: EventTypes.DELETION_STEP_SUCCEEDED, ...event };
    this.publisherChannel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY_STEP_SUCCEEDED,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        headers: { 'event-type': EventTypes.DELETION_STEP_SUCCEEDED, 'trace-id': event.trace_id },
      },
    );
    this.logger.log(`Published DeletionStepSucceeded for request_id=${event.request_id}`);
  }

  private async publishFailed(event: DeletionStepFailedEvent) {
    const message = { eventType: EventTypes.DELETION_STEP_FAILED, ...event };
    this.publisherChannel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY_STEP_FAILED,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        headers: { 'event-type': EventTypes.DELETION_STEP_FAILED, 'trace-id': event.trace_id },
      },
    );
    this.logger.log(`Published DeletionStepFailed for request_id=${event.request_id}`);
  }
}
