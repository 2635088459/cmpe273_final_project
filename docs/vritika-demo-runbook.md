# Vritika Reliability Demo Runbook

## Start the stack

From the project root:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Useful URLs:

- Frontend: `http://localhost:3000`
- Tested alternate frontend port: `http://localhost:3020`
- Backend API: `http://localhost:3001`
- Optional API Gateway: `http://localhost:3007`
- RabbitMQ UI: `http://localhost:15672`
- RabbitMQ login: `erasegraph` / `erasegraph_secret`
- Circuit states: `http://localhost:3001/admin/circuits`

Note: During local testing, port `3000` was already used by another Docker container, so the frontend was started with:

```bash
FRONTEND_PORT=3020 docker compose -f infra/docker-compose.yml up -d frontend
```

The optional API gateway runs inside its container on port `3000`. During local testing it was exposed on host port `3007` to avoid conflicts:

```bash
GATEWAY_PORT=3007 docker compose -f infra/docker-compose.yml up -d api-gateway
```

## Retry then success

Submit a deletion with a subject ID that starts with `fail-`, for example:

```text
fail-demo-cache
```

Expected result:

- Cache cleanup fails once.
- Backend records `DeletionStepRetrying`.
- Dashboard shows the cache step as `RETRYING`.
- RabbitMQ briefly shows the message in `erasegraph.retry.cache-cleanup.5s`.
- The retry succeeds and the cache step becomes `SUCCEEDED`.

## Retry then DLQ

Submit a deletion with:

```text
fail-always-cache
```

Expected result:

- Cache cleanup fails on each attempt.
- Retries use 5s, 10s, and 20s queues.
- After 3 retries, backend records `DeletionStepFailed`.
- RabbitMQ shows the message in `erasegraph.dlq.cache-cleanup`.

## Duplicate event idempotency

Publish the same `DeletionRequested` payload twice with the same `event_id`.

Expected result:

- The first copy is claimed in the `processed_events` table.
- The duplicate copy is acknowledged without running cleanup again.
- Proof/audit includes `DUPLICATE_EVENT_IGNORED`.

## Circuit breaker

Submit enough forced cache failures to trip the threshold, for example repeated `fail-open-...` deletions.

Expected result:

- After 3 consecutive cache failures, Redis stores the cache circuit as `OPEN`.
- `GET /admin/circuits` shows `cache_cleanup` as `OPEN`.
- New first-attempt cache cleanup messages are skipped.
- Proof/audit includes `CIRCUIT_OPEN_SKIP`.
- The cache step becomes `SKIPPED_CIRCUIT_OPEN`.
- After 30 seconds, `GET /admin/circuits` reports `HALF_OPEN`; a successful cache cleanup resets it to `CLOSED`.

## RabbitMQ queues to show

In the RabbitMQ UI, open the Queues tab and show:

- `erasegraph.deletion-requests.cache-cleanup`
- `erasegraph.retry.cache-cleanup.5s`
- `erasegraph.retry.cache-cleanup.10s`
- `erasegraph.retry.cache-cleanup.20s`
- `erasegraph.dlq.cache-cleanup`

## Optional: DLQ replay

Replay supported DLQ messages through the backend or gateway.

Backend:

```bash
curl -X POST http://localhost:3001/admin/dlq/cache-cleanup/replay
```

Gateway:

```bash
curl -X POST http://localhost:3007/admin/dlq/cache-cleanup/replay \
  -H "X-Service-Token: erasegraph_internal_token"
```

Expected result:

```json
{"queue":"erasegraph.dlq.cache-cleanup","replayed":4}
```

The replay endpoint replays the queue's initial message count only. If replayed messages still fail, they may land back in the DLQ after the cleanup service processes them.

## Optional: API gateway token validation

Gateway health does not require a token:

```bash
curl http://localhost:3007/health
```

Requests without `X-Service-Token` are rejected:

```bash
curl -i "http://localhost:3007/deletions?limit=1"
```

Expected result:

```text
HTTP/1.1 401 Unauthorized
```

Requests with the token are proxied to the backend:

```bash
curl -H "X-Service-Token: erasegraph_internal_token" \
  "http://localhost:3007/deletions?limit=1"
```

## Verified local test results

These tests were run against the Docker Compose stack on `localhost`.

### Step 1: Stack startup

Result: Passed.

- Backend: `http://localhost:3001/health`
- Frontend: `http://localhost:3020`
- RabbitMQ UI: `http://localhost:15672`
- All EraseGraph services reported healthy in Docker Compose.

Frontend used port `3020` because port `3000` was already occupied by `fp-grafana`.

### Step 2: Retry then success

Result: Passed.

- Subject: `fail-demo-cache-final`
- Request ID: `d8400b5a-05a2-42ed-a9d2-a16c345a0335`
- Final request status: `COMPLETED`
- Cache step final status: `SUCCEEDED`
- Cache step final error: `null`
- Proof included `DeletionStepRetrying`
- Retry count: `1`
- Retry delay: `5000ms`
- Proof then included `DeletionStepSucceeded`
- Retry queues and `step-results` queue drained to `0`

### Step 3: Retry then DLQ

Result: Passed.

- Subject: `fail-always-cache-step3`
- Request ID: `fea6f3a6-5b82-4e46-bf0d-2bc45b6ce568`
- Final request status: `FAILED`
- Primary data step: `SUCCEEDED`
- Cache step: `FAILED`
- Proof included retry attempts:
  - `retry_count: 1`, `next_retry_delay_ms: 5000`
  - `retry_count: 2`, `next_retry_delay_ms: 10000`
  - `retry_count: 3`, `next_retry_delay_ms: 20000`
- Proof included final `DeletionStepFailed`
- Final error code: `CACHE_CLEANUP_MAX_RETRIES_EXCEEDED`
- `erasegraph.dlq.cache-cleanup` received the failed message

### Step 4: Circuit breaker

Result: Passed.

- Trigger subject: `fail-open-cache-step4-loop`
- Trigger request ID: `b8481de6-7e6e-4068-8fbf-60f495454e5f`
- Circuit opened after 3 cache failures:

```json
[{"service_name":"cache_cleanup","state":"OPEN","failure_count":3}]
```

- Skip subject: `circuit-skip-step4-loop`
- Skip request ID: `a80fec23-9f3f-4e92-8db6-48387806fd75`
- Final request status: `PARTIAL_COMPLETED`
- Cache step status: `SKIPPED_CIRCUIT_OPEN`
- Proof included `CIRCUIT_OPEN_SKIP`
- `HALF_OPEN` display was verified:

```json
[{"service_name":"cache_cleanup","state":"HALF_OPEN","failure_count":3}]
```

- Recovery request succeeded and reset the circuit:

```json
[{"service_name":"cache_cleanup","state":"CLOSED","failure_count":0}]
```

### Step 5: Duplicate event idempotency

Result: Passed.

- Baseline request ID: `0e058765-3bcb-4ded-8937-80cacf45a42a`
- Duplicate event ID: `11111111-1111-4111-8111-111111111115`
- The same RabbitMQ event was published twice.
- Both publishes routed successfully.
- `processed_events` contained one row for the duplicate event ID and service `cache_cleanup`.
- Proof included `DUPLICATE_EVENT_IGNORED`
- Cache retry and processing queues drained to `0`

### Optional Step 6: DLQ replay

Result: Passed.

- Endpoint: `POST /admin/dlq/cache-cleanup/replay`
- Tested through API gateway with `X-Service-Token`
- Initial DLQ count: `4`
- Replay response:

```json
{"queue":"erasegraph.dlq.cache-cleanup","replayed":4}
```

- The DLQ still showed `4` messages afterward because the replayed messages were forced-failure demo messages and returned to the DLQ.

### Optional Step 7: API gateway service token

Result: Passed.

- Gateway health endpoint worked without token.
- Request without token returned `401 Unauthorized`.
- Request with `X-Service-Token: erasegraph_internal_token` proxied successfully to backend and returned deletion data.
