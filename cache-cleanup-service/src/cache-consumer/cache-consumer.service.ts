import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import Redis from 'ioredis';
import { Pool } from 'pg';
import {
  DeletionRequestedEvent,
  DeletionStepFailedEvent,
  DeletionStepRetryingEvent,
  DeletionStepSucceededEvent,
  EventTypes,
  ProofOnlyEvent,
} from '../types/events';

const EXCHANGE_NAME = 'erasegraph.events';
const RETRY_EXCHANGE_NAME = 'erasegraph.retry';
const DLQ_EXCHANGE_NAME = 'erasegraph.dlq';
const CONSUME_QUEUE = 'erasegraph.deletion-requests.cache-cleanup';
const ROUTING_KEY_STEP_SUCCEEDED = 'step.succeeded';
const ROUTING_KEY_STEP_FAILED = 'step.failed';
const ROUTING_KEY_STEP_RETRYING = 'step.retrying';
const RETRY_ROUTING_KEYS = ['retry.cache-cleanup.5s', 'retry.cache-cleanup.10s', 'retry.cache-cleanup.20s'];
const DLQ_ROUTING_KEY = 'dlq.cache-cleanup';
const SERVICE_NAME = 'cache_cleanup';
const STEP_NAME = 'cache';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5000, 10000, 20000];
const CIRCUIT_OPEN_MS = 30000;
const CIRCUIT_THRESHOLD = 3;

@Injectable()
export class CacheConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheConsumerService.name);
  private connection: any = null;
  private consumerChannel: any = null;
  private publisherChannel: any = null;
  private redis: Redis | null = null;
  private pgPool: Pool | null = null;
  private readonly simulateFailure: boolean;

  constructor(private configService: ConfigService) {
    const raw = this.configService.get<string>('SIMULATE_FAILURE', 'true');
    this.simulateFailure = raw !== 'false';
  }

  async onModuleInit() {
    await this.connectRedis();
    await this.connectPostgres();
    await this.connectRabbitMQ();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connectRedis() {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(url);
    this.redis.on('error', (err) => this.logger.error('Redis error', err));
    this.logger.log('Connected to Redis');
  }

  private async connectPostgres() {
    this.pgPool = new Pool({
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: Number(this.configService.get<number>('DB_PORT', 5434)),
      user: this.configService.get<string>('DB_USERNAME', 'erasegraph'),
      password: this.configService.get<string>('DB_PASSWORD', 'erasegraph_secret'),
      database: this.configService.get<string>('DB_DATABASE', 'erasegraph'),
    });

    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id UUID PRIMARY KEY,
        request_id UUID NOT NULL,
        service_name VARCHAR(100) NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.logger.log('Connected to Postgres for processed_events idempotency');
  }

  private async connectRabbitMQ() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(url);

    this.consumerChannel = await this.connection.createChannel();
    await this.consumerChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.consumerChannel.assertExchange(RETRY_EXCHANGE_NAME, 'topic', { durable: true });
    await this.consumerChannel.assertExchange(DLQ_EXCHANGE_NAME, 'topic', { durable: true });
    await this.assertRetryAndDlqTopology(this.consumerChannel);
    await this.consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true });
    await this.consumerChannel.prefetch(1);

    this.publisherChannel = await this.connection.createChannel();
    await this.publisherChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.publisherChannel.assertExchange(RETRY_EXCHANGE_NAME, 'topic', { durable: true });
    await this.publisherChannel.assertExchange(DLQ_EXCHANGE_NAME, 'topic', { durable: true });

    this.logger.log('Connected to RabbitMQ');
  }

  private async assertRetryAndDlqTopology(channel: any) {
    for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
      const queueName = `erasegraph.retry.cache-cleanup.${RETRY_DELAYS_MS[i] / 1000}s`;
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': RETRY_DELAYS_MS[i],
          'x-dead-letter-exchange': EXCHANGE_NAME,
          'x-dead-letter-routing-key': 'deletion.requested.cache',
        },
      });
      await channel.bindQueue(queueName, RETRY_EXCHANGE_NAME, RETRY_ROUTING_KEYS[i]);
    }

    await channel.assertQueue('erasegraph.dlq.cache-cleanup', { durable: true });
    await channel.bindQueue('erasegraph.dlq.cache-cleanup', DLQ_EXCHANGE_NAME, DLQ_ROUTING_KEY);
  }

  private async disconnect() {
    try {
      if (this.consumerChannel) await this.consumerChannel.close();
      if (this.publisherChannel) await this.publisherChannel.close();
      if (this.connection) await this.connection.close();
      if (this.redis) await this.redis.quit();
      if (this.pgPool) await this.pgPool.end();
    } catch (err) {
      this.logger.error('Error during disconnect', err);
    }
  }

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

  private async processMessage(event: DeletionRequestedEvent, msg: any) {
    const retryCount = Number(msg.properties.headers?.['retry-count'] || 0);

    if (!(await this.canProcess(retryCount))) {
      await this.publishProofOnly(EventTypes.CIRCUIT_OPEN_SKIP, event, {
        circuit_state: 'OPEN',
        retry_count: retryCount,
      });
      await this.markProcessed(event, 'skipped');
      return;
    }

    if (!(await this.tryClaimOriginalEvent(event, retryCount))) {
      await this.publishProofOnly(EventTypes.DUPLICATE_EVENT_IGNORED, event, {
        retry_count: retryCount,
        reason: 'event_id already exists in processed_events',
      });
      return;
    }

    try {
      this.assertDemoFailureIfNeeded(event, retryCount);
      const removedKeys = await this.deleteCacheKeys(event.subject_id);
      await this.recordCircuitSuccess();
      await this.markProcessed(event, 'succeeded');

      await this.publishSucceeded({
        request_id: event.request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id: event.trace_id,
        timestamp: new Date().toISOString(),
        metadata: {
          cache_keys_removed: removedKeys,
          subject_id: event.subject_id,
          retry_count: retryCount,
        },
      });
    } catch (err: any) {
      await this.recordCircuitFailure();

      const nextRetryCount = retryCount + 1;
      const errorMessage = err.message || 'Unknown cache cleanup error';

      if (nextRetryCount <= MAX_RETRIES) {
        await this.publishRetrying(event, errorMessage, nextRetryCount);
        this.publishToRetryQueue(event, nextRetryCount);
        return;
      }

      await this.markProcessed(event, 'failed');
      await this.publishFailed({
        request_id: event.request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id: event.trace_id,
        timestamp: new Date().toISOString(),
        error_message: errorMessage,
        error_code: 'CACHE_CLEANUP_MAX_RETRIES_EXCEEDED',
        retry_count: retryCount,
        metadata: { subject_id: event.subject_id },
      });
      this.publishToDlq(event, retryCount, errorMessage);
    }
  }

  private assertDemoFailureIfNeeded(event: DeletionRequestedEvent, retryCount: number) {
    if (!this.simulateFailure) return;

    if (event.subject_id.startsWith('fail-always-') || event.subject_id.startsWith('fail-open-')) {
      throw new Error(`[SIMULATED] Cache cleanup forced failure for ${event.subject_id}`);
    }

    if (event.subject_id.startsWith('fail-') && retryCount === 0) {
      throw new Error(`[SIMULATED] Cache cleanup first-attempt failure for ${event.subject_id}`);
    }
  }

  private async canProcess(retryCount: number): Promise<boolean> {
    if (retryCount > 0) return true;

    const state = await this.redis!.get(`circuit:${SERVICE_NAME}:state`);
    if (state !== 'OPEN') return true;

    const openUntil = Number((await this.redis!.get(`circuit:${SERVICE_NAME}:open_until`)) || 0);
    if (Date.now() < openUntil) return false;

    await this.redis!.set(`circuit:${SERVICE_NAME}:state`, 'HALF_OPEN');
    return true;
  }

  private async recordCircuitFailure() {
    const count = await this.redis!.incr(`circuit:${SERVICE_NAME}:failure_count`);
    if (count >= CIRCUIT_THRESHOLD) {
      await this.redis!.set(`circuit:${SERVICE_NAME}:state`, 'OPEN');
      await this.redis!.set(`circuit:${SERVICE_NAME}:open_until`, String(Date.now() + CIRCUIT_OPEN_MS), 'PX', CIRCUIT_OPEN_MS);
      this.logger.warn(`Circuit opened for ${SERVICE_NAME}`);
      return;
    }

    await this.redis!.set(`circuit:${SERVICE_NAME}:state`, 'CLOSED');
  }

  private async recordCircuitSuccess() {
    await this.redis!.set(`circuit:${SERVICE_NAME}:state`, 'CLOSED');
    await this.redis!.set(`circuit:${SERVICE_NAME}:failure_count`, '0');
    await this.redis!.del(`circuit:${SERVICE_NAME}:open_until`);
  }

  private async tryClaimOriginalEvent(
    event: DeletionRequestedEvent,
    retryCount: number,
  ): Promise<boolean> {
    if (retryCount > 0 || !event.event_id) return true;

    const result = await this.pgPool!.query(
      `
        INSERT INTO processed_events (event_id, request_id, service_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
      `,
      [event.event_id, event.request_id, SERVICE_NAME],
    );

    return result.rowCount === 1;
  }

  private async markProcessed(event: DeletionRequestedEvent, state: string) {
    if (!event.event_id) return;
    await this.redis!.set(this.processedKey(event), state, 'EX', 86400);
  }

  private processedKey(event: DeletionRequestedEvent): string {
    return `processed_event:${SERVICE_NAME}:${event.event_id}`;
  }

  private publishToRetryQueue(event: DeletionRequestedEvent, retryCount: number) {
    const delayIndex = Math.min(retryCount - 1, RETRY_ROUTING_KEYS.length - 1);
    this.publisherChannel.publish(
      RETRY_EXCHANGE_NAME,
      RETRY_ROUTING_KEYS[delayIndex],
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        headers: {
          'event-id': event.event_id,
          'trace-id': event.trace_id,
          'retry-count': retryCount,
        },
      },
    );
  }

  private publishToDlq(event: DeletionRequestedEvent, retryCount: number, errorMessage: string) {
    this.publisherChannel.publish(
      DLQ_EXCHANGE_NAME,
      DLQ_ROUTING_KEY,
      Buffer.from(JSON.stringify({ ...event, dlq_reason: errorMessage })),
      {
        persistent: true,
        headers: {
          'event-id': event.event_id,
          'trace-id': event.trace_id,
          'retry-count': retryCount,
          'dlq-reason': errorMessage,
        },
      },
    );
  }

  private async deleteCacheKeys(subjectId: string): Promise<string[]> {
    if (!this.redis) throw new Error('Redis not connected');

    const patterns = [
      `user:${subjectId}`,
      `user:${subjectId}:*`,
      `session:${subjectId}:*`,
      `profile:${subjectId}`,
    ];

    const deletedKeys: string[] = [];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await this.scanKeys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedKeys.push(...keys);
        }
      } else {
        const deleted = await this.redis.del(pattern);
        if (deleted > 0) deletedKeys.push(pattern);
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

  private async publishRetrying(
    event: DeletionRequestedEvent,
    errorMessage: string,
    retryCount: number,
  ) {
    const retryingEvent: DeletionStepRetryingEvent = {
      request_id: event.request_id,
      step_name: STEP_NAME,
      service_name: SERVICE_NAME,
      trace_id: event.trace_id,
      timestamp: new Date().toISOString(),
      error_message: errorMessage,
      retry_count: retryCount,
      next_retry_delay_ms: RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)],
      metadata: { subject_id: event.subject_id },
    };

    this.publishEvent(EventTypes.DELETION_STEP_RETRYING, ROUTING_KEY_STEP_RETRYING, retryingEvent);
  }

  private async publishSucceeded(event: DeletionStepSucceededEvent) {
    this.publishEvent(EventTypes.DELETION_STEP_SUCCEEDED, ROUTING_KEY_STEP_SUCCEEDED, event);
    this.logger.log(`Published DeletionStepSucceeded for request_id=${event.request_id}`);
  }

  private async publishFailed(event: DeletionStepFailedEvent) {
    this.publishEvent(EventTypes.DELETION_STEP_FAILED, ROUTING_KEY_STEP_FAILED, event);
    this.logger.log(`Published DeletionStepFailed for request_id=${event.request_id}`);
  }

  private async publishProofOnly(eventType: string, event: DeletionRequestedEvent, metadata: Record<string, any>) {
    const proofEvent: ProofOnlyEvent = {
      request_id: event.request_id,
      step_name: STEP_NAME,
      service_name: SERVICE_NAME,
      trace_id: event.trace_id,
      timestamp: new Date().toISOString(),
      duplicate_event_id: event.event_id,
      metadata,
    };

    this.publishEvent(eventType, ROUTING_KEY_STEP_RETRYING, proofEvent);
  }

  private publishEvent(eventType: string, routingKey: string, event: Record<string, any>) {
    const message = { eventType, ...event };
    this.publisherChannel.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      headers: {
        'event-type': eventType,
        'trace-id': event.trace_id,
      },
    });
  }
}
