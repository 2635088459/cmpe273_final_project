import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import * as amqp from 'amqplib';
import { 
  DeletionStepSucceededEvent, 
  DeletionStepFailedEvent,
  DeletionStepRetryingEvent,
  DuplicateEventIgnoredEvent,
  EventTypes 
} from './types';
import { ProofEvent, ProcessedEvent, DeletionStepStatus } from '../database/entities';
import { DeletionRequestService } from '../deletion-request/deletion-request.service';

@Injectable()
export class EventConsumerService {
  private readonly logger = new Logger(EventConsumerService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly EXCHANGE_NAME = 'erasegraph.events';
  private readonly QUEUE_NAME = 'erasegraph.step-results';

  constructor(
    private configService: ConfigService,
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
    @InjectRepository(ProcessedEvent)
    private processedEventRepository: Repository<ProcessedEvent>,
    private deletionRequestService: DeletionRequestService
  ) {}

  async onModuleInit() {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL') || 
                         'amqp://erasegraph:erasegraph_secret@localhost:5672';
      
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'topic', { durable: true });
      await this.channel.assertQueue(this.QUEUE_NAME, { durable: true });
      await this.channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, 'step.succeeded');
      await this.channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, 'step.failed');
      await this.channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, 'step.retrying');
      
      // Set prefetch to 1 for fair dispatch
      await this.channel.prefetch(1);
      
      this.logger.log('Connected to RabbitMQ for event consumption');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ for consumption', error);
      throw error;
    }
  }

  private async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ consumer');
    } catch (error) {
      this.logger.error('Error disconnecting RabbitMQ consumer', error);
    }
  }

  private async startConsuming() {
    try {
      await this.channel.consume(this.QUEUE_NAME, async (msg) => {
        if (msg) {
          try {
            const eventData = JSON.parse(msg.content.toString());
            await this.handleEvent(eventData);
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error('Error processing message:', error);
            this.channel.nack(msg, false, false); // Don't requeue failed messages
          }
        }
      }, {
        noAck: false
      });

      this.logger.log(`Started consuming events from ${this.QUEUE_NAME}`);
    } catch (error) {
      this.logger.error('Error starting event consumption:', error);
      throw error;
    }
  }

  private async handleEvent(eventData: any) {
    const { eventType } = eventData;

    this.logger.log(`Processing event: ${eventType} for request: ${eventData.request_id}`);

    switch (eventType) {
      case EventTypes.DELETION_STEP_SUCCEEDED:
        await this.handleStepSucceeded(eventData as DeletionStepSucceededEvent);
        break;
      
      case EventTypes.DELETION_STEP_FAILED:
        await this.handleStepFailed(eventData as DeletionStepFailedEvent);
        break;

      case EventTypes.DELETION_STEP_RETRYING:
        await this.handleStepRetrying(eventData as DeletionStepRetryingEvent);
        break;

      case EventTypes.DUPLICATE_EVENT_IGNORED:
        await this.handleDuplicateEventIgnored(eventData as DuplicateEventIgnoredEvent);
        break;

      case EventTypes.CIRCUIT_OPEN_SKIP:
        await this.handleCircuitOpenSkip(eventData as DuplicateEventIgnoredEvent);
        break;
      
      default:
        this.logger.warn(`Unknown event type: ${eventType}`);
    }
  }

  private async handleStepSucceeded(event: DeletionStepSucceededEvent) {
    const { request_id, step_name, service_name, metadata } = event;

    try {
      // Update step status
      await this.deletionRequestService.updateStepStatus(
        request_id,
        step_name,
        DeletionStepStatus.SUCCEEDED
      );

      // Create proof event
      await this.saveProofEvent({
        request_id,
        service_name,
        event_type: EventTypes.DELETION_STEP_SUCCEEDED,
        dedupe_key: this.buildDedupeKey(
          request_id,
          service_name,
          EventTypes.DELETION_STEP_SUCCEEDED,
          step_name,
          event.timestamp
        ),
        payload: {
          step_name,
          trace_id: event.trace_id,
          metadata,
          timestamp: event.timestamp
        }
      });

      this.logger.log(`Successfully processed step succeeded for ${request_id}:${step_name}`);
    } catch (error) {
      this.logger.error(`Error handling step succeeded event:`, error);
      throw error;
    }
  }

  private async handleStepFailed(event: DeletionStepFailedEvent) {
    const { request_id, step_name, service_name, error_message, metadata } = event;

    try {
      // Update step status with error
      await this.deletionRequestService.updateStepStatus(
        request_id,
        step_name,
        DeletionStepStatus.FAILED,
        error_message
      );

      // Create proof event
      await this.saveProofEvent({
        request_id,
        service_name,
        event_type: EventTypes.DELETION_STEP_FAILED,
        dedupe_key: this.buildDedupeKey(
          request_id,
          service_name,
          EventTypes.DELETION_STEP_FAILED,
          step_name,
          event.timestamp
        ),
        payload: {
          step_name,
          trace_id: event.trace_id,
          error_message,
          metadata,
          timestamp: event.timestamp
        }
      });

      this.logger.log(`Successfully processed step failed for ${request_id}:${step_name}`);
    } catch (error) {
      this.logger.error(`Error handling step failed event:`, error);
      throw error;
    }
  }

  private async handleStepRetrying(event: DeletionStepRetryingEvent) {
    const {
      request_id,
      step_name,
      service_name,
      error_message,
      retry_count,
      next_retry_delay_ms,
      metadata
    } = event;

    await this.deletionRequestService.updateStepStatus(
      request_id,
      step_name,
      DeletionStepStatus.RETRYING,
      error_message
    );

    await this.saveProofEvent({
      request_id,
      service_name,
      event_type: EventTypes.DELETION_STEP_RETRYING,
      dedupe_key: this.buildDedupeKey(
        request_id,
        service_name,
        EventTypes.DELETION_STEP_RETRYING,
        step_name,
        event.timestamp
      ),
      payload: {
        step_name,
        trace_id: event.trace_id,
        retry_count,
        next_retry_delay_ms,
        error_message,
        metadata,
        timestamp: event.timestamp
      }
    });
  }

  private async handleDuplicateEventIgnored(event: DuplicateEventIgnoredEvent) {
    await this.saveProofEvent({
      request_id: event.request_id,
      service_name: event.service_name,
      event_type: EventTypes.DUPLICATE_EVENT_IGNORED,
      dedupe_key: this.buildDedupeKey(
        event.request_id,
        event.service_name,
        EventTypes.DUPLICATE_EVENT_IGNORED,
        event.step_name,
        event.duplicate_event_id
      ),
      payload: {
        step_name: event.step_name,
        trace_id: event.trace_id,
        duplicate_event_id: event.duplicate_event_id,
        metadata: event.metadata,
        timestamp: event.timestamp
      }
    });
  }

  private async handleCircuitOpenSkip(event: DuplicateEventIgnoredEvent) {
    await this.deletionRequestService.updateStepStatus(
      event.request_id,
      event.step_name,
      DeletionStepStatus.SKIPPED_CIRCUIT_OPEN,
      'Skipped because circuit breaker is OPEN'
    );

    await this.saveProofEvent({
      request_id: event.request_id,
      service_name: event.service_name,
      event_type: EventTypes.CIRCUIT_OPEN_SKIP,
      dedupe_key: this.buildDedupeKey(
        event.request_id,
        event.service_name,
        EventTypes.CIRCUIT_OPEN_SKIP,
        event.step_name,
        event.timestamp
      ),
      payload: {
        step_name: event.step_name,
        trace_id: event.trace_id,
        metadata: event.metadata,
        timestamp: event.timestamp
      }
    });
  }

  private buildDedupeKey(
    requestId: string,
    serviceName: string,
    eventType: string,
    stepName: string,
    timestamp: string
  ): string {
    return `${requestId}:${serviceName}:${eventType}:${stepName}:${timestamp}`;
  }

  private async saveProofEvent(event: {
    request_id: string;
    service_name: string;
    event_type: string;
    dedupe_key: string;
    payload: Record<string, any>;
  }): Promise<void> {
    try {
      await this.proofEventRepository.save(event);
    } catch (error) {
      if (this.isDuplicateProofEvent(error)) {
        this.logger.warn(`Duplicate proof event ignored for dedupe_key=${event.dedupe_key}`);
        return;
      }

      throw error;
    }
  }

  async markProcessedEvent(
    eventId: string,
    requestId: string,
    serviceName: string
  ): Promise<boolean> {
    try {
      await this.processedEventRepository.insert({
        event_id: eventId,
        request_id: requestId,
        service_name: serviceName
      });
      return true;
    } catch (error) {
      if (this.isDuplicateProofEvent(error)) {
        return false;
      }

      throw error;
    }
  }

  private isDuplicateProofEvent(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as any).driverError;
    return driverError?.code === '23505';
  }
}
