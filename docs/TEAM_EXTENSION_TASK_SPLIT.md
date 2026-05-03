# EraseGraph — Team Extension Task Split

**Project:** EraseGraph: Verifiable Deletion Propagation Across Microservices  
**Team size:** 4 members

---

## Overview

The basic six-step flow is working. To make the final project stronger, we want to add more features that show real distributed systems behavior — things like retry when a service fails, eventual consistency with delayed cleanup, tamper-proof audit records, and Kubernetes deployment. Each person owns one area so work doesn't overlap.

---

## Task Split Summary

| Member | Code Tasks | Doc Task | Demo Focus |
|---|---|---|---|
| Vritika Malhotra | Retry/DLQ, idempotency, failure injection, **circuit breaker** | Failure/retry design doc | Show failure → retry → DLQ → circuit open |
| Member 2 | Search cleanup service, analytics cleanup service (delayed), tamper-evident proof hash chain, **notification service** | Consistency tradeoffs doc | Show multi-service deletion + GDPR notification |
| Haoyuan Shan | Kubernetes manifests, pod recovery demo, metrics endpoint, **rate limiting + health aggregation** | Kubernetes deployment guide | Show K8s deployment + pod restart + health dashboard |
| Sakshat Patil | Dashboard upgrade (all steps + auto-refresh), proof timeline view, real-time SSE status updates, **history page + admin panel** | Subject resolution service design doc | Show full UI flow + proof verification + admin view |

Each member has 4 code tasks and 1 doc task.

---

## Vritika Malhotra

### CODE-REL-001: Retry Queue + Dead Letter Queue

**What to do:**
- Add retry exchange and retry queue in RabbitMQ
- If a cleanup service fails, requeue the message with a delay (5s, 10s, 20s)
- Track retry count in message headers
- After max retries (3), send message to DLQ
- Update `deletion_steps.status` to `RETRYING` during retries
- Record retry events in `proof_events`

**Done when:**
- Failed message retries automatically and shows in RabbitMQ UI
- After max retries, message shows in DLQ queue
- Dashboard shows `RETRYING` state between attempts

**Demo:** Submit a deletion, force cache to fail, show retries in RabbitMQ UI, show message landing in DLQ.

---

### CODE-REL-002: Idempotency for Duplicate Events

**What to do:**
- Add `processed_events` table to track which event IDs were already handled
- Before processing a message, check if `event_id` already exists
- If duplicate, skip cleanup logic and just ack the message
- Add a proof event `DUPLICATE_EVENT_IGNORED` when this happens

```sql
CREATE TABLE processed_events (
    event_id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Done when:**
- Publishing the same event twice doesn't double-process or break request status
- Duplicate is visible in proof/audit

**Demo:** Manually publish the same RabbitMQ event twice, show only one cleanup happens.

---

### CODE-REL-003: Failure Injection Flag

**What to do:**
- Add an env variable or simple naming rule to force failures during demo
- Example: if subject ID starts with `fail-`, the cache service fails on first attempt
- This way we can trigger failure without changing code during presentation

**Done when:** Team can trigger a controlled failure during the demo without code changes.

---

### CODE-REL-004: Circuit Breaker Pattern

**What to do:**
- Add a `CircuitBreakerService` in the backend that tracks failure counts per downstream service
- Three states stored in Redis: `CLOSED` (normal), `OPEN` (skip — service is down), `HALF_OPEN` (send one test message)
- Threshold: after 3 consecutive failures, trip to OPEN for 30 seconds, then move to HALF_OPEN
- When circuit is OPEN, immediately record a `CIRCUIT_OPEN_SKIP` proof event and mark step as `SKIPPED_CIRCUIT_OPEN`
- On success in HALF_OPEN, reset back to CLOSED
- Expose current circuit states via `GET /admin/circuits`

```typescript
// Redis keys: circuit:<service_name>:state, circuit:<service_name>:failure_count
// States: 'CLOSED' | 'OPEN' | 'HALF_OPEN'

async canProcess(serviceName: string): Promise<boolean> {
  const state = await redis.get(`circuit:${serviceName}:state`);
  if (state === 'OPEN') return false;
  return true;
}
```

**Done when:**
- After 3 injected failures on one service, `GET /admin/circuits` shows that service as `OPEN`
- New deletion requests skip that service during OPEN state without timing out
- Circuit auto-recovers after 30s and processes normally again

**Demo:** Inject failures on cache service, watch circuit open, show skip in proof, wait for recovery.

---

### DOC-REL-001: Failure Handling Design Doc

**File:** `docs/failure_retry_design.md`

Write a short doc covering:
- Why async systems need retry logic
- How our retry queue and DLQ work
- What happens to a message at each step
- Include a screenshot of RabbitMQ queues
- Explain the difference between `RETRYING`, `FAILED`, and `PARTIAL_COMPLETED`
- Explain circuit breaker states and when each triggers

---

### Member 1 — Optional (after all main tasks above are done)

- **Event replay from DLQ:** Add a `POST /admin/dlq/:queue/replay` endpoint that re-publishes all messages in a DLQ queue back to the main exchange. This lets the team manually recover from a failure without restarting anything.
- **API gateway with service token validation:** Add a lightweight NestJS gateway service (port 3000) that sits in front of the backend and validates a `X-Service-Token` header. All internal service-to-service calls must pass this token. Helps demonstrate basic zero-trust between services.

---

## Member 2 — New Services + Proof Hash Chain

### CODE-SVC-001: Search Cleanup Service

**What to do:**
- Create a new `search-cleanup-service` NestJS app (can copy structure from `cache-cleanup-service`)
- Simulate a search index using a PostgreSQL table called `search_index_documents`
- Consume `DeletionRequested` events, delete rows by `subject_id`, publish success/fail event
- Add to `docker-compose.yml` and create a `Dockerfile`

```sql
CREATE TABLE search_index_documents (
    id UUID PRIMARY KEY,
    subject_id VARCHAR(100) NOT NULL,
    indexed_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Done when:** Deletion request shows `search_cleanup` as one of the steps in the status API.

**Demo:** Seed fake search data for a user, submit deletion, show data removed, show step in proof.

---

### CODE-SVC-002: Analytics Cleanup Service with Delay

**What to do:**
- Create `analytics-cleanup-service` that waits 5-10 seconds before finishing
- Use a `analytics_events` PostgreSQL table, mark rows as deleted instead of hard delete
- While waiting, deletion request status should be `PARTIAL_COMPLETED`
- After delay, publish success and request becomes `COMPLETED`

**Done when:** Dashboard shows some steps finish fast but analytics is still running for several seconds.

**Demo:** Show that primary/cache/search finish first, but analytics takes longer — this is eventual consistency.

---

### CODE-PROOF-001: Tamper-Evident Proof Hash Chain

**What to do:**
- Add `previous_hash` and `event_hash` columns to `proof_events`
- Each event hashes: `previous_hash + request_id + service_name + event_type + payload + created_at`
- Add a `GET /deletions/:id/proof/verify` endpoint that checks if the chain is intact
- Frontend shows `Proof Verified ✓` or `Proof Tampered ✗`

```sql
ALTER TABLE proof_events
ADD COLUMN previous_hash VARCHAR(128),
ADD COLUMN event_hash VARCHAR(128);
```

**Done when:** Modifying one event in the database makes the verify endpoint return false.

**Demo:** Show valid proof, then manually update one row in postgres, show verification fails.

---

### DOC-CONSISTENCY-001: Consistency Tradeoffs Doc

**File:** `docs/consistency_tradeoffs.md`

Write a short doc covering:
- Why deletion isn't instant in distributed systems
- Which of our services need strong consistency vs. eventual consistency
- Why `PARTIAL_COMPLETED` is a valid state, not a bug
- Example timeline showing analytics finishing after primary/cache

---

### CODE-SVC-003: Deletion Notification Service

**What to do:**
- Create a new `notification-service` NestJS app (copy structure from `cache-cleanup-service`)
- Subscribe to the `DeletionCompleted` and `DeletionFailed` events on RabbitMQ
- When received, insert a row into a `deletion_notifications` table:

```sql
CREATE TABLE deletion_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    subject_id VARCHAR(100) NOT NULL,
    notification_type VARCHAR(50) NOT NULL, -- 'DELETION_COMPLETE' | 'DELETION_FAILED'
    message TEXT NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Add `GET /deletions/:id/notification` endpoint to the backend — returns the notification record for a request
- This simulates the GDPR requirement to notify the user that their data was deleted

**Done when:**
- After a deletion completes, a row appears in `deletion_notifications`
- `GET /deletions/:id/notification` returns the confirmation record
- If deletion failed, notification type is `DELETION_FAILED` with reason

**Demo:** Complete a deletion, call the notification endpoint, show the confirmation record.

---

### Member 2 — Optional (after all main tasks above are done)

- **Right to Know — Data Report endpoint:** Add `GET /users/:id/data-report` to the backend. This endpoint queries each service's data table (`search_index_documents`, `analytics_events`, `cache` Redis keys, etc.) and returns a summary of what data exists for this user across all services. This implements the GDPR Right of Access — users can see their data before requesting deletion. Return JSON like: `{ "primary_db": { "exists": true, "record_count": 1 }, "search_index": { "exists": true, "record_count": 3 }, "analytics": { "exists": true, "record_count": 12 } }`.
- No additional optional tasks otherwise. If ahead of schedule, help Member 1 with the API gateway middleware.

---

## Haoyuan Shan — Kubernetes + Observability

### CODE-INFRA-001: Kubernetes Manifests

**What to do:**
- Create a `k8s/` folder with manifests for all services
- Each service needs a `Deployment` and a `Service`
- Use `ConfigMap` for env variables, `Secret` for passwords
- Add readiness and liveness probes (health check endpoints already exist)
- Set 2 replicas for the backend service to show horizontal scaling

```
k8s/
  namespace.yaml
  configmap.yaml
  secrets.yaml
  postgres/  redis/  rabbitmq/  jaeger/
  backend/  primary-data-service/  cache-cleanup-service/
  search-cleanup-service/  analytics-cleanup-service/
  proof-service/  backup-service/  frontend/
  ingress.yaml
```

**Done when:** `kubectl apply -f k8s/` starts all services and the deletion workflow still works.

**Demo:** Show `kubectl get pods`, submit a deletion, show it still completes inside K8s.

---

### CODE-INFRA-002: Kubernetes Pod Recovery Demo

**What to do:**
- Add a small script `scripts/k8s-kill-pod.sh` that kills one service pod
- During an active deletion request, kill the analytics-cleanup-service pod
- Show Kubernetes automatically restarting it
- Show the deletion eventually completes once the pod comes back

**Done when:** Killing a pod doesn't permanently break the workflow.

**Demo:** Start a deletion, kill a pod mid-way, show pod restart, show request still completing.

---

### CODE-OBS-001: Metrics Endpoint

**What to do:**
- Add a `GET /metrics` endpoint to the backend service
- Expose basic counters: total requests, completed, failed, current retry count
- Format can be plain JSON (no need for full Prometheus format unless time allows)
- Optional: add a simple Grafana dashboard in Docker Compose

**Done when:** `curl http://localhost:3001/metrics` returns meaningful numbers.

---

### CODE-INFRA-003: API Rate Limiting + Service Health Aggregation

**What to do:**

**Part A — Rate Limiting:**
- Add a NestJS `ThrottlerGuard` (from `@nestjs/throttler`) to the backend, backed by Redis
- Limit: 20 requests per 60 seconds per IP address
- On limit exceeded, return HTTP 429 with a `Retry-After` header
- This prevents abuse and shows production-readiness

```typescript
ThrottlerModule.forRoot({
  storage: new ThrottlerStorageRedisService(redisClient),
  throttlers: [{ ttl: 60, limit: 20 }],
})
```

**Part B — Service Health Aggregation:**
- Add `GET /health/all` endpoint to the backend
- It calls each internal service's `/health` endpoint (all NestJS apps expose this by default via `@nestjs/terminus`)
- Caches last-known status in Redis with a 10-second TTL so the endpoint is fast even if a service is down
- Returns structured JSON:

```json
{
  "primary-data-service": { "status": "UP", "checkedAt": "2026-04-27T..." },
  "cache-cleanup-service": { "status": "DOWN", "lastSeenUp": "2026-04-27T..." },
  "proof-service": { "status": "UP", "checkedAt": "2026-04-27T..." }
}
```

**Done when:**
- Sending >20 requests/min to any endpoint returns 429
- `GET /health/all` returns live status of all services
- Killing one container shows it as DOWN in health check

---

### DOC-K8S-001: Kubernetes Deployment Guide

**File:** `docs/kubernetes_deployment_guide.md`

Write a guide covering:
- Prerequisites (Docker Desktop K8s or Minikube)
- How to deploy with `kubectl apply`
- How to check pod status
- How to access each service
- How to run the pod recovery demo
- Common kubectl commands for troubleshooting

---

### Member 3 — Optional (after all main tasks above are done)

- **Helm chart:** Convert the `k8s/` manifests into a proper Helm chart under `helm/erasegraph/`. Add a `values.yaml` so environment-specific config (image tags, replica count, secrets) can be overridden without editing individual files. Run `helm install erasegraph ./helm/erasegraph` to verify it deploys cleanly.
- **Prometheus + Grafana:** Add Prometheus and Grafana containers to `docker-compose.yml`. Configure Prometheus to scrape the backend `/metrics` endpoint (from `CODE-OBS-001`). Build a Grafana dashboard showing: total requests, completed vs failed count, current retry count, and request throughput over time.

---

## Member 4 — Frontend + Real-Time Features

### CODE-FE-001: Dashboard Upgrade

**What to do:**
- Update the dashboard to show all steps: `primary_data`, `cache`, `search_cleanup`, `analytics_cleanup`, `backup`
- Add auto-refresh every 5 seconds when status is not yet `COMPLETED` or `FAILED`
- Show `RETRYING` status with a different color (orange/yellow)
- Add a "stop auto-refresh" toggle button

**Done when:** Dashboard updates on its own and shows all 5+ cleanup steps.

---

### CODE-FE-002: Proof Timeline + Export

**What to do:**
- Add a vertical timeline view for proof events (instead of just JSON)
- Each row shows: timestamp, service name, event type, status icon
- Add an "Export JSON" button that downloads the full proof as a `.json` file
- If `CODE-PROOF-001` is done, show `Proof Verified ✓` badge at the top

**Done when:** User can see proof as a readable timeline and download it.

**Demo:** Open proof view, show events in order, export JSON, show verification badge.

---

### CODE-FE-003: Real-Time Status Updates via Server-Sent Events

**What to do:**
- Add a `GET /deletions/:id/stream` endpoint to the backend that sends SSE events
- Every time a deletion step status changes, push an event to the client
- On the frontend, replace the manual poll with an `EventSource` connection
- When status becomes `COMPLETED` or `FAILED`, close the connection automatically
- Fall back to 5-second polling if SSE is not supported

```typescript
// Backend: send SSE events when step status changes
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.write(`data: ${JSON.stringify(stepUpdate)}\n\n`);
```

```typescript
// Frontend: connect to SSE stream
const source = new EventSource(`/deletions/${requestId}/stream`);
source.onmessage = (e) => setStatusResult(JSON.parse(e.data));
```

**Done when:** Dashboard updates in real time as each step finishes, with no polling delay.

---

### CODE-FE-004: Deletion History Page + Admin Panel

**What to do:**

**Part A — Deletion History Page (`/history`):**
- New page that calls `GET /deletions?limit=50` and shows all past requests in a table
- Columns: Subject ID, Status badge (colored), Steps done / total, Created at, View button
- Add a status filter dropdown (All / PENDING / COMPLETED / FAILED) and a subject ID search box
- Clicking "View" navigates to the existing detail + proof view for that request
- This re-uses the existing backend endpoint with no backend changes needed

**Part B — Admin Panel (`/admin`):**
- New page with two sections:
  1. **System Health** — calls `GET /health/all` (from `CODE-INFRA-003`) and shows each service as a green/red status badge
  2. **Circuit Breaker States** — calls `GET /admin/circuits` (from `CODE-REL-004`) and shows CLOSED/OPEN/HALF_OPEN per service
- Add the `/history` and `/admin` routes to `App.tsx` and links in the `Navbar`

**Done when:**
- `/history` shows all past deletions with working filter and search
- `/admin` shows live service health and circuit states
- All 4 pages are linked in the navbar

---

### DOC-SVC-001: Subject Resolution Service Design

**File:** `docs/subject_resolution_design.md`

Write a short design doc covering:
- Why different services may store data under different internal IDs for the same user
- Example: primary DB uses UUID, cache uses `user:{username}`, search index uses email
- How a subject resolution step at the start of a deletion workflow fixes this
- Proposed table schema:

```sql
CREATE TABLE subject_mappings (
    external_user_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    internal_subject_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (external_user_id, service_name)
);
```

- How this makes the system more realistic and closer to GDPR compliance
- What API changes would be needed if we built it

---

### Member 4 — Optional (after all main tasks above are done)

- **Subject resolution service (full implementation):** Build what the design doc describes. Create the `subject_mappings` table and a `SubjectResolutionModule` in the backend. Before the deletion workflow starts, look up the internal ID for each registered service and include it in the event payload. Update `primary-data-service`, `cache-cleanup-service`, and any other consumers to use `internalSubjectId` from the event instead of raw `subjectId`.

---

## What to Finish First

If there isn’t enough time, finish in this order:

1. **CODE-REL-001** (retry/DLQ) — most important missing behavior
2. **CODE-SVC-001** + **CODE-SVC-002** (search + analytics services) — two new downstream services
3. **CODE-FE-001** (dashboard auto-refresh + all steps) — makes the UI match the backend
4. **CODE-REL-004** (circuit breaker) — prevents cascading failures, a core distributed systems pattern
5. **CODE-SVC-003** (notification service) — completes the GDPR story end-to-end
6. **CODE-FE-004** (history page + admin panel) — makes the app genuinely useful beyond a demo
7. **CODE-INFRA-003** (rate limiting + health aggregation) — shows real production readiness
8. **CODE-FE-003** (SSE real-time updates) — replaces manual polling with real push
9. **CODE-INFRA-001** (Kubernetes) — explicit bonus from project README
10. **CODE-PROOF-001** (hash chain) — tamper-resistant proof, strong academic angle
11. **CODE-FE-002** (proof timeline + export) — visual polish
12. **CODE-INFRA-002** + **CODE-OBS-001** — extra if time allows

---

## Optional Tasks

Optional tasks are now listed at the end of each member’s section above. Complete all your main tasks first before touching these.

