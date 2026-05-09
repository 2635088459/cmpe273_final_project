# EraseGraph — Session Changes & Fixes Documentation

**Date:** April 24, 2026  
**Scope:** Full end-to-end debugging, bug fixes, new service implementation, and infrastructure completion  
**Outcome:** All services running; full deletion pipeline reaches `COMPLETED` status with all 3 steps (primary_data, cache, backup) succeeding  

---

## Table of Contents

1. [Overview of What Was Done](#1-overview-of-what-was-done)
2. [Problem 1 — Missing `package-lock.json` files](#2-problem-1--missing-package-lockjson-files)
3. [Problem 2 — `proof-service` Not in Docker Compose](#3-problem-2--proof-service-not-in-docker-compose)
4. [Problem 3 — Backend Healthcheck Using `curl`](#4-problem-3--backend-healthcheck-using-curl)
5. [Problem 4 — Missing `updated_at` Column in `users` Table](#5-problem-4--missing-updated_at-column-in-users-table)
6. [Problem 5 — UUID Type Error in `primary-data-service`](#6-problem-5--uuid-type-error-in-primary-data-service)
7. [Problem 6 — `backup` Step Permanently PENDING](#7-problem-6--backup-step-permanently-pending)
8. [New Feature — `backup-service` Implementation](#8-new-feature--backup-service-implementation)
9. [New Feature — Frontend Added to Docker Compose](#9-new-feature--frontend-added-to-docker-compose)
10. [RabbitMQ Queue Configuration for Backup](#10-rabbitmq-queue-configuration-for-backup)
11. [Complete File Change List](#11-complete-file-change-list)
12. [Final System State](#12-final-system-state)
13. [End-to-End Test Results](#13-end-to-end-test-results)

---

## 1. Overview of What Was Done

When we first attempted to start the full stack with `docker compose up -d --build`, the builds failed immediately. We systematically identified and fixed every issue, then added two missing pieces of the system: the `backup-service` (a new NestJS microservice) and the `frontend` container. By the end of the session, a deletion request submitted via the API transitions through all three cleanup steps (`primary_data` → `cache` → `backup`) and reaches a final status of `COMPLETED`, with a full proof audit trail persisted in PostgreSQL and visible via the `/deletions/:id/proof` endpoint.

---

## 2. Problem 1 — Missing `package-lock.json` files

### What Happened

When Docker built the `primary-data-service` and `cache-cleanup-service` images, the build step `RUN npm ci` failed with:

```
npm error The `npm ci` command can only install with an existing package-lock.json or
npm-shrinkwrap.json with lockfileVersion >= 1.
```

`npm ci` (clean install) is a strict command that requires a pre-existing lockfile. Neither service had one committed.

### Root Cause

The `package-lock.json` files for `primary-data-service` and `cache-cleanup-service` were never generated and committed to the repository. The `backend` service had its lockfile, which is why it built successfully (from cache).

### Fix

Generated lockfiles locally for both services without installing node_modules:

```bash
cd primary-data-service && npm install --package-lock-only
cd cache-cleanup-service && npm install --package-lock-only
```

This creates a `package-lock.json` that pins all transitive dependency versions, allowing `npm ci` inside Docker to work correctly.

### Files Affected

- `primary-data-service/package-lock.json` — created
- `cache-cleanup-service/package-lock.json` — created

---

## 3. Problem 2 — `proof-service` Not in Docker Compose

### What Happened

The `proof-service` directory existed in the repository with full source code and a `Dockerfile`, but it had no entry in `infra/docker-compose.yml`. It was therefore never built or started as part of the stack.

### Root Cause

The service was implemented but the compose file was never updated to include it.

### Fix

Added a complete `proof-service` block to `infra/docker-compose.yml`:

```yaml
proof-service:
  build:
    context: ../proof-service
    dockerfile: Dockerfile
  container_name: erasegraph-proof-service
  restart: unless-stopped
  ports:
    - "${PROOF_SERVICE_PORT:-3004}:3004"
  environment:
    NODE_ENV: ${NODE_ENV:-production}
    PORT: 3004
    DB_HOST: postgres
    DB_PORT: 5432
    DB_USERNAME: ${POSTGRES_USER:-erasegraph}
    DB_PASSWORD: ${POSTGRES_PASSWORD:-erasegraph_secret}
    DB_DATABASE: ${POSTGRES_DB:-erasegraph}
    RABBITMQ_URL: amqp://${RABBITMQ_USER:-erasegraph}:${RABBITMQ_PASSWORD:-erasegraph_secret}@rabbitmq:5672
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://jaeger:4318/v1/traces
  depends_on:
    postgres:
      condition: service_healthy
    rabbitmq:
      condition: service_healthy
    jaeger:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget --spider -q http://localhost:3004/health || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Files Affected

- `infra/docker-compose.yml` — `proof-service` block added

---

## 4. Problem 3 — Backend Healthcheck Using `curl`

### What Happened

After all images built successfully and containers started, `docker compose ps` showed `erasegraph-backend` as `(unhealthy)` while all other services were `(healthy)`.

### Root Cause

The backend healthcheck in `docker-compose.yml` was:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
```

The base image `node:18-alpine` does **not** include `curl`. The healthcheck binary was not found, so the check always failed.

### Verification

Despite the `unhealthy` label, the backend was fully functional — confirmed by directly calling the health endpoint from the host:

```bash
curl -s http://localhost:3001/health
# → {"status":"ok","timestamp":"...","service":"erasegraph-backend","version":"1.0.0"}
```

### Fix

Replaced `curl` with `wget`, which is available in Alpine-based images:

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget --spider -q http://localhost:3001/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Files Affected

- `infra/docker-compose.yml` — backend healthcheck command updated

---

## 5. Problem 4 — Missing `updated_at` Column in `users` Table

### What Happened

After submitting a deletion request, the `primary_data` step always came back as `FAILED` with the error:

```
column User.updated_at does not exist
```

### Root Cause

The `User` entity in `primary-data-service/src/entities/user.entity.ts` used TypeORM's `@UpdateDateColumn()` decorator, which maps to a column named `updated_at`:

```typescript
@UpdateDateColumn()
updated_at: Date;
```

However, the database schema in `infra/init-scripts/postgres/01-init-schema.sql` defined the `users` table **without** this column:

```sql
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username   VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    -- updated_at was missing!
);
```

TypeORM's `synchronize: false` setting (correct for production) means it does not auto-create or alter tables, so the mismatch caused a runtime SQL error.

### Fix

**Step 1 — Patched the running database** (live fix, no container restart needed):

```bash
docker exec erasegraph-postgres psql -U erasegraph -d erasegraph \
  -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
```

**Step 2 — Updated the schema file** so future fresh deployments include the column:

```sql
-- infra/init-scripts/postgres/01-init-schema.sql
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username   VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()   -- added
);
```

### Files Affected

- `infra/init-scripts/postgres/01-init-schema.sql` — `updated_at` column added to `users` table definition

---

## 6. Problem 5 — UUID Type Error in `primary-data-service`

### What Happened

Even after the `updated_at` fix, the `primary_data` step still failed for username-based subjects (e.g., `subject_id = "alice"`):

```
invalid input syntax for type uuid: "alice"
```

### Root Cause

The `processDeletion` method in `primary-data-service/src/deletion-consumer/deletion-consumer.service.ts` attempted to look up the user by `id` first, regardless of the format of `subject_id`:

```typescript
// Before fix — always passes subject_id as UUID column value
const byId = await this.userRepository.findOne({ where: { id: subject_id } });
```

When `subject_id` is `"alice"` (a plain string), PostgreSQL receives it as the value for a `UUID` column and immediately throws a type error before even executing a `WHERE` comparison.

### Fix

Added a UUID format validation check before querying by `id`. Only if `subject_id` matches the UUID pattern do we query the `id` column; otherwise we fall straight through to the `username` lookup:

```typescript
// After fix
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byId = uuidRegex.test(subject_id)
  ? await this.userRepository.findOne({ where: { id: subject_id } })
  : null;
const byUsername = byId
  ? null
  : await this.userRepository.findOne({ where: { username: subject_id } });
const user = byId || byUsername;
```

This also eliminates an unnecessary second database query when the subject is found by ID.

### Files Affected

- `primary-data-service/src/deletion-consumer/deletion-consumer.service.ts` — UUID guard added before `id` lookup

---

## 7. Problem 6 — `backup` Step Permanently PENDING

### What Happened

Every deletion request created three steps: `primary_data`, `cache`, and `backup`. The first two eventually resolved, but `backup` stayed `PENDING` forever. The overall request status therefore never reached `COMPLETED`.

### Root Cause

The `backup` step was registered in `backend/src/deletion-request/deletion-request.service.ts`:

```typescript
const steps = [
  { request_id: savedRequest.id, step_name: 'primary_data' },
  { request_id: savedRequest.id, step_name: 'cache' },
  { request_id: savedRequest.id, step_name: 'backup' },   // ← step created
];
```

But there was no `backup-service` consuming the `DeletionRequested` event to actually process this step and publish a result. Without a result event, the step row in the database was never updated from `PENDING`.

### Temporary Fix (during debugging)

Removed the `backup` step from the step list while the service was being built, so deletion requests could reach `COMPLETED` with two steps only. This allowed us to verify the rest of the pipeline worked correctly.

### Permanent Fix

Implemented the full `backup-service` (see Section 8) and restored the `backup` step in the backend service (see below).

**Restored in `backend/src/deletion-request/deletion-request.service.ts`:**

```typescript
const steps = [
  { request_id: savedRequest.id, step_name: 'primary_data' },
  { request_id: savedRequest.id, step_name: 'cache' },
  { request_id: savedRequest.id, step_name: 'backup' },   // ← restored
];
```

### Files Affected

- `backend/src/deletion-request/deletion-request.service.ts` — `backup` step restored to steps array

---

## 8. New Feature — `backup-service` Implementation

### What Was Built

A brand-new NestJS microservice (`backup-service`) that mirrors the structure of `cache-cleanup-service` and `primary-data-service`. It consumes `DeletionRequested` events from RabbitMQ, simulates purging backup records for the given subject, and publishes a `DeletionStepSucceeded` (or `DeletionStepFailed`) event back to the exchange.

### Architecture Decision

The service is intentionally simple and simulated — it does not connect to a real backup storage system (e.g., S3, GCS). This is appropriate for a demo/academic project. A short random latency (50–200ms) is added to simulate real I/O. The service always succeeds to ensure the pipeline can reach `COMPLETED` status reliably.

### File Structure Created

```
backup-service/
├── Dockerfile
├── nest-cli.json
├── package.json
├── package-lock.json          ← generated before Docker build
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── main.ts                ← NestJS bootstrap, /health endpoint, port 3005
    ├── app.module.ts          ← root module importing BackupConsumerModule
    ├── tracing.ts             ← OpenTelemetry SDK initialization
    ├── types/
    │   └── events.ts          ← shared event type interfaces
    └── backup-consumer/
        ├── backup-consumer.module.ts
        └── backup-consumer.service.ts   ← core business logic
```

### Key Implementation Details (`backup-consumer.service.ts`)

| Constant | Value |
|---|---|
| Exchange | `erasegraph.events` |
| Consume Queue | `erasegraph.deletion-requests.backup` |
| Success routing key | `step.succeeded` |
| Failure routing key | `step.failed` |
| Step name in events | `backup` |
| Service name in events | `backup` |

**Processing flow:**

```
1. Connect to RabbitMQ on startup (onModuleInit)
2. Assert consume queue (durable: true, prefetch: 1)
3. Assert publish exchange (topic, durable)
4. On each DeletionRequested message:
   a. Parse event JSON
   b. Simulate backup purge with random 50–200ms delay
   c. Publish DeletionStepSucceeded with metadata:
      { subject_id, backup_records_removed: 1, storage_backend: "simulated" }
5. ACK message on success; NACK (no requeue) on unhandled error
```

**`backup-consumer.service.ts` excerpt — core logic:**

```typescript
private async processBackupDeletion(event: DeletionRequestedEvent) {
  const { request_id, subject_id, trace_id } = event;
  try {
    const latency = 50 + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, latency));

    this.logger.log(`Purged backup records for subject_id=${subject_id} (${latency}ms)`);

    await this.publishSucceeded({
      request_id,
      step_name: 'backup',
      service_name: 'backup',
      trace_id,
      timestamp: new Date().toISOString(),
      metadata: { subject_id, backup_records_removed: 1, storage_backend: 'simulated' },
    });
  } catch (err: any) {
    await this.publishFailed({ /* ... */ });
  }
}
```

### `Dockerfile`

Follows the same pattern as `cache-cleanup-service` and `primary-data-service`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN addgroup -g 1001 -S nestjs && adduser -S -u 1001 nestjs
RUN chown -R nestjs:nestjs /app
USER nestjs
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3005/health || exit 1
EXPOSE 3005
CMD ["npm", "run", "start:prod"]
```

### OpenTelemetry Integration

`tracing.ts` registers the service as `erasegraph-backup-service` with the OTLP HTTP exporter, consistent with all other services in the stack. Traces are sent to Jaeger at `http://jaeger:4318/v1/traces`.

### Files Created

- `backup-service/Dockerfile`
- `backup-service/nest-cli.json`
- `backup-service/package.json`
- `backup-service/package-lock.json`
- `backup-service/tsconfig.json`
- `backup-service/tsconfig.build.json`
- `backup-service/src/main.ts`
- `backup-service/src/app.module.ts`
- `backup-service/src/tracing.ts`
- `backup-service/src/types/events.ts`
- `backup-service/src/backup-consumer/backup-consumer.service.ts`
- `backup-service/src/backup-consumer/backup-consumer.module.ts`

---

## 9. New Feature — Frontend Added to Docker Compose

### What Was Done

The `frontend/` directory contained a full React + TypeScript application but had no `Dockerfile` and was not included in `docker-compose.yml`. It also had a hardcoded API base URL pointing to `http://localhost:5000` (wrong port).

### Changes Made

**1. Created `frontend/Dockerfile`**

Multi-stage build: Node 18 Alpine builds the React app with `npm run build`, then nginx Alpine serves the static files. A custom nginx config is written inline to enable React Router's client-side navigation (SPA fallback — all routes serve `index.html`):

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
RUN echo 'server { \
  listen 80; root /usr/share/nginx/html; index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --tries=1 -O /dev/null http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

**2. Fixed `frontend/src/services/api.ts`**

Changed the hardcoded base URL to read from an environment variable with a sensible default:

```typescript
// Before
const API = axios.create({
  baseURL: "http://localhost:5000",   // wrong port, hardcoded
});

// After
const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3001",
});
```

**3. Added `frontend` block to `docker-compose.yml`**

```yaml
frontend:
  build:
    context: ../frontend
    dockerfile: Dockerfile
    args:
      REACT_APP_API_URL: http://localhost:3001
  container_name: erasegraph-frontend
  restart: unless-stopped
  ports:
    - "${FRONTEND_PORT:-3000}:80"
  depends_on:
    backend:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget -q --tries=1 -O /dev/null http://localhost:80/ || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 3
```

The frontend is accessible at **http://localhost:3000** after `docker compose up`.

### Files Created / Modified

- `frontend/Dockerfile` — created
- `frontend/src/services/api.ts` — base URL fixed
- `infra/docker-compose.yml` — `frontend` block added

---

## 10. RabbitMQ Queue Configuration for Backup

### What Was Done

RabbitMQ's topology (exchanges, queues, bindings) is bootstrapped from `infra/init-scripts/rabbitmq/definitions.json` on first container start. Since the `backup-service` is new, its queue and binding were missing from this file.

### Changes to `definitions.json`

**Added queue:**

```json
{
  "name": "erasegraph.deletion-requests.backup",
  "vhost": "/",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}
```

**Added binding** (routes `deletion.requested` events from the main exchange to the backup queue):

```json
{
  "source": "erasegraph.events",
  "vhost": "/",
  "destination": "erasegraph.deletion-requests.backup",
  "destination_type": "queue",
  "routing_key": "deletion.requested",
  "arguments": {}
}
```

### Live Configuration (without restart)

Because the RabbitMQ container was already running, we applied the configuration immediately via the Management HTTP API rather than restarting the container:

```bash
# Create the queue
curl -s -u erasegraph:erasegraph_secret -X PUT \
  http://localhost:15672/api/queues/%2F/erasegraph.deletion-requests.backup \
  -H "Content-Type: application/json" \
  -d '{"durable": true, "auto_delete": false, "arguments": {}}'

# Create the binding
curl -s -u erasegraph:erasegraph_secret -X POST \
  http://localhost:15672/api/bindings/%2F/e/erasegraph.events/q/erasegraph.deletion-requests.backup \
  -H "Content-Type: application/json" \
  -d '{"routing_key": "deletion.requested", "arguments": {}}'
```

The `backup-service` asserts the queue on startup as well (`consumerChannel.assertQueue(CONSUME_QUEUE, { durable: true })`), so even if the queue did not exist in advance, the service would create it idempotently.

### Files Affected

- `infra/init-scripts/rabbitmq/definitions.json` — backup queue and binding added

---

## 11. Complete File Change List

| File | Action | Summary |
|---|---|---|
| `primary-data-service/package-lock.json` | Created | Enables `npm ci` in Docker build |
| `cache-cleanup-service/package-lock.json` | Created | Enables `npm ci` in Docker build |
| `backup-service/` (entire directory) | Created | New NestJS microservice (12 files) |
| `frontend/Dockerfile` | Created | Multi-stage React → nginx image |
| `frontend/src/services/api.ts` | Modified | API base URL reads from env var |
| `infra/docker-compose.yml` | Modified | Added `proof-service`, `backup-service`, `frontend`; fixed backend healthcheck |
| `infra/init-scripts/postgres/01-init-schema.sql` | Modified | Added `updated_at` column to `users` table |
| `infra/init-scripts/rabbitmq/definitions.json` | Modified | Added backup queue and `deletion.requested` binding |
| `backend/src/deletion-request/deletion-request.service.ts` | Modified | Restored `backup` step; temporarily removed during debugging |
| `primary-data-service/src/deletion-consumer/deletion-consumer.service.ts` | Modified | UUID format guard before `id` lookup |

---

## 12. Final System State

After all changes, `docker compose up -d --build` starts the following 10 containers, all healthy:

| Container | Image | Port | Status |
|---|---|---|---|
| `erasegraph-backend` | `infra-backend` | `:3001` | ✅ healthy |
| `erasegraph-primary-data-service` | `infra-primary-data-service` | `:3002` | ✅ healthy |
| `erasegraph-cache-cleanup-service` | `infra-cache-cleanup-service` | `:3003` | ✅ healthy |
| `erasegraph-proof-service` | `infra-proof-service` | `:3004` | ✅ healthy |
| `erasegraph-backup-service` | `infra-backup-service` | `:3005` | ✅ healthy |
| `erasegraph-frontend` | `infra-frontend` | `:3000` | ✅ running |
| `erasegraph-postgres` | `postgres:16-alpine` | `:5434` | ✅ healthy |
| `erasegraph-redis` | `redis:7-alpine` | `:6379` | ✅ healthy |
| `erasegraph-rabbitmq` | `rabbitmq:3.13-management-alpine` | `:5672 / :15672` | ✅ healthy |
| `erasegraph-jaeger` | `jaegertracing/all-in-one:1.54` | `:16686` | ✅ healthy |

### Service URL Reference

| Service | URL | Notes |
|---|---|---|
| Frontend (React UI) | http://localhost:3000 | React SPA via nginx |
| Backend API | http://localhost:3001 | NestJS REST API |
| Backend Swagger Docs | http://localhost:3001/api/docs | OpenAPI documentation |
| Primary Data Service health | http://localhost:3002/health | |
| Cache Cleanup Service health | http://localhost:3003/health | |
| Proof Service health | http://localhost:3004/health | |
| Backup Service health | http://localhost:3005/health | |
| RabbitMQ Management UI | http://localhost:15672 | user: erasegraph / erasegraph_secret |
| Jaeger Distributed Tracing UI | http://localhost:16686 | Search traces by service name |

---

## 13. End-to-End Test Results

### Test — Submit Deletion for User `charlie`

**Request:**

```bash
curl -s -X POST http://localhost:3001/deletions \
  -H "Content-Type: application/json" \
  -d '{"subject_id": "charlie"}'
```

**Response (immediate):**

```json
{
  "request_id": "85edc111-46ca-4dcf-a3cc-c8b1fd1961cc",
  "status": "PENDING",
  "message": "Deletion request created successfully",
  "trace_id": "eedaa6f1-62bd-44cf-8f44-ce6e7ac1f808"
}
```

**Status after 35 seconds:**

```bash
curl -s http://localhost:3001/deletions/85edc111-46ca-4dcf-a3cc-c8b1fd1961cc
```

```json
{
  "id": "85edc111-46ca-4dcf-a3cc-c8b1fd1961cc",
  "subject_id": "charlie",
  "status": "COMPLETED",
  "trace_id": "eedaa6f1-62bd-44cf-8f44-ce6e7ac1f808",
  "created_at": "2026-04-24T00:55:09.109Z",
  "completed_at": "2026-04-24T00:55:39.167Z",
  "steps": [
    {
      "step_name": "primary_data",
      "status": "SUCCEEDED",
      "error_message": null
    },
    {
      "step_name": "cache",
      "status": "SUCCEEDED",
      "error_message": "[SIMULATED] Cache cleanup service temporarily unavailable (attempt 1)"
    },
    {
      "step_name": "backup",
      "status": "SUCCEEDED",
      "error_message": null
    }
  ]
}
```

### Observations

- **`primary_data` step:** Completed near-instantly (~60ms). The user row was located by `username = "charlie"` and deleted from PostgreSQL.
- **`cache` step:** Intentionally failed on attempt 1 (simulated failure), then automatically retried after a 30-second delay via the RabbitMQ dead-letter + TTL retry mechanism. Succeeded on attempt 2.
- **`backup` step:** Completed near-instantly (~100ms simulated latency). Backup records purged (simulated).
- **Overall status:** `COMPLETED` — all three steps succeeded.
- **Proof events:** All events (including the simulated cache failure) are recorded in `proof_events` table and returned by `GET /deletions/:id/proof`.

### Proof Audit Trail

```bash
curl -s http://localhost:3001/deletions/85edc111-46ca-4dcf-a3cc-c8b1fd1961cc/proof
```

The response includes a `verification_summary`:

```json
{
  "verification_summary": {
    "total_steps": 3,
    "succeeded_steps": 3,
    "failed_steps": 0,
    "services_involved": ["primary_data", "cache_cleanup", "backup"]
  }
}
```

