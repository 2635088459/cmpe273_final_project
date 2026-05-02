# Vritika Work Summary

This document gives a simple summary of Vritika's contribution to the EraseGraph project.

## Main Areas Worked On

Vritika mainly worked on the proof-related backend work, useful frontend features, and the endpoints needed to support the dashboard and demo flow.

For the team extension, Vritika also owns the reliability work for failed deletion cleanup:

- Retry queues and dead letter queue for cache cleanup failures
- Duplicate event protection using event IDs
- Demo failure injection with `fail-` subject IDs
- Circuit breaker state tracking for downstream cleanup services
- Failure/retry design documentation
- Optional DLQ replay endpoint
- Optional API gateway with service token validation

## Backend Work

- Worked on **BACKEND-005 (Proof Service / audit-related functionality)**
- Added and supported endpoints needed by the frontend and demo flow
- Added the **list deletion requests** backend support for the dashboard
- Added user-related demo endpoints such as:
  - `GET /users`
  - `POST /users/restore-demo`
- Supported proof and audit trail retrieval for deletion requests

## Frontend Work

- Worked on **Frontend 3**: status tracking dashboard
- Worked on **Frontend 4**: proof and audit trail view
- Improved **Frontend 2** because the earlier form UI looked too basic
- Improved the frontend layout and styling so the app looked cleaner and more polished
- Added the **Demo Users** page to help with project demos

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
- Failure handling design doc: `docs/failure_retry_design.md`
- Reliability demo runbook: `docs/vritika-demo-runbook.md`

## What This Means Simply

In simple terms, Vritika's work helped make the project easier to use and demo by:

- showing request status clearly in the frontend
- showing proof / audit data in the UI
- improving the form and overall frontend experience
- adding backend endpoints needed for the dashboard and demo pages
- demonstrating realistic distributed-system failure handling
