import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Pool } from 'pg';

const EXCHANGE_NAME = 'erasegraph.events';
const QUEUE_NAME = 'erasegraph.deletion-notifications';

@Injectable()
export class NotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumerService.name);
  private connection: any = null;
  private channel: any = null;
  private pgPool: Pool | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connectPostgres();
    await this.connectRabbitMQ();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      if (this.pgPool) await this.pgPool.end();
    } catch (e) {
      this.logger.error('Disconnect error', e);
    }
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
      CREATE TABLE IF NOT EXISTS deletion_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id UUID NOT NULL UNIQUE,
        subject_id VARCHAR(255) NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.logger.log('Postgres ready for deletion_notifications');
  }

  private async connectRabbitMQ() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.channel.assertQueue(QUEUE_NAME, { durable: true });
    await this.channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'deletion.completed');
    await this.channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'deletion.failed');
    await this.channel.prefetch(1);
    this.logger.log(`Bound ${QUEUE_NAME} to deletion.completed + deletion.failed`);
  }

  private async startConsuming() {
    await this.channel.consume(
      QUEUE_NAME,
      async (msg: any) => {
        if (!msg) return;
        try {
          const data = JSON.parse(msg.content.toString());
          await this.handleLifecycle(data);
          this.channel.ack(msg);
        } catch (e) {
          this.logger.error('Notification handling failed', e);
          this.channel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );
    this.logger.log(`Consuming lifecycle events from ${QUEUE_NAME}`);
  }

  private async handleLifecycle(data: any) {
    const eventType = data.eventType as string;
    const requestId = data.request_id as string;
    const subjectId = data.subject_id as string;

    if (!requestId || !subjectId) {
      this.logger.warn('Lifecycle message missing request_id or subject_id');
      return;
    }

    let notificationType: string;
    let message: string;

    if (eventType === 'DeletionCompleted') {
      notificationType = 'DELETION_COMPLETE';
      const steps = (data.completed_steps as string[]) || [];
      const status = (data.status as string) || 'COMPLETED';
      message = `Your data deletion request has finished with status ${status}. Completed steps: ${steps.join(', ') || '(none)'}.`;
    } else if (eventType === 'DeletionFailed') {
      notificationType = 'DELETION_FAILED';
      const reason = (data.reason as string) || 'Deletion workflow failed.';
      const failed = (data.failed_steps as string[]) || [];
      message =
        failed.length > 0
          ? `${reason} Failed steps: ${failed.join(', ')}.`
          : reason;
    } else {
      this.logger.warn(`Ignoring unknown lifecycle event: ${eventType}`);
      return;
    }

    await this.pgPool!.query(
      `
      INSERT INTO deletion_notifications (request_id, subject_id, notification_type, message)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (request_id) DO UPDATE SET
        subject_id = EXCLUDED.subject_id,
        notification_type = EXCLUDED.notification_type,
        message = EXCLUDED.message,
        delivered_at = NOW()
    `,
      [requestId, subjectId, notificationType, message],
    );

    this.logger.log(`Recorded ${notificationType} for request_id=${requestId}`);
  }
}
