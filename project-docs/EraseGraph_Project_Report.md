# EraseGraph: Verifiable Deletion Propagation Across Distributed Systems

**Haoyuan Shan & Vritika Malhotra**  
Master's in Software Engineering  
San Jose State University  
San Jose, United States  
haoyuan.shan@sjsu.edu · vritika.malhotra@sjsu.edu

**Sakshat Patil & Asim Mohammed**  
Master's in Software Engineering  
San Jose State University  
San Jose, United States  
sakshat.patil@sjsu.edu · asim.mohammed@sjsu.edu

---

## Abstract

EraseGraph is a distributed system for verifiable deletion propagation. The system coordinates the deletion of user data across multiple independent storage backends — primary database, cache, search index, analytics store, and backup records — from a single API request. Each cleanup step executes asynchronously through a message queue, reports its result as an event, and contributes to a tamper-evident proof chain signed with Ed25519. The platform handles transient failures with multi-stage retry queues and a dead-letter queue, permanent failures with circuit breakers, and operational stalls with SLA violation monitoring. A React dashboard provides real-time status updates over Server-Sent Events, a browsable proof timeline, and an admin panel for circuit breaker and SLA state. The system is deployed locally via Docker Compose and in the cloud via Kubernetes on Google Kubernetes Engine. EraseGraph demonstrates how distributed systems principles — event-driven fan-out, eventual consistency, idempotent message processing, and cryptographic auditability — apply directly to privacy-compliance use cases such as GDPR Article 17 right-to-erasure workflows.

**Index Terms** — Distributed Systems, Microservices, RabbitMQ, Event-Driven Architecture, Eventual Consistency, Retry Queue, Dead Letter Queue, Circuit Breaker, Idempotency, Cryptographic Proof, Ed25519, GDPR, Server-Sent Events, NestJS, PostgreSQL, Redis, Docker, Kubernetes, OpenTelemetry, Jaeger

---

## I. Introduction

In modern software platforms, user data is rarely stored in a single place. When a user creates an account, their data propagates to a primary relational database, a cache tier, a full-text search index, an analytics event store, and potentially several backup locations. Each of these stores is operated by a separate team, runs on different infrastructure, and has its own latency and failure characteristics.

When a user requests account deletion — or when privacy regulations such as GDPR Article 17 mandate erasure — deleting from only one store leaves data exposed in all the others. Manual coordination across teams is slow, error-prone, and produces no auditable evidence that deletion actually occurred.

EraseGraph addresses this problem. A single `POST /deletions` request triggers parallel deletion across all downstream stores. Each cleanup service runs independently, reports success or failure as a structured event, and the system aggregates these events into an overall request status and a cryptographically signed, hash-chained proof record. The proof can be exported and presented to auditors as evidence that deletion occurred across every required system.

The project's primary goal is pedagogical: to demonstrate distributed systems concepts — message-driven fan-out, eventual consistency, idempotency, retry/DLQ patterns, circuit breakers, and observability — in the context of a realistic compliance use case.

---

## II. System Architecture

EraseGraph is organized as a set of loosely coupled microservices communicating through RabbitMQ. Figure 1 shows the high-level architecture.

```
┌───────────────┐     HTTP/SSE      ┌─────────────────┐
│    Frontend   │ ◄───────────────► │ Backend (NestJS) │
│  (React/TS)   │                   │   Orchestrator   │
└───────────────┘                   └────────┬────────┘
                                             │ AMQP publish
                                    ┌────────▼────────┐
                                    │    RabbitMQ      │
                                    │ (erasegraph.     │
                                    │  events exchange)│
                                    └──────┬──┬──┬────┘
                          ┌───────────────┘  │  └───────────────┐
                          ▼                  ▼                   ▼
                  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
                  │ Primary Data │  │ Cache Cleanup │  │  Search Cleanup  │
                  │   Service    │  │   Service     │  │     Service      │
                  └──────┬───────┘  └──────┬────────┘  └───────┬──────────┘
                         │                 │                    │
                         └─────────────────▼────────────────────┘
                                  erasegraph.step-results
                                  (consumed by backend)
                                           │
                              ┌────────────▼───────────┐
                              │   Proof Service         │
                              │ (hash chain + Ed25519)  │
                              └─────────────────────────┘
```

### A. Frontend (React + TypeScript)

The frontend is a single-page application with five main views: a real-time deletion dashboard, a request history table, a proof timeline viewer, a demo users page, and an admin panel. It communicates with the backend over REST and uses a native `EventSource` (Server-Sent Events) connection for live status streaming on active requests. The application is served by Nginx in production.

### B. Backend Orchestrator (NestJS)

The backend is the central coordinator. It exposes a REST API, persists requests and steps in PostgreSQL via TypeORM, publishes `DeletionRequested` events to RabbitMQ, consumes step-result events from cleanup workers, and maintains the aggregate status of each request. It also hosts the SLA monitor, circuit-breaker admin endpoints, and the SSE streaming endpoint.

### C. Message Broker (RabbitMQ)

A single `erasegraph.events` exchange routes `DeletionRequested` events to five cleanup queues in parallel. Each cleanup service has its own main queue, a set of graded retry queues (5s, 10s, 20s TTL), and a dead-letter queue. Step results are published back to `erasegraph.step-results` where the backend event consumer updates request state.

### D. Cleanup Services

Five independent NestJS services handle deletion from one data store each:

| Service | Store | Notes |
|---|---|---|
| Primary Data Service | PostgreSQL users table | Removes the primary user row |
| Cache Cleanup Service | Redis | Evicts all keys scoped to the subject |
| Search Cleanup Service | Simulated search index | Removes indexed documents |
| Analytics Cleanup Service | Simulated analytics rows | Applies a configurable delay to demonstrate eventual consistency |
| Backup Service | Simulated GCS artifacts | Removes nightly, weekly, and compliance backup objects |

### E. Proof Service (NestJS)

Proof Service is a read/verify service. It reads `proof_events` from PostgreSQL, reconstructs the hash chain, verifies the Ed25519 signature, and returns a structured attestation. The `proof_events` table is append-only; no service updates or deletes proof records.

### F. Infrastructure

PostgreSQL stores `deletion_requests`, `deletion_steps`, `proof_events`, and `processed_events` (for idempotency). Redis stores circuit breaker state (`circuit:<service>:state`, `circuit:<service>:failure_count`, `circuit:<service>:open_until`). Jaeger collects OpenTelemetry traces. Prometheus scrapes metrics from all services. Grafana visualizes request rates, success/failure ratios, and service latency.

### G. API Gateway (Optional)

An optional NestJS gateway sits in front of the backend and validates `X-Service-Token: erasegraph_internal_token` on all non-health requests, returning `401 Unauthorized` without a valid token.

---

## III. Functionalities

### A. Deletion Request Lifecycle

A `POST /deletions` request with a `subject_id` creates a `deletion_request` row (status `PENDING`) and five `deletion_steps` rows (one per service). The backend publishes a `DeletionRequested` event with a unique `event_id`, `request_id`, `subject_id`, and `trace_id`. Each cleanup worker consumes the event, performs its cleanup, and publishes `DeletionStepSucceeded` or `DeletionStepFailed`. The backend event consumer updates step status and recomputes overall request status:

- All steps `SUCCEEDED` → `COMPLETED`
- Some steps `SUCCEEDED`, at least one still pending → `PARTIAL_COMPLETED`
- All steps terminal, at least one `SKIPPED_CIRCUIT_OPEN` → `PARTIAL_COMPLETED`
- Any step `FAILED` after exhausting retries → `FAILED`

### B. Retry, DLQ, and Circuit Breaker

When a cleanup step fails transiently, the service publishes `DeletionStepRetrying`, updates the step to `RETRYING`, and routes the message to a graded retry queue. The message TTL expires and the message is dead-lettered back to the main queue for another attempt. After three retries, the message moves to the dead-letter queue and the step is marked `FAILED`.

Circuit breaker state is stored in Redis with three states:

- **CLOSED**: normal operation — messages are processed.
- **OPEN**: three consecutive failures have occurred — new messages are skipped immediately, proof events record `CIRCUIT_OPEN_SKIP`, steps are marked `SKIPPED_CIRCUIT_OPEN`.
- **HALF_OPEN**: the 30-second open window has expired — the next message is treated as a test probe.

If the half-open probe succeeds, the breaker returns to `CLOSED`. If it fails, it opens again. The admin endpoint `GET /admin/circuits` exposes the current state of all circuit breakers.

The `POST /admin/dlq/cache-cleanup/replay` endpoint drains the DLQ and republishes each message to the main exchange so operators can manually retry failed batches after fixing an upstream issue.

### C. Idempotent Message Processing

Each `DeletionRequested` event carries a unique `event_id`. Before running cleanup, a service atomically inserts `event_id` into the `processed_events` table. If the insert conflicts (PostgreSQL error 23505), the message is acknowledged without re-running cleanup and a `DUPLICATE_EVENT_IGNORED` proof event is recorded. This guarantees exactly-once cleanup semantics even when RabbitMQ redelivers messages after a broker or consumer restart.

### D. Cryptographic Proof Chain

Every state transition in the deletion workflow produces a `proof_event` row containing a `service` name, `event_type`, JSON `payload`, `timestamp`, and a `hash` field. Each hash is computed as `SHA-256(previous_hash + current_payload_json)`, forming a tamper-evident chain. The final proof payload is signed with an Ed25519 key; the signature and public key are returned alongside the proof so any third party can verify authenticity without trusting the EraseGraph server.

`GET /deletions/:id/proof/verify` returns:

```json
{
  "verified": true,
  "algorithm": "Ed25519",
  "key_id": "7fb7271ab2fbfa77",
  "services_verified": 5,
  "chain_intact": true
}
```

### E. Real-Time Status Streaming

`GET /deletions/:id/stream` is a Server-Sent Events endpoint. The backend polls request state every 1.5 seconds and pushes JSON payloads to the connected client. The stream closes automatically when the request reaches `COMPLETED` or `FAILED`. The frontend uses a native `EventSource` object; when a request reaches a terminal state, the event source is closed and no further network activity occurs.

### F. SLA Violation Monitoring

A `SlaMonitorService` runs on a 60-second interval. On each tick it queries `deletion_requests` for rows in `PENDING`, `RUNNING`, or `PARTIAL_COMPLETED` status whose `created_at` is older than the configured `SLA_THRESHOLD_MINUTES` (default: 5 minutes). Violating rows are updated to `SLA_VIOLATED` and a deduplicated proof event of type `SLA_VIOLATED` is appended to the proof chain. `GET /admin/sla-violations` returns all violating requests with `request_id`, `subject_id`, `stuck_since`, and `duration_minutes`.

### G. Bulk CSV Deletion

`POST /deletions/bulk` accepts a CSV file upload. `BulkDeletionService` parses the buffer, deduplicates `subject_id` values, skips blank rows, and creates one deletion request per unique subject ID. The response reports per-row status (`created` or `skipped`), the reason for any skip, and the generated `request_id` for each created row. The frontend `/bulk` page provides a file picker, upload button, and a results table.

---

## IV. Persona and Use Cases

### A. End Users / Data Subjects

A user exercises their GDPR Article 17 right to erasure by submitting a deletion request through the frontend. They receive confirmation that their data has been removed from every store and can download the signed proof as evidence.

### B. Privacy and Compliance Teams

Compliance officers use the History page to search deletion records by subject ID or status. They can export a signed proof package (JSON or PDF) for each request as a legally admissible audit artifact. The SLA violations panel alerts them to requests that have not completed within the policy window.

### C. Platform / SRE Teams

Site reliability engineers use the Admin panel to monitor service health (`GET /health/all`), inspect circuit breaker states, and identify SLA violations. They can drain and replay the DLQ after resolving an upstream issue without re-submitting deletion requests from the UI.

### D. Privacy Operations at Scale

Operators upload a CSV of subject IDs through the Bulk Upload page to process mass-deletion events — for example, a data breach notification requiring immediate erasure of all affected accounts. Per-row status reporting makes it easy to identify which rows were created versus skipped for deduplication.

---

## V. Technologies Used

### A. React + TypeScript (Frontend)

React was chosen for its component model and efficient rendering. TypeScript enforces type safety across API response shapes and component props. The frontend is built with `react-scripts` and served by Nginx in production. Key libraries: `react-router-dom` (client-side routing), native `EventSource` API (SSE), native `fetch` API (no third-party HTTP client).

### B. NestJS + TypeScript (Backend and Microservices)

NestJS provides a structured, module-based application architecture built on Node.js and Express. It offers first-class support for dependency injection, TypeORM integration, Swagger documentation generation (`@nestjs/swagger`), and the `@Sse` decorator for Server-Sent Events. All seven backend services (orchestrator, proof, five cleanup workers) are NestJS applications.

### C. PostgreSQL + TypeORM

PostgreSQL is the primary relational store. TypeORM maps entities to tables and handles migrations. The `processed_events` table uses a unique constraint on `event_id` as the idempotency guard, relying on PostgreSQL's conflict detection for atomic check-and-insert semantics.

### D. Redis

Redis stores circuit breaker state with key-based TTL for the `open_until` field. The cache cleanup service reads and writes user data cache keys from Redis. Redis was chosen for its atomic `SET NX` and key-expiry semantics, which are a natural fit for circuit breaker state management.

### E. RabbitMQ

RabbitMQ implements the message bus for event-driven fan-out and retry flows. The `erasegraph.events` topic exchange routes events by routing key to worker queues. Retry queues use RabbitMQ's native `x-message-ttl` and `x-dead-letter-exchange` properties to implement time-delayed re-delivery without application-level timers.

### F. OpenTelemetry + Jaeger

Each service is instrumented with the OpenTelemetry SDK. Traces are exported to a Jaeger OTLP collector. Because all services share the same `trace_id` (propagated in the `DeletionRequested` event payload and AMQP headers), a single trace in Jaeger shows the entire lifecycle of a deletion request across all microservices.

### G. Prometheus + Grafana

Prometheus scrapes a `/metrics` endpoint from each service. Grafana dashboards visualize request throughput, step latency distributions, retry rates, and circuit breaker state changes. These are the same metrics an SRE team would watch in production.

### H. Docker Compose + Kubernetes (GKE)

Local development runs with a single `docker compose up -d --build` from the `infra/` directory. Cloud deployment uses Kubernetes manifests in `k8s/` targeting Google Kubernetes Engine. Kubernetes enables pod-level failure recovery demos: killing a cleanup service pod and watching it restart and resume message processing is a live demonstration of self-healing infrastructure.

### I. Ed25519 (Cryptographic Proof)

Ed25519 is a modern elliptic-curve signature scheme chosen for its small key sizes, fast verification, and resistance to side-channel attacks. The backend generates a keypair on startup; the private key signs the final proof payload hash; the public key is embedded in the proof response so any client can verify the signature offline using standard cryptographic libraries.

---

## VI. Testing

### A. Backend Integration Tests (Jest)

The backend integration test suite (`backend/test/`) covers the full deletion workflow against a live PostgreSQL and RabbitMQ instance:

- `POST /deletions` creates a request with `PENDING` status and five `PENDING` steps.
- `GET /deletions/:id` returns correct shape and step list.
- `GET /deletions/:id/proof` returns proof events with hash and signature fields.
- `GET /health` returns `{ status: "ok" }`.
- Swagger docs are accessible at `/api/docs`.
- RabbitMQ routing delivers events to cleanup queues.

13 of 13 integration tests pass.

### B. Reliability Unit Tests (Jest)

| File | Tests | Coverage |
|---|---|---|
| `vritika_malhotra_circuit-breaker.service.spec.ts` | 3 | CLOSED→OPEN after 3 failures; OPEN blocks processing; OPEN→HALF_OPEN after 30s |
| `vritika_malhotra_dlq-replay.service.spec.ts` | 2 | Re-publishes DLQ messages; NotFoundException for invalid queue name |
| `vritika_malhotra_idempotency.spec.ts` | 3 | New event_id returns true; duplicate returns false; DUPLICATE_EVENT_IGNORED proof event recorded |

### C. SLA Monitoring Unit Tests (Jest)

| File | Tests | Coverage |
|---|---|---|
| `asim_mohammed_sla-monitor.service.spec.ts` | 9 | Flags PENDING/RUNNING/PARTIAL_COMPLETED; skips COMPLETED; updates status; writes SLA_VIOLATED proof event; deduplicates proof events |
| `asim_mohammed_admin-sla.controller.spec.ts` | 5 | Returns SLA_VIOLATED requests; empty array on healthy system; correct field shape; delegates to SlaMonitorService |

14 of 14 SLA unit tests pass.

### D. Bulk Deletion Unit Tests (Jest)

| File | Tests | Coverage |
|---|---|---|
| `bulk-deletion.service.spec.ts` | 4 | 3 rows → 3 requests; blank rows skipped; duplicate rows deduplicated; 5-row mixed scenario |
| `bulk-deletion.controller.spec.ts` | 3 | No file → 400; non-CSV file → 400; valid CSV → 200 with correct shape |

7 of 7 bulk deletion tests pass.

### E. Frontend Testing (Jest + React Testing Library)

Frontend unit tests cover individual React components and API call mocking. Key scenarios: form submission triggers correct API call; SSE connection opens on active request and closes on terminal status; proof verified badge renders green on `verified: true` and red on `verified: false`; history table filters by status and subject ID.

---

## VII. Distributed Systems Design Decisions

### A. Why Asynchronous Fan-Out Instead of Synchronous Calls

A synchronous approach would call each cleanup service sequentially over HTTP. The total latency would be the sum of all service latencies. A failure in any one call would require the caller to decide whether to roll back or ignore. With asynchronous fan-out through RabbitMQ, all five services start simultaneously. Total latency is bounded by the slowest service, not the sum. Failures are handled by the retry/DLQ subsystem independently of the orchestrator.

### B. Why `PARTIAL_COMPLETED` Is a First-Class Status

`PARTIAL_COMPLETED` encodes two distinct situations: the fast services have finished but analytics is still running (mid-workflow eventual consistency), and all services are terminal but one was circuit-breaker-skipped (terminal partial outcome). Using `PARTIAL_COMPLETED` instead of hiding this state behind `RUNNING` makes the system's actual consistency level visible to operators, which is essential for a compliance use case.

### C. Why SSE Instead of WebSockets

The status stream is unidirectional: the server pushes updates, the client only reads. WebSockets add bidirectional complexity, require sticky sessions in Kubernetes, and need extra load balancer configuration. SSE runs over plain HTTP/2, is natively supported by every modern browser via `EventSource`, and requires no library. For a read-only status stream, SSE is strictly simpler.

### D. Why `setInterval` for SLA Scanning Instead of a Cron Library

Adding `@nestjs/schedule` would introduce a package dependency and a `ScheduleModule` import for a single 60-second interval. `setInterval` in `onModuleInit` is functionally identical for this use case and introduces zero new dependencies. The handle is cleared in `onModuleDestroy` to prevent timer leaks in test teardown.

### E. Why Deduplicate SLA_VIOLATED Proof Events

The SLA scanner runs every 60 seconds. A request stuck for 10 minutes would otherwise accumulate 10 identical `SLA_VIOLATED` events, polluting the audit trail. Deduplication via a `dedupe_key` column (`sla-violated-<request_id>`) keeps the proof chain clean and matches the existing deduplication pattern used across the rest of the proof subsystem.

---

## VIII. Conclusion

EraseGraph demonstrates that distributed systems principles — event-driven fan-out, eventual consistency, retry with exponential backoff, dead-letter queues, circuit breakers, idempotent message processing, and cryptographic auditability — are not abstract concepts. They arise naturally from a concrete compliance problem: how do you prove that a user's data has been deleted from every system in a microservice fleet?

The system handles the happy path (all five services succeed within seconds), transient failures (retry queue schedules re-delivery, request eventually completes), permanent failures (circuit breaker skips the service, request completes with `PARTIAL_COMPLETED`), and operational stalls (SLA monitor flags stuck requests, DLQ replay lets operators recover without re-submission). Each behavior is observable through Jaeger traces, Prometheus metrics, Grafana dashboards, and the EraseGraph frontend itself.

Future work could include: persistent proof storage on an immutable ledger (IPFS or a blockchain), webhook delivery of the signed proof to the data subject on completion, multi-tenancy with per-organization retention policies, and extending the SLA monitor to trigger automated DLQ replay rather than requiring manual operator intervention.

---

## Team Member Contributions

| Member | Primary Contributions |
|---|---|
| **Haoyuan Shan** | Backend API foundation (BACKEND-001, 002): `POST /deletions`, `GET /deletions/:id`, `GET /deletions/:id/proof`, PostgreSQL/TypeORM integration, RabbitMQ event publishing, OpenTelemetry tracing, Swagger docs, Kubernetes manifests (GKE), cloud deployment, pod recovery demo |
| **Vritika Malhotra** | Reliability subsystem: retry queues, DLQ, circuit breakers, idempotency (`processed_events`), DLQ replay endpoint, API gateway, demo failure injection, bulk CSV deletion (`POST /deletions/bulk`), Bulk Upload frontend page, Demo Users page, frontend dashboard and proof view improvements |
| **Sakshat Patil** | Frontend real-time UX: SSE dashboard auto-refresh, proof timeline and export (JSON/PDF), history page with filter/search, admin panel (health, circuit breakers, SLA violations), SSE backend endpoint (`@Sse :id/stream`), SLA violation monitoring backend (`SlaMonitorService`, `GET /admin/sla-violations`) |
| **Asim Mohammed** | Consistency semantics: status state machine design, `PARTIAL_COMPLETED` semantics, event-driven completion logic, consistency tradeoffs documentation, SLA violation unit tests (`asim_mohammed_sla-monitor.service.spec.ts`, `asim_mohammed_admin-sla.controller.spec.ts`) |

---

*CMPE 273 — Distributed Systems, Spring 2026, San Jose State University*  
*Group 6 — EraseGraph*
