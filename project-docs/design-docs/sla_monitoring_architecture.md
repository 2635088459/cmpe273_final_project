# SLA Monitoring Architecture (DOC-SLA-001)

**Owner:** Sakshat Patil
**Scope:** SLA violation detection, recovery, and audit trail integration
**Related docs:** [failure_retry_design.md](failure_retry_design.md), [consistency_tradeoffs.md](consistency_tradeoffs.md)

---

## 1. Why SLA monitoring exists

A deletion request that is silently stuck in `PENDING`, `RUNNING`, or `PARTIAL_COMPLETED` is the worst possible state for a compliance system. A `FAILED` request at least surfaces in dashboards and operators know to investigate. A stuck request looks normal at the per-step level — some steps may even be `SUCCEEDED` — but the overall workflow is not progressing. From the data subject's perspective, their data is still in the system and the regulatory clock is still ticking.

**GDPR Article 17** requires erasure "without undue delay." **CCPA** requires fulfillment within 45 days. In both cases, the obligation falls on the controller to *know* when the deadline is being missed, not just react after the fact. SLA monitoring is the system's mechanism for that knowledge.

The SLA monitor flips a stuck request from "looks fine, nothing to see" to "explicitly flagged, with timestamps, in the proof chain." That converts a silent failure mode into a loud, observable signal.

---

## 2. Design constraints

| Constraint | Implication |
|---|---|
| Must not interfere with normal request processing | The monitor only **reads** request status and only **writes** when a violation is detected. It never modifies `deletion_steps` or republishes messages. |
| Must be cheap to run | Single SQL query per tick, indexed on `status` and `created_at`. No per-step iteration. |
| Must be deduplicated | A request stuck for 10 minutes should produce **one** SLA event in the proof chain, not 10. |
| Must be visible in the audit trail | Violations are append-only proof events with their own `event_type`, so auditors see them alongside other state transitions. |
| Must self-heal | Once the request reaches a terminal state, it leaves the violation list automatically — no manual cleanup. |
| Threshold must be configurable per environment | `SLA_THRESHOLD_MINUTES` is env-driven so test/dev/prod can have different thresholds without code changes. |

---

## 3. Component overview

```
┌────────────────────────────────────────────────────────────────┐
│                   Backend Orchestrator (NestJS)                 │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │  SlaMonitorService                                      │    │
│   │  • setInterval(60s, checkSlaViolations)                 │    │
│   │  • checkSlaViolations(): scans + flags + writes proof   │    │
│   │  • getSlaViolations(): lists all SLA_VIOLATED requests  │    │
│   └──────────┬──────────────────────────┬──────────────────┘    │
│              │                          │                         │
│              ▼                          ▼                         │
│   ┌──────────────────────┐    ┌──────────────────────┐          │
│   │ DeletionRequest      │    │ ProofEvent           │          │
│   │ Repository           │    │ Repository           │          │
│   │ (TypeORM)            │    │ (TypeORM)            │          │
│   └──────────┬───────────┘    └──────────┬───────────┘          │
│              │                            │                       │
│              ▼                            ▼                       │
│      ┌──────────────────────────────────────┐                    │
│      │       PostgreSQL                     │                    │
│      │  • deletion_requests (status, ...)   │                    │
│      │  • proof_events (event_type,         │                    │
│      │    dedupe_key, payload, ...)         │                    │
│      └──────────────────────────────────────┘                    │
│                                                                   │
│   ┌────────────────────────────────────────────────────────┐    │
│   │  AdminController                                        │    │
│   │  GET /admin/sla-violations                              │    │
│   │  → SlaMonitorService.getSlaViolations()                 │    │
│   └────────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼ HTTP/JSON
                  ┌──────────────────┐
                  │ Frontend Admin   │
                  │ page (React)     │
                  └──────────────────┘
```

---

## 4. Data model

### 4.1 New enum value

The existing `DeletionRequestStatus` enum gains one value:

```ts
export enum DeletionRequestStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  PARTIAL_COMPLETED = "PARTIAL_COMPLETED",
  FAILED = "FAILED",
  RETRYING = "RETRYING",
  SLA_VIOLATED = "SLA_VIOLATED",   // new
}
```

### 4.2 New proof event type

Proof events get a new `event_type`:

| `event_type`              | Written by                | Meaning                                    |
|---------------------------|---------------------------|--------------------------------------------|
| `DELETION_REQUESTED`      | backend orchestrator       | request created                            |
| `DELETION_STEP_RUNNING`   | cleanup workers            | worker accepted the message                |
| `DELETION_STEP_SUCCEEDED` | cleanup workers            | worker completed cleanup                   |
| `DELETION_STEP_FAILED`    | cleanup workers            | worker exhausted retries                   |
| `DELETION_STEP_RETRYING`  | cleanup workers            | worker scheduled a retry                   |
| `DUPLICATE_EVENT_IGNORED` | cleanup workers            | idempotency guard tripped                  |
| `CIRCUIT_OPEN_SKIP`       | cleanup workers            | message skipped — breaker is open          |
| **`SLA_VIOLATED`**        | **SlaMonitorService**      | **request stuck beyond threshold**         |

### 4.3 Deduplication

`proof_events` has a `dedupe_key` column. For SLA events, the key is:

```
sla-violated-<request_id>
```

A unique constraint on `(request_id, dedupe_key)` prevents duplicate inserts. The scanner attempts the insert; if it conflicts, the conflict is swallowed and no new row is created. Other proof writers use this same pattern with different prefixes (e.g., `duplicate-event-<event_id>` for idempotency).

---

## 5. The scanner

### 5.1 Loop

```ts
@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private intervalHandle?: NodeJS.Timeout;

  onModuleInit() {
    this.intervalHandle = setInterval(
      () => this.checkSlaViolations().catch((err) =>
        this.logger.error("SLA scan failed", err),
      ),
      60_000,
    );
  }

  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }
}
```

**Why `setInterval` and not `@nestjs/schedule`:**
- `@nestjs/schedule` would require adding a package and a `ScheduleModule` import for a single 60-second timer.
- `setInterval` works exactly the same and is one line. The `onModuleDestroy` hook prevents handle leaks across test runs.

### 5.2 Detection query

The scanner queries for rows in non-terminal status whose `created_at` is older than the threshold:

```sql
SELECT id, subject_id, created_at
FROM deletion_requests
WHERE status IN ('PENDING', 'RUNNING', 'PARTIAL_COMPLETED')
  AND created_at < (NOW() - INTERVAL '<threshold> minutes');
```

In TypeORM:

```ts
const cutoff = new Date(Date.now() - this.thresholdMinutes * 60 * 1000);
const stuck = await this.requestRepo.find({
  where: {
    status: In(['PENDING', 'RUNNING', 'PARTIAL_COMPLETED']),
    created_at: LessThan(cutoff),
  },
});
```

The threshold is read from `SLA_THRESHOLD_MINUTES` env at module init time. Default: 5 minutes. Tests run with 1 minute. Production starts at 5 minutes and can be raised per environment.

### 5.3 Per-violation flow

For each violating row, the scanner runs three writes inside a single transaction:

1. Update `deletion_requests.status` to `SLA_VIOLATED`.
2. Insert a `proof_events` row with:
   - `event_type = 'SLA_VIOLATED'`
   - `dedupe_key = 'sla-violated-<request_id>'`
   - `payload = { stuck_since: <created_at>, duration_minutes: <delta> }`
3. (No other change. The request's `deletion_steps` are not touched.)

The transaction ensures that a status update without a corresponding proof event — or vice versa — is impossible.

### 5.4 What the scanner never does

- Does **not** publish a RabbitMQ event. The SLA monitor is read-only against the message bus.
- Does **not** modify `deletion_steps`. Steps continue moving as workers eventually report.
- Does **not** terminate the request. Even after `SLA_VIOLATED`, late steps still update normally — the request can transition back to `PARTIAL_COMPLETED` or `COMPLETED` as work catches up.

The last point is critical: an SLA violation is an *operational* flag, not a state machine end. Once the violation is recorded, the request continues its lifecycle. This matches reality — a deletion that took an hour is still a successful deletion; the violation just documents that it took too long.

---

## 6. State transitions

A request can move into `SLA_VIOLATED` from three states:

```
PENDING ─────────────────┐
                          │
RUNNING ─────────────────┤
                          ├──► SLA_VIOLATED ──► (eventually) COMPLETED / PARTIAL_COMPLETED / FAILED
PARTIAL_COMPLETED ───────┘
```

The scanner does **not** flag `COMPLETED`, `FAILED`, or `RETRYING` — those are either terminal or self-recovering states.

### 6.1 Why RETRYING is excluded

`RETRYING` already signals that the system is working on the problem. Flagging it would generate noise. If retries themselves exhaust without success, the step becomes `FAILED` and the parent request becomes either `FAILED` or `PARTIAL_COMPLETED`, at which point the scanner re-evaluates on its next tick.

### 6.2 What if the scanner is slow?

If the scanner stops running (e.g., backend crashes), no new violations are flagged but existing flagged violations stay in `SLA_VIOLATED`. Restart recovers the loop. Worst-case detection lag: 60 seconds + threshold = 6 minutes by default.

---

## 7. API surface

### 7.1 GET /admin/sla-violations

Returns all requests currently in `SLA_VIOLATED` status.

Response shape:

```json
[
  {
    "request_id": "abcd-1234",
    "subject_id": "alice",
    "stuck_since": "2026-05-13T20:00:00.000Z",
    "duration_minutes": 42
  }
]
```

- `stuck_since` is the original `created_at` of the request.
- `duration_minutes` is computed at query time, not stored. This means the value increases on each call until the request leaves `SLA_VIOLATED`.

The endpoint deliberately returns an empty array (not 404) when there are no violations — easier for the frontend to consume.

### 7.2 No DELETE endpoint

There is intentionally no manual "dismiss" for a violation. Violations clear themselves when the request leaves `SLA_VIOLATED`. The only way out is:
- Workers eventually succeed → request transitions to `COMPLETED` / `PARTIAL_COMPLETED`.
- Workers fail terminally → request transitions to `FAILED`.
- DLQ replay reschedules messages → workers retry → request progresses.

This keeps the audit trail honest. A violation that was real cannot be hidden.

---

## 8. Recovery flow

The most common recovery scenario:

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Cache cleanup service is down                                 │
│     ↓                                                              │
│  2. Cache step never SUCCEEDED                                    │
│     ↓                                                              │
│  3. After threshold, request marked SLA_VIOLATED                  │
│     ↓                                                              │
│  4. Operator restarts cache service                                │
│     docker compose start cache-cleanup-service                    │
│     ↓                                                              │
│  5. Operator replays DLQ                                           │
│     POST /admin/dlq/cache-cleanup/replay                          │
│     ↓                                                              │
│  6. Cache worker consumes the replayed message                    │
│     ↓                                                              │
│  7. Cache step → SUCCEEDED, all steps now terminal                │
│     ↓                                                              │
│  8. Request → COMPLETED                                            │
│     ↓                                                              │
│  9. /admin/sla-violations stops returning this request            │
│                                                                    │
│  Proof chain: contains the SLA_VIOLATED event AND the eventual    │
│  step success events. Auditors see both — "it took too long, but  │
│  it did complete."                                                 │
└──────────────────────────────────────────────────────────────────┘
```

The proof chain is the *truth*. Even though the request now shows `COMPLETED`, the chain preserves the fact that it was once `SLA_VIOLATED`. That's the audit-friendly outcome.

---

## 9. Test coverage

The SLA subsystem has 14 unit tests across two files:

### 9.1 `asim_mohammed_sla-monitor.service.spec.ts` (9 tests)

- Flags `PENDING` requests older than threshold.
- Flags `RUNNING` requests older than threshold.
- Flags `PARTIAL_COMPLETED` requests older than threshold.
- Does **not** flag `COMPLETED` requests.
- Does **not** flag `FAILED` requests.
- Updates the `status` column to `SLA_VIOLATED` on flag.
- Writes a `proof_events` row with `event_type = SLA_VIOLATED`.
- Deduplicates: second scan does not insert a duplicate proof event.
- `getSlaViolations()` returns the expected shape (`request_id`, `subject_id`, `stuck_since`, `duration_minutes`).

### 9.2 `asim_mohammed_admin-sla.controller.spec.ts` (5 tests)

- `GET /admin/sla-violations` returns only `SLA_VIOLATED` requests.
- Returns `[]` (not 404) when no violations exist.
- Returned objects have correct field shape.
- Endpoint delegates to `SlaMonitorService.getSlaViolations()` (not direct DB access).
- Endpoint excludes requests in non-`SLA_VIOLATED` status.

Run with:

```bash
cd backend
npx jest --testPathPattern="asim_mohammed_sla|asim_mohammed_admin-sla" --no-coverage --forceExit
```

Expected: `14 tests passed, 2 suites`.

---

## 10. Threshold tuning

| Environment | Recommended threshold | Rationale |
|---|---|---|
| Local dev / demo | `1` minute | Shows violations live during a 5-minute demo without long waits |
| CI tests | `0` (or near 0) | Detect violations immediately for assertion in integration tests |
| Staging | `5` minutes | Realistic; catches genuinely stuck workflows; tolerates analytics 7s delay |
| Production | `15-60` minutes | Depends on workload — analytics jobs may legitimately take minutes |

The threshold should always be **greater than the longest expected legitimate processing time** for any single deletion. If analytics cleanup takes 30 seconds normally and spikes to 5 minutes under load, the threshold must be set above 5 minutes or you'll generate false positives during load spikes.

---

## 11. Failure modes and edge cases

### 11.1 Scanner runs more than once at the same time

This shouldn't happen with `setInterval` (single-process), but in a multi-pod deployment it could. Two concurrent scans would both try to insert the same `sla-violated-<request_id>` proof event. The unique constraint on `dedupe_key` (scoped per request) ensures only one insert succeeds; the other gets a PostgreSQL 23505 conflict and is swallowed. Net result: one violation event, regardless of how many scanners ran.

For the status update, both scanners would attempt `UPDATE ... SET status = 'SLA_VIOLATED' WHERE id = ? AND status = 'PENDING'` (or similar). PostgreSQL row-level locking serializes these — the second update is a no-op because the row is already `SLA_VIOLATED`.

### 11.2 Request transitions to COMPLETED *during* the scan

Race: the scanner reads a row as `PENDING` (stuck for 10 minutes), but between the SELECT and the UPDATE, the request completes. The scanner's UPDATE then sets `status = 'SLA_VIOLATED'` on a row that should now be `COMPLETED`.

Mitigation: the UPDATE includes a `WHERE status IN ('PENDING', 'RUNNING', 'PARTIAL_COMPLETED')` clause. If the status has already moved to `COMPLETED`, the UPDATE matches zero rows and the proof event insert is skipped.

### 11.3 Scanner crashes mid-batch

The per-violation transaction is atomic. If the process crashes after updating status but before the proof event insert, the row would be left as `SLA_VIOLATED` with no audit event. To prevent this, both writes happen in a single TypeORM transaction.

### 11.4 Threshold lowered dynamically

If an operator lowers `SLA_THRESHOLD_MINUTES` and restarts the backend, the scanner immediately flags every request older than the new threshold — even ones submitted hours ago. This is intentional. Lowering the threshold is a policy decision and should retroactively apply.

---

## 12. Frontend integration

The Admin page (`frontend/src/pages/Admin.tsx`) loads SLA violations alongside health and circuit breaker state in parallel via `Promise.allSettled`. The three sections render independently — a failure in one doesn't block the others.

The SLA violations section displays:

- Request ID (monospace font for distinguishability)
- Subject ID
- Duration in minutes (live-computed)
- Stuck-since timestamp (formatted in the user's locale)
- Red `SLA_VIOLATED` chip

There is no inline action on the frontend (no "dismiss" button, no "force complete"). Recovery is exclusively through DLQ replay or workers naturally completing. This is intentional — the audit trail must not contain operator-driven status forcing.

---

## 13. Future work

- **Multi-tenancy:** Per-org SLA thresholds keyed on a `tenant_id` column. Different customers have different compliance obligations.
- **Auto-replay on violation:** Trigger DLQ replay automatically when a violation is detected, rather than requiring operator action. Risky — replay can create cascading load.
- **Email / Slack alerts:** Push notification to ops channel when a violation is detected, with the request ID and a link.
- **Latency histogram:** Track per-request latency in a separate table or Prometheus metric so the threshold can be set as a percentile rather than a fixed value.
- **Trace-context propagation in the violation event:** Currently the proof event carries the request's trace ID. Add a span explicitly recorded for the violation so it shows up in Jaeger as a distinct event in the trace.

---

## 14. Summary

The SLA monitor is a 60-second background scanner that flips silent stalls into visible, auditable events. It writes only on detection, deduplicates so the proof chain stays clean, exposes its state through one read endpoint, and self-heals when the underlying issue is resolved. The whole subsystem is ~150 lines of NestJS service code plus 14 unit tests — small surface area, real operational value.

The single most important property: an SLA violation that was real cannot be hidden later. Even when the request eventually completes, the proof chain preserves the fact that it was once flagged. That is what makes the system auditable.
