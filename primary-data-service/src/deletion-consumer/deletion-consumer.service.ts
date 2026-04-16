import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as amqp from 'amqplib';
import { User } from '../entities/user.entity';
import {
  DeletionRequestedEvent,
  DeletionStepSucceededEvent,
  DeletionStepFailedEvent,
  EventTypes,
} from '../types/events';

// Routing keys that match the RabbitMQ bindings in definitions.json
const ROUTING_KEY_STEP_SUCCEEDED = 'step.succeeded';
const ROUTING_KEY_STEP_FAILED = 'step.failed';
const EXCHANGE_NAME = 'erasegraph.events';
const CONSUME_QUEUE = 'erasegraph.deletion-requests.primary-data';
const SERVICE_NAME = 'primary_data';
const STEP_NAME = 'primary_data';

@Injectable()
export class DeletionConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeletionConsumerService.name);
  private connection: any = null;
  private consumerChannel: any = null;
  private publisherChannel: any = null;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(url);

    this.consumerChannel = await this.connection.createChannel();
    await this.consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true });
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
          this.logger.log(
            `Received DeletionRequested for subject_id=${event.subject_id} request_id=${event.request_id}`,
          );
          await this.processDeletion(event);
          this.consumerChannel.ack(msg);
        } catch (err) {
          this.logger.error('Failed to process message', err);
          // nack without requeue — prevent poison-pill loops
          this.consumerChannel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.logger.log(`Consuming from ${CONSUME_QUEUE}`);
  }

  private async processDeletion(event: DeletionRequestedEvent) {
    const { request_id, subject_id, trace_id } = event;

    try {
      // Try deleting by id first, then fall back to username/email
      const byId = await this.userRepository.findOne({ where: { id: subject_id } });
      const byUsername = await this.userRepository.findOne({ where: { username: subject_id } });
      const user = byId || byUsername;

      let deletedRecords = 0;

      if (user) {
        await this.userRepository.remove(user);
        deletedRecords = 1;
        this.logger.log(
          `Deleted user id=${user.id} username=${user.username} for request_id=${request_id}`,
        );
      } else {
        // Subject not found — treat as success (idempotent: already deleted or never existed)
        this.logger.warn(
          `No user found for subject_id=${subject_id} — treating as already deleted`,
        );
      }

      await this.publishSucceeded({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        metadata: { deleted_records: deletedRecords, subject_id },
      });
    } catch (err: any) {
      this.logger.error(`Deletion failed for request_id=${request_id}`, err);
      await this.publishFailed({
        request_id,
        step_name: STEP_NAME,
        service_name: SERVICE_NAME,
        trace_id,
        timestamp: new Date().toISOString(),
        error_message: err.message || 'Unknown error during primary data deletion',
        error_code: 'PRIMARY_DATA_DELETION_FAILED',
      });
    }
  }

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
