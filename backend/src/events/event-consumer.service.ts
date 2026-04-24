import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import * as amqp from 'amqplib';
import { 
  DeletionStepSucceededEvent, 
  DeletionStepFailedEvent,
  EventTypes 
} from './types';
import { DeletionStep, ProofEvent, DeletionStepStatus } from '../database/entities';
import { DeletionRequestService } from '../deletion-request/deletion-request.service';

@Injectable()
export class EventConsumerService {
  private readonly logger = new Logger(EventConsumerService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly QUEUE_NAME = 'erasegraph.step-results';

  constructor(
    private configService: ConfigService,
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
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
      
      // Ensure the queue exists
      await this.channel.assertQueue(this.QUEUE_NAME, { durable: true });
      
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

  private isDuplicateProofEvent(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as any).driverError;
    return driverError?.code === '23505';
  }
}
