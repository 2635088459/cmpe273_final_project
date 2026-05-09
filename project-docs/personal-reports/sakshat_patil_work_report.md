# EraseGraph — Sakshat Patil: Work Report & Demo Guide

**Author:** Sakshat Patil  
**Course:** CMPE 273 — Distributed Systems (Spring 2026, SJSU)  
**Date:** May 2026

---

## Overview

My work covers two scopes: the **frontend real-time user interface** (FRONTEND-001 through FRONTEND-004) and **SLA Violation Monitoring & Alerts** (the Phase 3 extension task). Together these features close the gap between the backend's distributed deletion pipeline and a human operator — making it possible to see every step in real time, browse history, audit proof chains, and get alerted when a deletion has been stalled too long.

---

## 1. What I Built

### 1.1 Dashboard Auto-Refresh (FRONTEND-001)

**File:** `frontend/src/pages/Home.tsx`

The dashboard previously required a manual page reload to see status changes. I replaced that with two complementary mechanisms:

- **SSE (EventSource):** When a request is selected and is still active (PENDING / RUNNING / RETRYING), the frontend opens a `GET /deletions/:id/stream` connection. The backend pushes JSON payloads every 1.5 seconds until the status reaches COMPLETED or FAILED, then closes the connection.
- **Polling fallback:** A `setInterval` runs every 5 seconds when SSE is not available. A toggle button lets the user pause auto-refresh when inspecting a request manually.

The backend SSE endpoint (added to `DeletionRequestController`) uses NestJS `@Sse` decorator and returns an `Observable<MessageEvent>`:

```typescript
@Sse(':id/stream')
streamDeletionStatus(@Param('id') id: string): Observable<MessageEvent> {
  return new Observable((observer) => {
    const poll = async () => {
      const request = await this.deletionRequestService.getDeletionRequest(id);
      observer.next({ data: request });
      if (['COMPLETED', 'FAILED'].includes(request.status)) {
        observer.complete();
        clearInterval(handle);
      }
    };
    poll();
    const handle = setInterval(poll, 1500);
    return () => clearInterval(handle);
  });
}
```

**Why this matters:** In a microservice deletion workflow, individual steps may take seconds each. Polling with a 5-second delay means the UI could be 5 seconds behind reality. SSE pushes updates as they arrive so the operator sees each step turn green in near real time.

---

### 1.2 Proof Timeline + Export (FRONTEND-002)

**File:** `frontend/src/pages/Home.tsx`

Proof events were previously shown as raw JSON. I replaced this with:

- A **vertical timeline** (`timeline-list`) where each event card shows timestamp, service name, event type, and a colored result indicator.
- **Expandable detail panels** — clicking "View details" on any event shows its full JSON payload.
- A **Proof Verified ✓ / Proof Tampered ✗ badge** that calls `GET /deletions/:id/proof/verify` and color-codes the result green or red.
- **Export JSON** — downloads the full proof object as a `.json` file.
- **Export PDF** — generates a print-ready HTML document in a hidden iframe and triggers `window.print()` so the user gets a PDF via the browser's print dialog.

**Why this matters:** GDPR deletion requests create an audit trail. The proof timeline makes that trail readable to non-engineers (compliance teams, auditors). The export features allow the audit evidence to be stored offline.

---

### 1.3 SSE Backend Endpoint (FRONTEND-003)

**File:** `backend/src/deletion-request/deletion-request.controller.ts`

`GET /deletions/:id/stream` is a Server-Sent Events endpoint that:
- Immediately fetches and emits the current request state.
- Continues polling at 1500ms intervals and pushing updates.
- Emits a final event and completes the stream when status reaches COMPLETED or FAILED.
- Propagates a 404 error if the request ID doesn't exist (the observable errors out, closing the connection with an error event).

The frontend uses a native `EventSource` (no library required). The subscription is scoped to the selected request ID via `useEffect` — when the selected request changes or reaches a terminal state, the old `EventSource` is closed automatically.

---

### 1.4 History Page + Admin Panel (FRONTEND-004)

**History page (`/history`) — `frontend/src/pages/History.tsx`:**

A tabular view of all deletion requests (up to 50) with:
- **Status filter dropdown** — sends `?status=COMPLETED` etc. to `GET /deletions`
- **Subject ID search box** — sends `?search=...` to the same endpoint
- **Clear filters** button
- **View button** — navigates to `Home.tsx` with `location.state.requestId` pre-set so the correct request is auto-selected and its proof view is opened immediately.

**Admin panel (`/admin`) — `frontend/src/pages/Admin.tsx`:**

Three sections, all loaded in parallel via `Promise.allSettled`:

| Section | Endpoint | What it shows |
|---|---|---|
| Service health | `GET /health/all` | Green "UP" / red "DOWN" badge per microservice, last-seen timestamp |
| Circuit breakers | `GET /admin/circuits` | CLOSED / OPEN / HALF_OPEN chip per service, failure count, open-until time |
| SLA violations | `GET /admin/sla-violations` | Request ID, subject, stuck_since, duration in minutes, red `SLA_VIOLATED` badge |

The page has a manual "Refresh" button and shows the last-refreshed time. Errors for each section are shown independently — if health fails but circuits succeed, the circuits section still renders.

---

### 1.5 SLA Violation Monitoring & Alerts (Extension Phase 3)

**Files:**
- `backend/src/admin/sla-monitor.service.ts`
- `backend/src/admin/admin.controller.ts` (new endpoint)
- `backend/src/admin/admin.module.ts` (wiring)
- `backend/src/database/entities/deletion-request.entity.ts` (new enum value)
- `backend/src/admin/asim_mohammed_sla-monitor.service.spec.ts` (unit tests)
- `backend/src/admin/asim_mohammed_admin-sla.controller.spec.ts` (unit tests)

#### Motivation

A deletion request that is silently stuck in PENDING or RUNNING is worse than a FAILED request — at least FAILED is visible. A stuck request means user data is not being deleted even though the user submitted a GDPR request. GDPR Article 17 requires "undue delay" to be avoided; practically this means operators need to know when a deletion has stalled.

#### How it works

1. **Scheduled scanner:** `SlaMonitorService` starts a `setInterval` (60-second cadence) on module init. On each tick it calls `checkSlaViolations()`.

2. **Violation detection:** The method queries `deletion_requests` for rows with status `PENDING`, `RUNNING`, or `PARTIAL_COMPLETED` whose `created_at` is older than `SLA_THRESHOLD_MINUTES` (default: 5 minutes, configurable via env).

3. **Status update:** Each violating row is updated to `SLA_VIOLATED`. This new enum value was added to `DeletionRequestStatus`.

4. **Proof chain entry:** A `ProofEvent` of type `SLA_VIOLATED` is written to `proof_events` with deduplication — if an event with the same `dedupe_key` (`sla-violated-<request_id>`) already exists, the insert is skipped. This means the violation is visible in `GET /deletions/:id/proof`.

5. **Admin endpoint:** `GET /admin/sla-violations` returns all `SLA_VIOLATED` requests with:
   - `request_id`
   - `subject_id`
   - `stuck_since` (the original `created_at` timestamp)
   - `duration_minutes` (computed at query time)

6. **Recovery:** Once the pipeline resumes (e.g. after replaying the DLQ via `POST /admin/dlq/:queue/replay`), the request transitions to COMPLETED and disappears from the violations list automatically because `getSlaViolations()` only queries for `SLA_VIOLATED` status.

#### Threshold configuration

```env
# .env or docker-compose environment
SLA_THRESHOLD_MINUTES=1   # lower for testing
SLA_THRESHOLD_MINUTES=5   # production default
```

---

## 2. Unit Tests

All unit tests are in `backend/src/admin/`:

| File | Test count | What is tested |
|---|---|---|
| `asim_mohammed_sla-monitor.service.spec.ts` | 9 | flags stuck PENDING/RUNNING/PARTIAL_COMPLETED; skips COMPLETED; updates status column; records SLA_VIOLATED proof event; deduplicates proof events; getSlaViolations shape |
| `asim_mohammed_admin-sla.controller.spec.ts` | 5 | returns only SLA_VIOLATED requests; empty array on healthy system; correct field shape; delegates to SlaMonitorService |

**Run with:**
```bash
cd backend
node_modules/.bin/jest \
  --testPathPattern="asim_mohammed_sla|asim_mohammed_admin-sla" \
  --no-coverage --forceExit
```

Expected output: `14 tests passed, 2 suites`.

---

## 3. Demo Script

**File:** `scripts/sakshat_patil_demo.sh`

Automated curl-based script that runs against a live backend. Requires `curl` and `jq`.

```bash
chmod +x scripts/sakshat_patil_demo.sh
./scripts/sakshat_patil_demo.sh
```

**Tests performed:**
1. Backend reachability pre-flight
2. Submit a fresh deletion request
3. Verify `GET /deletions/:id/stream` responds with `Content-Type: text/event-stream`
4. Verify `GET /deletions/:id` returns correct shape
5. Verify `GET /deletions` list with status filter and search filter
6. Verify proof endpoints (`/proof` and `/proof/verify`)
7. Verify `GET /health/all` returns services map
8. Verify `GET /admin/circuits` returns array
9. Verify `GET /admin/sla-violations` returns array with correct field shape
10. Run SLA + Admin Controller unit test suite

---

## 4. Class Demo Walkthrough

**Pre-demo setup (before class):**
```bash
cd infra
docker-compose up -d
# Confirm all services are up
curl http://localhost:3001/health/all | jq .
```

### Step 1 — Dashboard real-time update (FRONTEND-001 + 003)
1. Open `http://localhost:3000`
2. Click **Create deletion request**, enter a subject ID like `demo-user-alice`
3. Watch the steps update from grey → blue → green without any page refresh
4. Point out that the "Auto-refresh on" button is visible and can be toggled off
5. Show DevTools → Network → Filter "EventStream" to demonstrate the SSE connection

### Step 2 — Proof timeline + verification (FRONTEND-002)
1. Select the completed request in the dashboard
2. Show the proof timeline (each event card with timestamp, service, event type)
3. Show the **Proof Verified ✓** green badge
4. Click "Export JSON" — show the file downloads
5. **Tamper demo:** Open the database:
   ```bash
   docker exec -it erasegraph-postgres psql -U erasegraph erasegraph \
     -c "UPDATE proof_events SET payload = '{\"tampered\":true}' WHERE request_id = '<ID>' LIMIT 1;"
   ```
6. Refresh the proof view — badge now shows **Proof Tampered ✗** in red

### Step 3 — History page (FRONTEND-004 Part A)
1. Navigate to `http://localhost:3000/history`
2. Show the table listing all past requests
3. Use the **Status** dropdown to filter by COMPLETED — only completed rows remain
4. Type a subject ID in the search box — only matching rows appear
5. Click **View** on a row — navigates back to the dashboard with that request pre-selected

### Step 4 — Admin panel (FRONTEND-004 Part B)
1. Navigate to `http://localhost:3000/admin`
2. Show all services with green "UP" badges
3. Show circuit breakers all "CLOSED"
4. Stop one container to trigger a DOWN:
   ```bash
   docker-compose stop primary-data-service
   ```
5. Click **Refresh** — that service now shows a red "DOWN" badge

### Step 5 — SLA Violation Monitoring (Extension SLA-001)
1. Set the threshold low so we don't have to wait long:
   ```bash
   # Edit .env and add:
   SLA_THRESHOLD_MINUTES=1
   docker-compose restart backend
   ```
2. Stop cache-cleanup-service to stall a deletion mid-pipeline:
   ```bash
   docker-compose stop cache-cleanup-service
   ```
3. Submit a new deletion request from the UI
4. Wait ~90 seconds
5. Open the Admin page — the **SLA Violations** section shows the stuck request with `SLA_VIOLATED` badge
6. Call the proof endpoint to show the violation is recorded in the audit trail:
   ```bash
   curl -s http://localhost:3001/deletions/<ID>/proof | jq '[.proof_events[] | select(.event_type=="SLA_VIOLATED")]'
   ```
7. Resume the service and replay the DLQ:
   ```bash
   docker-compose start cache-cleanup-service
   curl -s -X POST http://localhost:3001/admin/dlq/cache-cleanup/replay | jq .
   ```
8. The request eventually moves to COMPLETED and disappears from the SLA violations list

---

## 5. Design Decisions

### Why SSE instead of WebSockets?
WebSockets require a bidirectional upgrade and extra infrastructure (sticky sessions in Kubernetes, load balancer config). SSE is unidirectional (server → client), runs over plain HTTP/2, and is natively supported by `EventSource` in every modern browser with no library. For a read-only status stream, SSE is the right tool.

### Why setInterval for the SLA scanner instead of @nestjs/schedule?
`@nestjs/schedule` would require adding a package dependency and a `ScheduleModule` import. For a 60-second scan interval, `setInterval` in `onModuleInit` is functionally identical and introduces zero new dependencies. `onModuleDestroy` cleans up the handle to prevent timer leaks in tests.

### Why deduplicate the SLA_VIOLATED proof event?
The scanner runs every 60 seconds. Without deduplication, a request that stays stuck for 10 minutes would accumulate 10 identical `SLA_VIOLATED` proof events, making the audit trail noisy. A single event with a unique `dedupe_key` is cleaner and matches the existing pattern used by other services in the proof chain.

### Why add SLA_VIOLATED to the existing DeletionRequestStatus enum rather than a separate flag?
The status column is already the primary observable on the `deletion_requests` table. Adding a new value means the violations naturally appear when filtering `GET /deletions?status=SLA_VIOLATED`, no extra join or column needed. The existing `updateRequestStatusIfNeeded` logic in `DeletionRequestService` is not affected because it only touches rows transitioning to COMPLETED/FAILED/PARTIAL_COMPLETED through step completion — the SLA scanner operates on a separate code path.

---

## 6. Files Changed / Created

| File | Type | Description |
|---|---|---|
| `backend/src/database/entities/deletion-request.entity.ts` | Modified | Added `SLA_VIOLATED` to enum |
| `backend/src/admin/sla-monitor.service.ts` | **New** | SLA scanner, `checkSlaViolations()`, `getSlaViolations()` |
| `backend/src/admin/admin.controller.ts` | Modified | Added `GET /admin/sla-violations` |
| `backend/src/admin/admin.module.ts` | Modified | Wired `SlaMonitorService`, TypeORM repositories |
| `backend/src/deletion-request/deletion-request.controller.ts` | Modified | Added `@Sse :id/stream` endpoint |
| `backend/src/admin/asim_mohammed_sla-monitor.service.spec.ts` | **New** | 9 unit tests for SlaMonitorService |
| `backend/src/admin/asim_mohammed_admin-sla.controller.spec.ts` | **New** | 5 unit tests for AdminController SLA endpoint |
| `frontend/src/pages/Home.tsx` | Modified | Auto-refresh, SSE EventSource, proof timeline, export, verify badge |
| `frontend/src/pages/History.tsx` | **New** | History table with filter + search + View button |
| `frontend/src/pages/Admin.tsx` | **New** | Service health, circuit breakers, SLA violations sections |
| `frontend/src/services/api.ts` | Modified | `getSlaViolations()`, `SlaViolation` type, `getCircuitStates()`, `getHealthAll()`, `getDeletionProofVerify()` |
| `frontend/src/components/Navbar.tsx` | Modified | Added /history and /admin nav links |
| `project-docs/subject_resolution_design.md` | **New** | DOC-SVC-001 design doc |
| `project-docs/personal-reports/sakshat_patil_work_report.md` | **New** | This document |
| `scripts/sakshat_patil_demo.sh` | **New** | Automated demo + verification script |
