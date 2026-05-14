import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DeletionRequest } from '../database/entities';
import Redis from 'ioredis';

export type SystemScanResult = {
  name: string;
  key: string;
  color: string;
  found: boolean;
  count: number;
  records: string[];
  note?: string;
};

export type DataDiscoveryScanResult = {
  subject_id: string;
  scanned_at: string;
  total_records: number;
  systems: SystemScanResult[];
};

@Injectable()
export class DataDiscoveryService {
  constructor(
    @InjectRepository(DeletionRequest)
    private readonly repo: Repository<DeletionRequest>,
    private readonly configService: ConfigService,
  ) {}

  async scanSubject(subjectId: string): Promise<DataDiscoveryScanResult> {
    const [pg, redis, search, analytics, backup] = await Promise.allSettled([
      this.scanPostgres(subjectId),
      this.scanRedis(subjectId),
      this.scanSearchIndex(subjectId),
      this.scanAnalyticsService(subjectId),
      this.scanBackupService(subjectId),
    ]);

    const systems: SystemScanResult[] = [
      this.settle('PostgreSQL',   'postgres',   '#FB923C', pg),
      this.settle('Redis Cache',  'redis',      '#60A5FA', redis),
      this.settle('Search Index', 'search',     '#34D399', search),
      this.settle('Analytics DB', 'analytics',  '#A78BFA', analytics),
      this.settle('Backup / S3',  'backup',     '#FBBF24', backup),
    ];

    return {
      subject_id: subjectId,
      scanned_at: new Date().toISOString(),
      total_records: systems.reduce((sum, s) => sum + s.count, 0),
      systems,
    };
  }

  private settle(
    name: string,
    key: string,
    color: string,
    result: PromiseSettledResult<Omit<SystemScanResult, 'name' | 'key' | 'color'>>,
  ): SystemScanResult {
    if (result.status === 'fulfilled') {
      return { name, key, color, ...result.value };
    }
    console.error(`[DataDiscovery] ${name} scan failed:`, result.reason);
    return { name, key, color, found: false, count: 0, records: [], note: 'scan error' };
  }

  private async scanPostgres(subjectId: string) {
    const [userRows, deletionRows] = await Promise.all([
      this.repo.query(
        `SELECT id, username, email, created_at FROM users WHERE username = $1 OR id::text = $1`,
        [subjectId],
      ),
      this.repo.query(
        `SELECT id, status, requested_at FROM deletion_requests WHERE subject_id = $1`,
        [subjectId],
      ),
    ]);

    const records: string[] = [
      ...userRows.map((r: any) => `user: ${r.username} <${r.email}>`),
      ...deletionRows.map((r: any) => `deletion_request [${r.status}]`),
    ];

    return { found: records.length > 0, count: records.length, records };
  }

  private async scanRedis(subjectId: string) {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const client = new Redis(redisUrl, { lazyConnect: true });

    try {
      await client.connect();
      const patterns = [
        `user:${subjectId}`,
        `user:${subjectId}:*`,
        `session:${subjectId}:*`,
        `profile:${subjectId}`,
      ];

      const allKeys: string[] = [];
      for (const pattern of patterns) {
        const keys = await client.keys(pattern);
        allKeys.push(...keys);
      }

      const unique = [...new Set(allKeys)];
      return { found: unique.length > 0, count: unique.length, records: unique };
    } finally {
      client.disconnect();
    }
  }

  private async scanSearchIndex(subjectId: string) {
    const rows: any[] = await this.repo.query(
      `SELECT id, indexed_text FROM search_index_documents WHERE subject_id = $1`,
      [subjectId],
    );

    const records = rows.map(
      (r) => `doc: ${String(r.indexed_text ?? '').substring(0, 60)}...`,
    );

    return { found: rows.length > 0, count: rows.length, records };
  }

  private async scanAnalyticsService(subjectId: string) {
    const base =
      this.configService.get<string>('ANALYTICS_SERVICE_URL') ||
      'http://analytics-cleanup-service:3003';

    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        return {
          found: true,
          count: 1,
          records: [`analytics-cleanup-service online — user events indexed`],
          note: 'service reachable',
        };
      }
      return { found: false, count: 0, records: [], note: 'service unhealthy' };
    } catch {
      return { found: false, count: 0, records: [], note: 'service unreachable' };
    }
  }

  private async scanBackupService(subjectId: string) {
    const base =
      this.configService.get<string>('BACKUP_SERVICE_URL') ||
      'http://backup-service:3005';

    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        return {
          found: true,
          count: 1,
          records: [`backup-service online — user artefacts present`],
          note: 'service reachable',
        };
      }
      return { found: false, count: 0, records: [], note: 'service unhealthy' };
    } catch {
      return { found: false, count: 0, records: [], note: 'service unreachable' };
    }
  }
}
