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
      DELETE FROM proof_events
      WHERE ctid IN (
        SELECT ctid
        FROM (
          SELECT
            ctid,
            ROW_NUMBER() OVER (
              PARTITION BY dedupe_key
              ORDER BY created_at ASC, id ASC
            ) AS duplicate_rank
          FROM proof_events
          WHERE dedupe_key IS NOT NULL
        ) ranked
        WHERE duplicate_rank > 1
      )
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
    await this.dataSource.query(`
      ALTER TABLE proof_events
      ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(128)
    `);
    await this.dataSource.query(`
      ALTER TABLE proof_events
      ADD COLUMN IF NOT EXISTS event_hash VARCHAR(128)
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS deletion_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id UUID NOT NULL UNIQUE REFERENCES deletion_requests(id) ON DELETE CASCADE,
        subject_id VARCHAR(255) NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS search_index_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subject_id VARCHAR(100) NOT NULL,
        indexed_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subject_id VARCHAR(100) NOT NULL,
        event_payload JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await this.dataSource.query(`
      ALTER TABLE deletion_requests DROP CONSTRAINT IF EXISTS chk_request_status
    `);
    await this.dataSource.query(`
      ALTER TABLE deletion_requests
      ADD CONSTRAINT chk_request_status CHECK (
        status IN (
          'PENDING',
          'RUNNING',
          'PARTIAL_COMPLETED',
          'COMPLETED',
          'FAILED',
          'SLA_VIOLATED'
        )
      )
    `);
    this.logger.log('Reliability schema bootstrap completed');
  }
}
