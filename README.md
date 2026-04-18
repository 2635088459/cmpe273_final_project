# cmpe273_final_project
# EraseGraph: Verifiable Deletion Propagation Across Microservices

**Provided by Haoyuan Shan**

## Project Overview

EraseGraph is a distributed system for handling deletion requests across multiple microservices.

The goal of this project is not only to delete data from one database, but also to make sure the deletion actually propagates to other downstream systems that may still store copies of the user’s data.

These systems may include:

- Primary database
- Cache
- Search/index replica
- Analytics store
- Backup marker service

In modern systems, user data is often copied into multiple places. Because of that, deletion is no longer just a single database operation. It becomes a distributed systems problem.

## Why We Chose This Topic

We wanted to build a project that feels like a real distributed systems problem instead of a normal CRUD web application.

In real-world systems, deleting a user from one place does not guarantee that the user’s data is removed everywhere. Data may still exist in caches, search indexes, analytics pipelines, or backup-related services.

This project is practical, realistic, and closely related to real system design challenges.

## Novelty and Gap

Existing privacy and compliance tools already support request intake and workflow automation for deletion requests.

However, our project focuses on a different gap:

- how deletion propagates across multiple services
- what happens when one service fails
- how to verify which systems have already processed the deletion
- how to provide a simple proof or audit trail for the deletion workflow

The novelty of EraseGraph is not the deletion request itself, but the **verification, propagation, observability, and failure handling** of deletion across a distributed system.

## Main Features

- Submit a deletion request
- Track deletion progress across services
- Send deletion events asynchronously
- Retry failed cleanup steps
- Show deletion request status:
  - Pending
  - Running
  - Partially completed
  - Completed
  - Failed
- Generate a simple deletion proof / audit view
- Trace where the workflow succeeds or gets stuck

## System Components

### Frontend
- React dashboard for:
  - submitting deletion requests
  - checking request status
  - viewing deletion proof details

### Backend Services
- **API Gateway**  
  Handles frontend requests

- **Deletion Request Service**  
  Creates and manages deletion jobs

- **Subject Resolution Service**  
  Maps external user ID to internal records

- **Primary Data Service**  
  Deletes the main user data

- **Cache Cleanup Service**  
  Clears cached copies

- **Search Cleanup Service**  
  Removes indexed copies

- **Analytics Cleanup Service**  
  Handles delayed cleanup in analytics data

- **Proof / Audit Service**  
  Records which deletion steps succeeded or failed

## Communication Model

### Synchronous Communication
Used for:
- submitting deletion requests
- checking request status
- viewing proof details

### Asynchronous Communication
Used for:
- propagating deletion events
- retrying failed cleanup tasks
- updating proof records

## Why This Fits the Course

This project matches the distributed systems course requirements in several ways:

- **Multi-service architecture**  
  Multiple services handle different parts of the deletion workflow

- **Synchronous and asynchronous communication**  
  API requests are synchronous, while cleanup and propagation are event-driven

- **Coordination**  
  A single deletion request must coordinate multiple downstream services

- **Consistency tradeoffs**  
  Primary data may require stronger guarantees, while cache and analytics cleanup can be delayed

- **Fault tolerance**  
  The system should continue working even if one cleanup service fails temporarily

- **Observability**  
  We want to trace where a deletion request succeeds, fails, or gets stuck

- **Security**  
  Only authorized internal services should process deletion events

## Tech Stack

- **Frontend:** React
- **Backend:** Spring Boot or NestJS
- **Database:** PostgreSQL
- **Cache:** Redis
- **Message Queue:** RabbitMQ
- **Observability:** OpenTelemetry + Jaeger
- **Deployment:** Docker Compose
- **Optional Bonus:** Kubernetes

## Expected Demo

Our final demo is expected to show:

1. A normal successful deletion across all services
2. One cleanup service fails, causing the request to become partially completed
3. The failed service recovers and the system retries automatically
4. The dashboard shows the proof and status of each deletion step
5. Traces and logs show where the failure happened and how recovery worked

---

# Recommended MVP Scope

To avoid making the project too large at the beginning, the first version should focus on a **minimum viable distributed workflow**.

Instead of building every service at once, we recommend starting with:

- React dashboard
- Deletion Request Service
- Primary Data Service
- Cache Cleanup Service
- Proof Service
- PostgreSQL
- Redis
- RabbitMQ
- OpenTelemetry + Jaeger

For the first milestone, we can delay these services until later:

- API Gateway
- Subject Resolution Service
- Search Cleanup Service
- Analytics Cleanup Service
- Backup Marker Service

This makes the system easier to build, test, and demo.

## Recommended First Architecture

For the MVP, we recommend using an **orchestration-based design**.

That means the **Deletion Request Service** acts as the coordinator. It creates deletion jobs, sends events, receives responses, and aggregates the final status.

This is easier to explain, easier to debug, and better for a class demo than a fully decentralized choreography-based design.

## Suggested State Model

### Request Status
- `PENDING`
- `RUNNING`
- `PARTIAL_COMPLETED`
- `COMPLETED`
- `FAILED`

### Step Status
- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `RETRYING`

This state model is important because the main value of the project is not just deleting data, but managing and verifying the deletion workflow.

## Suggested Core Data Model

### `deletion_requests`
Stores the high-level deletion request.

Fields:
- `id`
- `subject_id`
- `status`
- `requested_at`
- `completed_at`
- `trace_id`

### `deletion_steps`
Stores the status of each cleanup step.

Fields:
- `id`
- `request_id`
- `step_name`
- `status`
- `attempt_count`
- `last_error`
- `updated_at`

### `proof_events`
Stores proof or audit records for each action.

Fields:
- `id`
- `request_id`
- `service_name`
- `event_type`
- `payload_jsonb`
- `created_at`

## Suggested MVP Workflow

### Step 1: Submit Deletion Request
The frontend sends a request to:

`POST /deletions`

The system creates:
- one deletion request
- multiple deletion steps

Then it publishes a `DeletionRequested` event to RabbitMQ.

### Step 2: Downstream Cleanup
The downstream services consume the event:

- **Primary Data Service** deletes the main user data
- **Cache Cleanup Service** removes related Redis entries

### Step 3: Report Results
Each service sends back one of the following:

- `DeletionStepSucceeded`
- `DeletionStepFailed`

### Step 4: Record Proof
The **Proof Service** records every result as an audit event.

### Step 5: Aggregate Final Status
The **Deletion Request Service** aggregates step results and updates the request status.

## Minimal API Design

For the first version, only these APIs are necessary:

- `POST /deletions`  
  Submit a deletion request

- `GET /deletions/{id}`  
  Get overall request status

- `GET /deletions/{id}/proof`  
  View proof / audit details

## Minimal Event Types

For the first version, only these events are necessary:

- `DeletionRequested`
- `DeletionStepSucceeded`
- `DeletionStepFailed`

## Failure and Retry Design

Failure handling is one of the most important parts of this project.

For the demo, one cleanup service can intentionally fail the first time it processes a request.

Example:
- cache cleanup fails on the first attempt
- system marks the request as `PARTIAL_COMPLETED`
- failed message goes to a retry queue
- service retries after a delay
- retry succeeds
- request becomes `COMPLETED`

This makes the distributed systems aspect of the project much more visible and meaningful.

## Observability Plan

Observability should not be added only at the end. It should be part of the MVP.

We plan to use:

- **OpenTelemetry** for tracing instrumentation
- **Jaeger** for visualizing distributed traces

This allows us to show:
- which services handled the deletion request
- where a request failed
- how retry and recovery happened
- end-to-end trace of the workflow

---

# How to Start

## Phase 1: Narrow the Scope
Do not build everything at once.

Start with:
- primary data deletion
- Redis cache cleanup
- proof recording
- failure + retry
- simple status/proof dashboard

## Phase 2: Design Before Coding
Before implementing services, prepare these three diagrams:

1. **Architecture Diagram**  
   Show all services, storage systems, and communication paths

2. **Success Sequence Diagram**  
   Show how a normal deletion request flows through the system

3. **Failure and Retry Sequence Diagram**  
   Show what happens when one cleanup service fails and later recovers

These diagrams will help keep the implementation organized.

## Phase 3: Create the Repository Structure

Suggested structure:

```text
erasegraph/
  frontend/
  services/
    deletion-request-service/
    primary-data-service/
    cache-cleanup-service/
    proof-service/
  infra/
    docker-compose.yml
  docs/
    architecture.png
    sequence-success.png
    sequence-failure-retry.png