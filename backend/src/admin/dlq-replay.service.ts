import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

interface DlqReplayTarget {
  queue: string;
  exchange: string;
  routingKey: string;
}

export interface DlqReplayResult {
  queue: string;
  replayed: number;
}

@Injectable()
export class DlqReplayService {
  private readonly logger = new Logger(DlqReplayService.name);
  private readonly targets: Record<string, DlqReplayTarget> = {
    'erasegraph.dlq.cache-cleanup': {
      queue: 'erasegraph.dlq.cache-cleanup',
      exchange: 'erasegraph.events',
      routingKey: 'deletion.requested.cache'
    },
    'cache-cleanup': {
      queue: 'erasegraph.dlq.cache-cleanup',
      exchange: 'erasegraph.events',
      routingKey: 'deletion.requested.cache'
    }
  };

  constructor(private configService: ConfigService) {}

  async replay(queueName: string): Promise<DlqReplayResult> {
    const target = this.targets[queueName];
    if (!target) {
      throw new NotFoundException(`Unsupported DLQ replay target: ${queueName}`);
    }

    const rabbitmqUrl =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://erasegraph:erasegraph_secret@localhost:5672';

    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      await channel.assertExchange(target.exchange, 'topic', { durable: true });
      const queueState = await channel.assertQueue(target.queue, { durable: true });
      const messagesToReplay = queueState.messageCount;

      let replayed = 0;
      while (replayed < messagesToReplay) {
        const msg = await channel.get(target.queue, { noAck: false });
        if (!msg) break;

        const headers = {
          ...msg.properties.headers,
          'replayed-from-dlq': target.queue,
          'replayed-at': new Date().toISOString()
        };

        channel.publish(target.exchange, target.routingKey, msg.content, {
          persistent: true,
          contentType: msg.properties.contentType,
          contentEncoding: msg.properties.contentEncoding,
          correlationId: msg.properties.correlationId,
          messageId: msg.properties.messageId,
          timestamp: Date.now(),
          headers
        });

        channel.ack(msg);
        replayed += 1;
      }

      this.logger.log(`Replayed ${replayed} message(s) from ${target.queue}`);
      return { queue: target.queue, replayed };
    } finally {
      await channel.close();
      await connection.close();
    }
  }
}
