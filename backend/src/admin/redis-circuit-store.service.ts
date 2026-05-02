import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

@Injectable()
export class RedisCircuitStore {
  private readonly logger = new Logger(RedisCircuitStore.name);

  constructor(private configService: ConfigService) {}

  async get(key: string): Promise<string | null> {
    const response = await this.command(['GET', key]);
    return response === null ? null : String(response);
  }

  private command(args: string[]): Promise<string | null> {
    const url = new URL(this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379');
    const payload = this.serialize(args);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        {
          host: url.hostname,
          port: Number(url.port || 6379)
        },
        () => socket.write(payload)
      );

      let data = '';
      socket.setTimeout(2000);
      socket.on('data', (chunk) => {
        data += chunk.toString();
        socket.end();
      });
      socket.on('end', () => resolve(this.parseBulkString(data)));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Redis command timed out'));
      });
      socket.on('error', (error) => {
        this.logger.warn(`Redis command failed: ${error.message}`);
        reject(error);
      });
    });
  }

  private serialize(args: string[]): string {
    return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`;
  }

  private parseBulkString(response: string): string | null {
    if (response.startsWith('$-1')) {
      return null;
    }

    if (!response.startsWith('$')) {
      return response.trim();
    }

    const [, value = ''] = response.split('\r\n');
    return value;
  }
}
