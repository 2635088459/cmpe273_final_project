import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import * as amqp from 'amqplib';
import {
  DeletionStepSucceededEvent,
  DeletionStepFailedEvent,
  EventTypes,
} from '../types/events';
import { ProofEvent } from '../entities';
import { computeProofEventHash, genesisHashForRequest } from '../proof/proof-hash.util';

const EXCHANGE_NAME = 'erasegraph.events';

@Injectable()
export class ProofConsumerService {
  private readonly logger = new Logger(ProofConsumerService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly QUEUE_NAME = 'erasegraph.proof-events';

  constructor(
    private configService: ConfigService,
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
  ) {}

  async onModuleInit() {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    const rabbitmqUrl =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await this.channel.assertQueue(this.QUEUE_NAME, { durable: true });
    await this.channel.bindQueue(this.QUEUE_NAME, EXCHANGE_NAME, 'step.succeeded');
    await this.channel.bindQueue(this.QUEUE_NAME, EXCHANGE_NAME, 'step.failed');
    await this.channel.prefetch(1);

    this.logger.log('Connected to RabbitMQ for proof consumption');
  }

  private async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ proof consumer');
    } catch (error) {
      this.logger.error('Error disconnecting RabbitMQ proof consumer', error);
    }
  }

  private async startConsuming() {
    await this.channel.consume(
      this.QUEUE_NAME,
      async (msg: any) => {
        if (!msg) {
          return;
        }

        try {
          const eventData = JSON.parse(msg.content.toString());
          await this.handleEvent(eventData);
          this.channel.ack(msg);
        } catch (error) {
          this.logger.error('Error processing proof event', error);
          this.channel.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.logger.log(`Started consuming proof events from ${this.QUEUE_NAME}`);
  }

  private async handleEvent(eventData: any) {
    const { eventType } = eventData;

    switch (eventType) {
      case EventTypes.DELETION_STEP_SUCCEEDED:
        await this.storeSucceededEvent(eventData as DeletionStepSucceededEvent);
        break;
      case EventTypes.DELETION_STEP_FAILED:
        await this.storeFailedEvent(eventData as DeletionStepFailedEvent);
        break;
      default:
        this.logger.warn(`Ignoring unsupported event type: ${eventType}`);
    }
  }

  private async storeSucceededEvent(event: DeletionStepSucceededEvent) {
    await this.storeProofEvent({
      request_id: event.request_id,
      service_name: event.service_name,
      event_type: EventTypes.DELETION_STEP_SUCCEEDED,
      dedupe_key: this.buildDedupeKey(
        event.request_id,
        event.service_name,
        EventTypes.DELETION_STEP_SUCCEEDED,
        event.step_name,
        event.timestamp,
      ),
      payload: {
        step_name: event.step_name,
        trace_id: event.trace_id,
        metadata: event.metadata || {},
        timestamp: event.timestamp,
      },
    });
  }

  private async storeFailedEvent(event: DeletionStepFailedEvent) {
    await this.storeProofEvent({
      request_id: event.request_id,
      service_name: event.service_name,
      event_type: EventTypes.DELETION_STEP_FAILED,
      dedupe_key: this.buildDedupeKey(
        event.request_id,
        event.service_name,
        EventTypes.DELETION_STEP_FAILED,
        event.step_name,
        event.timestamp,
      ),
      payload: {
        step_name: event.step_name,
        trace_id: event.trace_id,
        error_message: event.error_message,
        error_code: event.error_code,
        retry_count: event.retry_count,
        metadata: event.metadata || {},
        timestamp: event.timestamp,
      },
    });
  }

  private buildDedupeKey(
    requestId: string,
    serviceName: string,
    eventType: string,
    stepName: string,
    timestamp: string,
  ): string {
    return `${requestId}:${serviceName}:${eventType}:${stepName}:${timestamp}`;
  }

  private async storeProofEvent(event: {
    request_id: string;
    service_name: string;
    event_type: string;
    dedupe_key: string;
    payload: Record<string, any>;
  }) {
    const timestampIso =
      (event.payload &&
        typeof event.payload.timestamp === 'string' &&
        event.payload.timestamp) ||
      new Date().toISOString();

    const last = await this.proofEventRepository
      .createQueryBuilder('p')
      .where('p.request_id = :rid', { rid: event.request_id })
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .getOne();

    const previous_hash =
      last?.event_hash && last.event_hash.length > 0
        ? last.event_hash
        : genesisHashForRequest(event.request_id);

    const event_hash = computeProofEventHash(
      previous_hash,
      event.request_id,
      event.service_name,
      event.event_type,
      event.payload,
      timestampIso
    );

    try {
      await this.proofEventRepository.save({
        ...event,
        previous_hash,
        event_hash,
        created_at: new Date(timestampIso),
      });
      this.logger.log(
        `Stored proof event for request_id=${event.request_id} type=${event.event_type}`,
      );
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(`Duplicate proof event ignored for dedupe_key=${event.dedupe_key}`);
        return;
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as any).driverError;
    return driverError?.code === '23505';
  }
}
