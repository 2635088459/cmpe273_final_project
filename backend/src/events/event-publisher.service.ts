import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { 
  DeletionRequestedEvent, 
  DeletionStepSucceededEvent, 
  DeletionStepFailedEvent,
  RoutingKeys,
  EventTypes 
} from './types';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly EXCHANGE_NAME = 'erasegraph.events';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
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
      
      // Ensure the exchange exists
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'topic', { durable: true });
      
      this.logger.log('Connected to RabbitMQ successfully');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
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
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
    }
  }

  async publishDeletionRequested(event: DeletionRequestedEvent): Promise<void> {
    await this.publishEvent(RoutingKeys.DELETION_REQUESTED, EventTypes.DELETION_REQUESTED, event);
  }

  async publishDeletionStepSucceeded(event: DeletionStepSucceededEvent): Promise<void> {
    await this.publishEvent(RoutingKeys.DELETION_STEP_RESULT, EventTypes.DELETION_STEP_SUCCEEDED, event);
  }

  async publishDeletionStepFailed(event: DeletionStepFailedEvent): Promise<void> {
    await this.publishEvent(RoutingKeys.DELETION_STEP_RESULT, EventTypes.DELETION_STEP_FAILED, event);
  }

  private async publishEvent(routingKey: string, eventType: string, event: any): Promise<void> {
    try {
      if (!this.channel) {
        throw new Error('RabbitMQ channel not initialized');
      }

      const message = {
        eventType,
        timestamp: new Date().toISOString(),
        ...event
      };

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const published = this.channel.publish(
        this.EXCHANGE_NAME,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          messageId: `${eventType}-${event.request_id}-${Date.now()}`,
          timestamp: Date.now(),
          headers: {
            'event-type': eventType,
            'request-id': event.request_id,
            'trace-id': event.trace_id
          }
        }
      );

      if (published) {
        this.logger.log(`Published event: ${eventType} for request ${event.request_id}`);
      } else {
        this.logger.warn(`Failed to publish event: ${eventType} for request ${event.request_id}`);
      }
    } catch (error) {
      this.logger.error(`Error publishing event ${eventType}:`, error);
      throw error;
    }
  }
}