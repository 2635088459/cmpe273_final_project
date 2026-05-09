import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Pool } from 'pg';
import {
  DeletionRequestedEvent,
  DeletionStepFailedEvent,
  DeletionStepSucceededEvent,
  EventTypes,
} from '../types/events';

const EXCHANGE_NAME = 'erasegraph.events';
const CONSUME_QUEUE = 'erasegraph.deletion-requests.analytics-cleanup';
const ROUTING_KEY_STEP_SUCCEEDED = 'step.succeeded';
const ROUTING_KEY_STEP_FAILED = 'step.failed';
const SERVICE_NAME = 'analytics_cleanup';
const STEP_NAME = 'analytics_cleanup';

@Injectable()
export class AnalyticsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsConsumerService.name);
  private connection: any = null;
  private consumerChannel: any = null;
  private publisherChannel: any = null;
  private pgPool: Pool | null = null;
  private readonly delayMs: number;

  constructor(private configService: ConfigService) {
    this.delayMs = Number(this.configService.get<string>('ANALYTICS_DELAY_MS') || '7000');
  }

  async onModuleInit() {
    await this.connectPostgres();
    await this.connectRabbitMQ();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connectPostgres() {
    this.pgPool = new Pool({
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: Number(this.configService.get<number>('DB_PORT', 5434)),
      user: this.configService.get<string>('DB_USERNAME', 'erasegraph'),
      password: this.configService.get<string>('DB_PASSWORD', 'erasegraph_secret'),
      database: this.configService.get<string>('DB_DATABASE', 'erasegraph'),
    });

    await this.pgPool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subject_id VARCHAR(100) NOT NULL,
        event_payload JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    this.logger.log('Postgres ready for analytics_events');
  }

  private async connectRabbitMQ() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(url);
    this.consumerChannel = await this.connection.createChannel();
    await this.consumerChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true });
    await this.consumerChannel.bindQueue(CONSUME_QUEUE, EXCHANGE_NAME, 'deletion.requested');
    await this.consumerChannel.prefetch(1);

    this.publisherChannel = await this.connection.createChannel();
    await this.publisherChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    this.logger.log('Connected to RabbitMQ (analytics cleanup)');
  }

  private async disconnect() {
    try {
      if (this.consumerChannel) await this.consumerChannel.close();
      if (this.publisherChannel) await this.publisherChannel.close();
      if (this.connection) await this.connection.close();
      if (this.pgPool) await this.pgPool.end();
    } catch (err) {
      this.logger.error('Error disconnecting', err);
    }
  }

  private async startConsuming() {
    await this.consumerChannel.consume(
      CONSUME_QUEUE,
      async (msg: any) => {
        if (!msg) return;
        try {
          const event: DeletionRequestedEvent = JSON.parse(msg.content.toString());
          await this.processDeletion(event);
          this.consumerChannel.ack(msg);
        } catch (err) {
          this.logger.error('Failed to process analytics cleanup message', err);
          this.consumerChannel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );
    this.logger.log(`Consuming from ${CONSUME_QUEUE} (delayMs=${this.delayMs})`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async processDeletion(event: DeletionRequestedEvent) {
    const { request_id, subject_id, trace_id } = event;
    try {
      await this.pgPool!.query(
        `UPDATE deletion_steps SET status = 'RUNNING', updated_at = NOW()
         WHERE request_id = $1 AND step_name = $2`,
        [request_id, STEP_NAME],
      );

      this.logger.log(
        `Analytics cleanup waiting ${this.delayMs}ms for request_id=${request_id} (eventual consistency demo)`,
      );
      await this.sleep(this.delayMs);

      const existingEvents = await this.pgPool!.query(
        `SELECT id, event_payload, created_at
         FROM analytics_events
         WHERE subject_id = $1 AND deleted_at IS NULL
         ORDER BY created_at ASC`,
        [subject_id],
      );

      const r = await this.pgPool!.query(
        `UPDATE analytics_events SET deleted_at = NOW()
         WHERE subject_id = $1 AND deleted_at IS NULL`,
        [subject_id],
      );
      const marked = r.rowCount ?? 0;
      this.logger.log(
        `Soft-deleted ${marked} analytics_events for subject_id=${subject_id} request_id=${request_id}`,
      );

      await this.publishSucceeded({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        metadata: {
          soft_deleted_rows: marked,
          subject_id,
          delay_ms_applied: this.delayMs,
          soft_deleted_event_summaries: existingEvents.rows.map((row) => ({
            event_id: row.id,
            created_at: new Date(row.created_at).toISOString(),
            event: row.event_payload?.event,
            route: row.event_payload?.route,
            format: row.event_payload?.format,
            device: row.event_payload?.device,
            campaign: row.event_payload?.campaign,
            team: row.event_payload?.team,
            section: row.event_payload?.section,
            batch_size: row.event_payload?.batch_size,
            source: row.event_payload?.source,
            experiment: row.event_payload?.experiment,
          })),
        },
      });
    } catch (err: any) {
      this.logger.error(`Analytics cleanup failed request_id=${request_id}`, err);
      await this.publishFailed({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        error_message: err.message || 'Analytics cleanup error',
        error_code: 'ANALYTICS_CLEANUP_FAILED',
      });
    }
  }

  private async publishSucceeded(event: DeletionStepSucceededEvent) {
    const message = { eventType: EventTypes.DELETION_STEP_SUCCEEDED, ...event };
    this.publisherChannel.publish(EXCHANGE_NAME, ROUTING_KEY_STEP_SUCCEEDED, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      headers: { 'event-type': EventTypes.DELETION_STEP_SUCCEEDED, 'trace-id': event.trace_id },
    });
  }

  private async publishFailed(event: DeletionStepFailedEvent) {
    const message = { eventType: EventTypes.DELETION_STEP_FAILED, ...event };
    this.publisherChannel.publish(EXCHANGE_NAME, ROUTING_KEY_STEP_FAILED, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      headers: { 'event-type': EventTypes.DELETION_STEP_FAILED, 'trace-id': event.trace_id },
    });
  }
}
