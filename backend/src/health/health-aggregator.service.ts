import { Injectable } from '@nestjs/common';
import * as http from 'http';

export interface ServiceStatus {
  status: 'UP' | 'DOWN';
  responseTime?: number;
  error?: string;
}

@Injectable()
export class HealthAggregatorService {
  private readonly services: Record<string, string> = {
    'primary-data-service':
      process.env.PRIMARY_DATA_SERVICE_URL ?? 'http://primary-data-service:3002',
    'cache-cleanup-service':
      process.env.CACHE_CLEANUP_SERVICE_URL ?? 'http://cache-cleanup-service:3003',
    'proof-service':
      process.env.PROOF_SERVICE_URL ?? 'http://proof-service:3004',
    'backup-service':
      process.env.BACKUP_SERVICE_URL ?? 'http://backup-service:3005',
  };

  checkService(name: string, baseUrl: string): Promise<ServiceStatus> {
    const start = Date.now();
    return new Promise<ServiceStatus>((resolve) => {
      const req = http.get(`${baseUrl}/health`, { timeout: 3000 }, (res) => {
        const responseTime = Date.now() - start;
        if (res.statusCode && res.statusCode < 400) {
          resolve({ status: 'UP', responseTime });
        } else {
          resolve({ status: 'DOWN', responseTime, error: `HTTP ${res.statusCode}` });
        }
        res.resume();
      });
      req.on('error', (err: Error) => {
        resolve({ status: 'DOWN', responseTime: Date.now() - start, error: err.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'DOWN', responseTime: Date.now() - start, error: 'Request timeout' });
      });
    });
  }

  async checkAll(): Promise<Record<string, ServiceStatus>> {
    const checks = await Promise.all(
      Object.entries(this.services).map(async ([name, url]) => {
        const status = await this.checkService(name, url);
        return [name, status] as [string, ServiceStatus];
      }),
    );
    return Object.fromEntries(checks);
  }
}
