import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      ALTER TABLE proof_events
      ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255)
    `);
    await this.dataSource.query(`
      UPDATE proof_events
      SET dedupe_key = id::text
      WHERE dedupe_key IS NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE proof_events
      ALTER COLUMN dedupe_key SET NOT NULL
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_dedupe ON proof_events (dedupe_key)
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id UUID PRIMARY KEY,
        request_id UUID NOT NULL,
        service_name VARCHAR(100) NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      ALTER TABLE deletion_steps DROP CONSTRAINT IF EXISTS chk_step_status
    `);
    await this.dataSource.query(`
      ALTER TABLE deletion_steps
      ADD CONSTRAINT chk_step_status CHECK (
        status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'SKIPPED_CIRCUIT_OPEN')
      )
    `);
    this.logger.log('Reliability schema bootstrap completed');
  }
}
