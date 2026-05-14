# EraseGraph — Frontend & SLA Monitoring Demo Runbook

**Author:** Sakshat Patil
**Scope:** FRONTEND-001 through FRONTEND-004, BACKEND-003, BACKEND-004, SLA-001
**Audience:** Demo presenter (you), graders watching the demo, teammates running it

---

## 1. Pre-demo checklist

Run this sequence ~10 minutes before the demo. Each command should return cleanly.

```bash
# 1. Confirm Docker is running
docker info > /dev/null && echo "docker ok"

# 2. Bring the stack up (notification-service uses 3011 if 3010 is held)
cd infra
NOTIFICATION_SERVICE_PORT=3011 docker compose up -d
cd ..

# 3. Wait for healthy
sleep 25
docker compose -f infra/docker-compose.yml ps --format "{{.Names}}\t{{.Status}}"

# 4. Backend reachability
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3001/health/all | jq '.overall'

# 5. Frontend reachable
curl -s -o /dev/null -w "frontend HTTP %{http_code}\n" http://localhost:3000/

# 6. Reset demo data so primary-data deletions return non-zero records
curl -s -X POST http://localhost:3001/users/restore-demo | jq .
```

Open three browser tabs ahead of time:

- **Tab A — Dashboard:** http://localhost:3000/
- **Tab B — Admin:** http://localhost:3000/admin
- **Tab C — History:** http://localhost:3000/history

Have one terminal window open at the project root for the tamper demo SQL.

Have a notes app open with these subject IDs ready to paste:

- `alice` — happy path
- `fail-alice` — transient failure, then retry success
- `fail-always-bob` — permanent failure, DLQ
- `fail-open-charlie` — repeated failures, circuit breaker trips

---

## 2. Step-by-step demo script

### Step 1 — Real-time dashboard via Server-Sent Events (FRONTEND-001, FRONTEND-003)

**What you say:**

> "The dashboard reflects each step in near real time without polling. Watch the steps turn green individually."

**What you do:**

1. Switch to Tab A (Dashboard).
2. Click **Create deletion request**.
3. Enter `alice` and submit.
4. Open DevTools → Network → filter `stream`. Point at the EventStream connection that just opened.
5. Watch each of the five service rows turn from PENDING → RUNNING → SUCCEEDED. Analytics will take the longest (built-in 7-second delay).
6. Once all five are green, observe the EventStream connection closes automatically (the row disappears from Network).

**What the audience sees:**

- Each cleanup step ticking through three colors over ~10 seconds total.
- A live SSE channel scoped to that request, then auto-closed.
- The "Auto-refresh on" toggle next to the request row (you don't have to click it, just point it out).

**Verification one-liner if you want to prove SSE end-to-end:**

```bash
curl -s -N http://localhost:3001/deletions/<request-id>/stream | head -5
```

That `-N` (no buffering) shows the chunked `data:` payloads pushed by the backend.

---

### Step 2 — Proof timeline + Ed25519 attestation + export (FRONTEND-002)

**What you say:**

> "Every state transition writes an immutable proof event with a hash chain. We sign the final payload with Ed25519 so an external auditor can verify the signature without trusting our server."

**What you do:**

1. With the completed request still selected, click **View proof**.
2. Show the vertical timeline. Each event has timestamp, service, event type, and an expandable JSON payload.
3. Click **Verify Proof Chain**.
   - Green badge appears: ✓ Proof verified (hash chain intact).
   - Below it: cryptographic attestation block — algorithm `Ed25519`, key ID, services verified `5`, signed payload SHA-256, Base64 signature, public key PEM.
4. Click **Export JSON**. Show the downloaded file in the browser's download tray. Open it briefly to show the structure.
5. (Optional) Click **Export PDF**. The browser print dialog appears.

**What the audience sees:**

- A timeline they can scroll, with every step's payload available.
- A cryptographic attestation block they could hand to a regulator.
- One-click export to a portable evidence file.

---

### Step 3 — Tamper detection (FRONTEND-002 + proof chain)

**What you say:**

> "If anyone tampers with even one row in the proof chain, verification fails immediately. Let me prove it."

**What you do:**

1. From your terminal:

   ```bash
   docker exec -it erasegraph-postgres psql -U erasegraph -d erasegraph -c \
     "UPDATE proof_events SET payload = '{\"tampered\": true}'::jsonb \
      WHERE request_id = (SELECT id FROM deletion_requests ORDER BY created_at DESC LIMIT 1) \
      LIMIT 1;"
   ```

2. Back on the proof page in Tab A, click **Verify Proof Chain** again.

**What the audience sees:**

- Badge flips from green ✓ to red ✗ Chain tampered.
- Cryptographic attestation block now shows `verified: false`.

**Cleanup before moving on:**

```bash
# Reset by submitting a fresh request
curl -s -X POST http://localhost:3001/deletions \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"reset-after-tamper"}'
```

---

### Step 4 — History page with search and filters (FRONTEND-004 Part A)

**What you say:**

> "All past requests are searchable from the History page. Compliance teams use this view."

**What you do:**

1. Switch to Tab C (History).
2. Point at the table: subject ID, status chip, steps done, created time, View button.
3. Filter by status: select `COMPLETED` from the dropdown. Only completed rows remain.
4. Type a subject ID in the search box (e.g., `alice`). Only matching rows appear.
5. Click **Clear filters**. All rows return.
6. Click **View** on a row. The dashboard opens with that request pre-selected.

**What the audience sees:**

- Live filtering happens against `GET /deletions?status=...&search=...&limit=50` (open the Network tab to show the query string changing).
- View navigates back to the dashboard with state so the user lands on the right request.

---

### Step 5 — Admin panel (FRONTEND-004 Part B)

**What you say:**

> "SRE teams need to know which services are healthy, which circuit breakers are tripped, and which requests are exceeding the SLA. The admin panel surfaces all three."

**What you do:**

1. Switch to Tab B (Admin).
2. Show the three sections side by side:
   - **Service health:** green UP badges for every service, last-checked timestamps.
   - **Circuit breaker states:** CLOSED chips for all five cleanup services.
   - **SLA violations:** empty state ("All active requests are within the SLA threshold").
3. To force a DOWN badge, run in a terminal:

   ```bash
   docker compose -f infra/docker-compose.yml stop primary-data-service
   ```

4. On the Admin page, click **Refresh**.

**What the audience sees:**

- `primary_data_service` now shows a red DOWN badge with the last seen up timestamp.
- The "services up" / "services down" counters in the hero panel update from 5/0 to 4/1.

**Re-start the service before moving on:**

```bash
docker compose -f infra/docker-compose.yml start primary-data-service
```

---

### Step 6 — SLA violation monitoring (SLA-001)

**What you say:**

> "GDPR Article 17 requires deletion without undue delay. We define an SLA threshold; a scanner runs every 60 seconds and flags any request that's been stuck longer. Operators can recover the request via DLQ replay, and the SLA violation is recorded in the proof chain."

**Pre-step setup (do this before the demo, not during):**

Lower the threshold so you don't have to wait 5 minutes mid-demo:

```bash
# Add to infra/docker-compose.yml's backend env block or .env:
SLA_THRESHOLD_MINUTES=1

docker compose -f infra/docker-compose.yml restart backend
```

**What you do during the demo:**

1. Stop one of the cleanup services to stall a deletion mid-pipeline:

   ```bash
   docker compose -f infra/docker-compose.yml stop cache-cleanup-service
   ```

2. Switch to Tab A. Submit a deletion request with subject `sla-demo-alice`.
3. Wait ~80 seconds. The request will sit in `PARTIAL_COMPLETED` because cache cleanup never reports.
4. Switch to Tab B (Admin) and click **Refresh**.
5. The **SLA Violations** section now lists the request with `SLA_VIOLATED` chip, subject ID, duration in minutes, and the timestamp it first became stuck.

**Show the violation in the proof chain:**

```bash
curl -s http://localhost:3001/deletions/<request-id>/proof | \
  jq '[.proof_events[] | select(.event_type=="SLA_VIOLATED")]'
```

**Show the violation in the database:**

```bash
docker exec -it erasegraph-postgres psql -U erasegraph -d erasegraph -c \
  "SELECT id, subject_id, status, created_at FROM deletion_requests WHERE status = 'SLA_VIOLATED';"
```

**Recover the request:**

```bash
# 1. Bring the cache service back up
docker compose -f infra/docker-compose.yml start cache-cleanup-service

# 2. Replay the DLQ to resubmit any stuck messages
curl -s -X POST http://localhost:3001/admin/dlq/cache-cleanup/replay | jq .
```

After ~10 seconds, refresh Admin again. The request transitions to `COMPLETED` and disappears from the SLA violations list.

---

## 3. API reference for verification during the demo

If the audience asks for proof beyond what's on the UI, every part of the demo is verifiable via curl.

### Create a deletion request

```bash
curl -s -X POST http://localhost:3001/deletions \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"alice"}' | jq .
```

### Stream live updates

```bash
curl -s -N http://localhost:3001/deletions/<request-id>/stream
```

### Get request state

```bash
curl -s http://localhost:3001/deletions/<request-id> | jq .
```

### Get proof events

```bash
curl -s http://localhost:3001/deletions/<request-id>/proof | jq '.proof_events | length'
```

### Verify proof chain

```bash
curl -s http://localhost:3001/deletions/<request-id>/proof/verify | jq .
```

### Get cryptographic attestation

```bash
curl -s http://localhost:3001/deletions/<request-id>/proof/attestation | jq .
```

### List requests with filters

```bash
curl -s "http://localhost:3001/deletions?status=COMPLETED&limit=10" | jq '.count'
curl -s "http://localhost:3001/deletions?search=alice&limit=10" | jq '.items[].subject_id'
```

### Service health

```bash
curl -s http://localhost:3001/health/all | jq .
```

### Circuit breaker states

```bash
curl -s http://localhost:3001/admin/circuits | jq .
```

### SLA violations

```bash
curl -s http://localhost:3001/admin/sla-violations | jq .
```

### DLQ replay

```bash
curl -s -X POST http://localhost:3001/admin/dlq/cache-cleanup/replay | jq .
```

---

## 4. Unit test verification

If a grader wants to see tests for the features:

```bash
# Frontend (Admin, History, Home pages)
cd frontend
npm test -- --testPathPattern="Admin|History|Home" --watchAll=false

# Backend SLA monitor
cd ../backend
npx jest --testPathPattern="asim_mohammed_sla" --no-coverage --forceExit
```

Expected results at time of writing:

- **Admin.test.tsx:** 24 tests pass (service health, circuit breakers, SLA, refresh)
- **History.test.tsx:** 18 tests pass (toolbar/filters, table rendering, navigation)
- **Home.test.tsx:** baseline tests pass (proof rendering, SSE wiring)
- **SLA monitor service:** 9 tests pass (flagging, dedup, status transitions)
- **Admin SLA controller:** 5 tests pass (endpoint shape, delegation)

---

## 5. Troubleshooting (during the demo)

### Dashboard doesn't update in real time

- Check Network tab — is the `/stream` request active?
- Frontend SSE only connects for **active** requests. If the request reaches `COMPLETED` before the page loaded, SSE won't connect — the polling fallback (every 5s) takes over.

### Admin page shows everything DOWN

- Most likely the backend container restarted. Check `docker compose ps` — backend should be `(healthy)`.
- The Admin page queries three independent APIs. If one fails, the other two still render with their actual data.

### SLA violation doesn't appear after waiting

- Confirm threshold was lowered: `docker exec erasegraph-backend env | grep SLA_THRESHOLD_MINUTES`
- The scanner runs every 60 seconds. If you set threshold=1m and submit immediately, expect up to 2 minutes wall time.
- Check the request status — if it already reached `COMPLETED`, the scanner won't flag it.

### Proof Verified badge stays grey

- Confirm the proof has at least one event: `curl http://localhost:3001/deletions/<id>/proof | jq '.proof_events | length'`
- Empty proof returns `verified: null`, not `true` or `false`. Submit a fresh request.

### Tamper SQL fails

- Postgres credentials: user `erasegraph`, database `erasegraph`, container `erasegraph-postgres`.
- If `proof_events` doesn't show a row, the request might not have any events yet — wait for it to complete first.

---

## 6. Reset to a clean state between demo runs

Useful if you're presenting twice or want a fresh slate between practice runs.

```bash
# 1. Wipe deletion data, keep schema
docker exec -it erasegraph-postgres psql -U erasegraph -d erasegraph -c "
  TRUNCATE deletion_requests, deletion_steps, proof_events, processed_events RESTART IDENTITY CASCADE;
"

# 2. Restore demo users (alice, bob, charlie, diana, eve)
curl -s -X POST http://localhost:3001/users/restore-demo | jq '.restored | length'

# 3. Clear Redis (cache + circuit breaker state)
docker exec -it erasegraph-redis redis-cli FLUSHALL

# 4. Verify clean state
curl -s "http://localhost:3001/deletions?limit=1" | jq '.count'   # should be 0
curl -s http://localhost:3001/admin/circuits | jq 'length'        # should be 0
curl -s http://localhost:3001/admin/sla-violations | jq 'length'  # should be 0
```

---

## 7. Demo timing (target: 8-10 minutes)

| Step | Target | Notes |
|---|---|---|
| Step 1 — Real-time dashboard | 90s | Watch the timing carefully — the analytics 7s delay can read as "stuck" |
| Step 2 — Proof timeline + export | 90s | Don't get drawn into reading every JSON payload aloud |
| Step 3 — Tamper detection | 60s | Have the SQL pasted and ready, don't type it during the demo |
| Step 4 — History page | 60s | Demonstrate three filters: status, search, clear |
| Step 5 — Admin panel | 90s | Stop one service to show DOWN badge live |
| Step 6 — SLA violations | 120s | Start the stall **before** Step 5 if you can interleave |
| **Total** | **~9 min** | Add 1-2 minutes for questions during the walk-through |

---

## 8. Backup material (only pull up if asked)

- **Jaeger trace view** — http://localhost:16686. Search by service `backend`, find a recent trace, expand to show RabbitMQ spans across all five workers.
- **Grafana dashboards** — http://localhost:3006. Login `admin/admin`. Pre-built panels show request rate, success/fail ratio, retry rate, circuit state changes.
- **RabbitMQ UI** — http://localhost:15672. Login `erasegraph/erasegraph_pass`. Show the `Queues` tab — main, retry (5s/10s/20s), and DLQ queues per cleanup service.
- **Bulk upload** — http://localhost:3000/bulk. CSV upload with per-row result reporting. Useful if asked about throughput / batch operations.

---

## 9. Files this demo exercises

| Feature | Frontend file | Backend file |
|---|---|---|
| Dashboard + SSE | `frontend/src/pages/Home.tsx` | `backend/src/deletion-request/deletion-request.controller.ts` (`@Sse :id/stream`) |
| Proof timeline + verify + export | `frontend/src/pages/Home.tsx` | `backend/src/proof/proof.controller.ts`, `backend/src/proof/proof.service.ts` |
| History page | `frontend/src/pages/History.tsx` | `backend/src/deletion-request/deletion-request.controller.ts` (`GET /deletions`) |
| Admin panel | `frontend/src/pages/Admin.tsx` | `backend/src/admin/admin.controller.ts` |
| SLA monitor | `frontend/src/pages/Admin.tsx` (violations section) | `backend/src/admin/sla-monitor.service.ts`, `backend/src/admin/admin.controller.ts` (`GET /admin/sla-violations`) |
| Primary data cleanup | — | `primary-data-service/src/deletion-consumer/*` |
| Cache cleanup | — | `cache-cleanup-service/src/cache-cleanup/*` |

---

## 10. One-paragraph summary for the demo intro

> "I built the real-time deletion dashboard, the proof timeline and export flow, the history page with search and filters, and the admin panel including SLA violation monitoring. The dashboard streams updates over SSE so operators see each step turn green in near real time. The proof view ties into our Ed25519-signed hash chain so deletions are cryptographically auditable. The admin panel monitors service health, circuit breaker state, and SLA violations — the SLA scanner runs every 60 seconds and flags any deletion that's been stuck beyond the threshold, recording the violation in the proof chain so it's visible to auditors. I also built two of the backend cleanup services — primary data and cache cleanup."
