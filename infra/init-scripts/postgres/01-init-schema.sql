-- ============================================================
-- EraseGraph — Database Schema Initialization
-- ============================================================
-- This script runs automatically when the PostgreSQL container
-- starts for the first time (via docker-entrypoint-initdb.d).
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- Table: deletion_requests
-- Stores high-level deletion requests.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deletion_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id    VARCHAR(255)  NOT NULL,
    status        VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
    requested_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    trace_id      VARCHAR(64),

    CONSTRAINT chk_request_status CHECK (
        status IN ('PENDING', 'RUNNING', 'PARTIAL_COMPLETED', 'COMPLETED', 'FAILED')
    )
);

CREATE INDEX idx_requests_subject  ON deletion_requests (subject_id);
CREATE INDEX idx_requests_status   ON deletion_requests (status);

-- ────────────────────────────────────────────────────────────
-- Table: deletion_steps
-- Tracks the status of each cleanup step within a request.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deletion_steps (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id     UUID          NOT NULL REFERENCES deletion_requests(id) ON DELETE CASCADE,
    step_name      VARCHAR(50)   NOT NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    attempt_count  INTEGER       NOT NULL DEFAULT 0,
    last_error     TEXT,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_step_status CHECK (
        status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING')
    )
);

CREATE INDEX idx_steps_request ON deletion_steps (request_id);

-- ────────────────────────────────────────────────────────────
-- Table: proof_events
-- Audit trail for every action taken during deletion.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proof_events (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id     UUID          NOT NULL REFERENCES deletion_requests(id) ON DELETE CASCADE,
    service_name   VARCHAR(50)   NOT NULL,
    event_type     VARCHAR(50)   NOT NULL,
    dedupe_key     VARCHAR(255)  NOT NULL,
    payload        JSONB         NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proof_request ON proof_events (request_id);
CREATE INDEX idx_proof_service ON proof_events (service_name);
CREATE UNIQUE INDEX uq_proof_dedupe_key ON proof_events (dedupe_key);

-- ────────────────────────────────────────────────────────────
-- Table: users (sample data for demo / testing)
-- Simulates the primary data store that holds user records.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username   VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Seed data: sample users for demo
-- ────────────────────────────────────────────────────────────
INSERT INTO users (id, username, email) VALUES
    ('a1b2c3d4-0000-0000-0000-000000000001', 'alice',   'alice@example.com'),
    ('a1b2c3d4-0000-0000-0000-000000000002', 'bob',     'bob@example.com'),
    ('a1b2c3d4-0000-0000-0000-000000000003', 'charlie', 'charlie@example.com'),
    ('a1b2c3d4-0000-0000-0000-000000000004', 'diana',   'diana@example.com'),
    ('a1b2c3d4-0000-0000-0000-000000000005', 'eve',     'eve@example.com')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- Done
-- ────────────────────────────────────────────────────────────
\echo '✅ EraseGraph database schema initialized successfully.'
