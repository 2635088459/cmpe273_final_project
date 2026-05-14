import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  DeletionRequestedEvent,
  DeletionStepSucceededEvent,
  DeletionStepFailedEvent,
  EventTypes,
} from '../types/events';

const EXCHANGE_NAME = 'erasegraph.events';
const CONSUME_QUEUE = 'erasegraph.deletion-requests.backup';
const ROUTING_KEY_DELETION_REQUESTED = 'deletion.requested';
const ROUTING_KEY_STEP_SUCCEEDED = 'step.succeeded';
const ROUTING_KEY_STEP_FAILED = 'step.failed';
const SERVICE_NAME = 'backup';
const STEP_NAME = 'backup';

/**
 * BackupConsumerService
 *
 * Consumes DeletionRequested events and simulates purging backup records
 * for the given subject. In a real system this would call a backup storage
 * API (S3, GCS, etc.). Here we log the operation and always succeed so the
 * overall flow can reach COMPLETED status.
 */
@Injectable()
export class BackupConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupConsumerService.name);
  private connection: any = null;
  private consumerChannel: any = null;
  private publisherChannel: any = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  // ─────────────────────────────────────────────────────────────
  // Connection helpers
  // ─────────────────────────────────────────────────────────────

  private async connect() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(url);

    this.consumerChannel = await this.connection.createChannel();
    await this.consumerChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true });
    await this.consumerChannel.bindQueue(CONSUME_QUEUE, EXCHANGE_NAME, ROUTING_KEY_DELETION_REQUESTED);
    await this.consumerChannel.prefetch(1);

    this.publisherChannel = await this.connection.createChannel();
    await this.publisherChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    this.logger.log('Connected to RabbitMQ');
  }

  private async disconnect() {
    try {
      if (this.consumerChannel) await this.consumerChannel.close();
      if (this.publisherChannel) await this.publisherChannel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      this.logger.error('Error disconnecting from RabbitMQ', err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Consumer
  // ─────────────────────────────────────────────────────────────

  private async startConsuming() {
    await this.consumerChannel.consume(
      CONSUME_QUEUE,
      async (msg: any) => {
        if (!msg) return;
        try {
          const event: DeletionRequestedEvent = JSON.parse(msg.content.toString());
          this.logger.log(
            `Received DeletionRequested for subject_id=${event.subject_id} request_id=${event.request_id}`,
          );
          await this.processBackupDeletion(event);
          this.consumerChannel.ack(msg);
        } catch (err) {
          this.logger.error('Failed to process message', err);
          this.consumerChannel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.logger.log(`Consuming from ${CONSUME_QUEUE}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Business logic
  // ─────────────────────────────────────────────────────────────

  private async processBackupDeletion(event: DeletionRequestedEvent) {
    const { request_id, subject_id, trace_id } = event;

    try {
      // Simulate backup purge latency (50-200ms)
      const latency = 50 + Math.floor(Math.random() * 150);
      const simulatedArtifacts = this.buildSimulatedArtifacts(subject_id);
      await new Promise((resolve) => setTimeout(resolve, latency));

      this.logger.log(
        `Purged backup records for subject_id=${subject_id} request_id=${request_id} (simulated, ${latency}ms)`,
      );

      await this.publishSucceeded({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        metadata: {
          subject_id,
          backup_records_removed: simulatedArtifacts.length,
          storage_backend: 'simulated',
          purge_latency_ms: latency,
          simulated_artifacts_removed: simulatedArtifacts,
        },
      });
    } catch (err: any) {
      this.logger.error(`Backup deletion failed for request_id=${request_id}`, err);
      await this.publishFailed({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        error_message: err.message || 'Unknown error during backup deletion',
        error_code: 'BACKUP_DELETION_FAILED',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Publishers
  // ─────────────────────────────────────────────────────────────

  private async publishSucceeded(event: DeletionStepSucceededEvent) {
    const message = { eventType: EventTypes.DELETION_STEP_SUCCEEDED, ...event };
    this.publisherChannel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY_STEP_SUCCEEDED,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        headers: {
          'event-type': EventTypes.DELETION_STEP_SUCCEEDED,
          'trace-id': event.trace_id,
        },
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
        headers: {
          'event-type': EventTypes.DELETION_STEP_FAILED,
          'trace-id': event.trace_id,
        },
      },
    );
    this.logger.log(`Published DeletionStepFailed for request_id=${event.request_id}`);
  }

  private buildSimulatedArtifacts(subjectId: string): Array<Record<string, string>> {
    return [
      {
        artifact_type: 'nightly_snapshot',
        artifact_path: `gs://erasegraph-demo-backups/nightly/${subjectId}/snapshot.json.gz`,
      },
      {
        artifact_type: 'weekly_archive',
        artifact_path: `gs://erasegraph-demo-backups/weekly/${subjectId}/archive.tar`,
      },
      {
        artifact_type: 'compliance_export',
        artifact_path: `gs://erasegraph-demo-backups/compliance/${subjectId}/export.ndjson`,
      },
    ];
  }
}
