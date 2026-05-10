# Vritika Work Summary

This document gives a simple summary of Vritika's contribution to the EraseGraph project.

## Main Areas Worked On

Vritika mainly worked on the proof-related backend work, useful frontend features, and the endpoints needed to support the dashboard and demo flow.

For the team extension, Vritika also owns the reliability work for failed deletion cleanup and the batch CSV deletion feature:

- Retry queues and dead letter queue for cache cleanup failures
- Duplicate event protection using event IDs
- Demo failure injection with `fail-` subject IDs
- Circuit breaker state tracking for downstream cleanup services
- Failure/retry design documentation
- Optional DLQ replay endpoint
- Optional API gateway with service token validation
- **Batch CSV deletion** — `POST /deletions/bulk` endpoint, per-row result reporting, frontend bulk upload UI

## Backend Work

- Worked on **BACKEND-005 (Proof Service / audit-related functionality)**
- Added and supported endpoints needed by the frontend and demo flow
- Added the **list deletion requests** backend support for the dashboard
- Added user-related demo endpoints such as:
  - `GET /users`
  - `POST /users/restore-demo`
- Supported proof and audit trail retrieval for deletion requests
- Implemented **`POST /deletions/bulk`** — CSV upload endpoint:
  - `BulkDeletionService` — parses CSV buffer, deduplicates subject IDs, skips blank rows
  - `BulkDeletionController` — validates file type (CSV only), returns 400 for missing/non-CSV files
  - Returns `{ created, skipped, request_ids, rows }` with per-row status

## Frontend Work

- Worked on **Frontend 3**: status tracking dashboard
- Worked on **Frontend 4**: proof and audit trail view
- Improved **Frontend 2** because the earlier form UI looked too basic
- Improved the frontend layout and styling so the app looked cleaner and more polished
- Added the **Demo Users** page to help with project demos
- Added the **Bulk Upload** page (`/bulk`):
  - File picker restricted to `.csv` files
  - Upload button posts to `POST /deletions/bulk`
  - Results table shows per-row status (created / skipped) with reason and request ID
  - Summary card shows total created and skipped counts

## Features Added / Improved

- Dashboard to track deletion requests
- Search and filtering in the dashboard
- Proof / audit trail display for a selected request
- Better submit deletion page design
- Demo users view and restore flow
- Backend endpoints required to connect the frontend to live data
- Retry status and proof events for failed cleanup attempts
- Circuit breaker admin endpoint: `GET /admin/circuits`
- DLQ replay endpoint: `POST /admin/dlq/cache-cleanup/replay`
- API gateway service with `X-Service-Token` validation
- Failure handling design doc: `project-docs/failure_retry_design.md`
- Reliability demo runbook: `project-docs/vritika-demo-runbook.md`
- **Batch CSV deletion** — `POST /deletions/bulk` with per-row result reporting
- **Bulk Upload UI** — `/bulk` page with file picker, upload button, and results table

## Unit Tests Written

### Batch CSV Deletion (`backend/src/bulk-deletion/`)

| File | Tests |
|------|-------|
| `bulk-deletion.service.spec.ts` | 3 valid rows → 3 requests created |
| | Blank rows skipped and reported |
| | Duplicate rows deduplicated |
| | 5-row integration scenario (3 created, 2 skipped) |
| `bulk-deletion.controller.spec.ts` | No file → 400 Bad Request |
| | Non-CSV file → 400 Bad Request |
| | Valid CSV → 200 with created/skipped/request_ids |

### Reliability & Circuit Breaker

| File | Tests |
|------|-------|
| `admin/vritika_malhotra_circuit-breaker.service.spec.ts` | CLOSED → OPEN after 3 consecutive failures |
| | OPEN state → canProcess() returns false |
| | OPEN → HALF_OPEN after 30-second window expires |
| `admin/vritika_malhotra_dlq-replay.service.spec.ts` | Re-publishes all DLQ messages to main exchange, returns count |
| | NotFoundException for unsupported DLQ queue name |
| `events/vritika_malhotra_idempotency.spec.ts` | Returns true when event_id is new (insert succeeds) |
| | Returns false when same event_id arrives a second time (pg 23505) |
| | Saves DUPLICATE_EVENT_IGNORED proof event when duplicate detected |

## What This Means Simply

In simple terms, Vritika's work helped make the project easier to use and demo by:

- showing request status clearly in the frontend
- showing proof / audit data in the UI
- improving the form and overall frontend experience
- adding backend endpoints needed for the dashboard and demo pages
- demonstrating realistic distributed-system failure handling
- adding batch deletion support so operators can submit many subject IDs at once via a CSV upload
