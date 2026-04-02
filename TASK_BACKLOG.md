# EraseGraph — Task Backlog (JIRA-Style)

**Project:** EraseGraph MVP - Verifiable Deletion Propagation  
**Sprint Duration:** 4 weeks  
**Team Size:** 4 members  

---

## 📋 How to Use This Task Board

1. **Pick a task** from the backlog below
2. **Assign yourself** by adding your name to the `Assignee` field
3. **Move status** from `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`
4. **Update this file** with your progress
5. **Create PR** when task is ready for review

---

## 🚀 Epic: Infrastructure & Environment Setup

### INFRA-001: Docker Compose Infrastructure
- **Priority:** 🔴 Critical (Blocker for all development)
- **Story Points:** 5
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** None

**Description:**  
Set up the complete development environment using Docker Compose.

**Acceptance Criteria:**
- [ ] `infra/docker-compose.yml` includes PostgreSQL, Redis, RabbitMQ, Jaeger
- [ ] All services start successfully with `docker-compose up`
- [ ] RabbitMQ Management UI accessible at http://localhost:15672
- [ ] Jaeger UI accessible at http://localhost:16686
- [ ] PostgreSQL accessible on port 5432
- [ ] Redis accessible on port 6379
- [ ] Environment variables documented in `.env.example`

**Definition of Done:**
- Services start in under 30 seconds
- README includes startup instructions
- Health check endpoints respond correctly

---

### INFRA-002: Database Schema & Migrations
- **Priority:** 🔴 Critical
- **Story Points:** 3
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001

**Description:**  
Create database schema for deletion tracking and proof generation.

**Acceptance Criteria:**
- [ ] `deletion_requests` table with fields: id, subject_id, status, requested_at, completed_at, trace_id
- [ ] `deletion_steps` table with fields: id, request_id, step_name, status, attempt_count, last_error, updated_at
- [ ] `proof_events` table with fields: id, request_id, service_name, event_type, payload_jsonb, created_at
- [ ] Migration scripts in `infra/migrations/`
- [ ] Seed data for testing

**Definition of Done:**
- Schema deployed via migration script
- Sample data loads successfully
- All foreign key constraints work

---

### INFRA-003: RabbitMQ Exchange & Queue Setup
- **Priority:** 🟡 High
- **Story Points:** 2
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001

**Description:**  
Configure RabbitMQ exchanges, queues, and routing for event-driven communication.

**Acceptance Criteria:**
- [ ] Topic exchange: `erasegraph.events`
- [ ] Queues: `deletion-requests`, `step-results`, `proof-events`
- [ ] Dead letter queue for failed message handling
- [ ] Routing keys: `deletion.requested`, `step.succeeded`, `step.failed`
- [ ] Message TTL and retry configuration

**Definition of Done:**
- Messages can be published and consumed
- Dead letter queue catches failed messages
- Management UI shows all queues

---

## 🏗️ Epic: Backend Services

### BACKEND-001: Deletion Request Service - Core API
- **Priority:** 🔴 Critical
- **Story Points:** 8
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001, INFRA-002

**Description:**  
Implement the orchestrator service that handles deletion requests and coordinates downstream services.

**Acceptance Criteria:**
- [ ] `POST /deletions` endpoint accepts `{subject_id: string}`
- [ ] Returns 202 Accepted with `{request_id, status: "PENDING"}`
- [ ] `GET /deletions/{id}` returns request status and step details
- [ ] `GET /deletions/{id}/proof` returns audit trail
- [ ] OpenAPI/Swagger documentation
- [ ] Request validation and error handling
- [ ] PostgreSQL connection and ORM setup

**Tech Stack:** NestJS + TypeORM + PostgreSQL  
**Definition of Done:**
- All endpoints tested with Postman/curl
- Unit tests for business logic
- API documentation generated

---

### BACKEND-002: Event Publishing & Message Queue Integration
- **Priority:** 🔴 Critical
- **Story Points:** 5
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** BACKEND-001, INFRA-003

**Description:**  
Integrate Deletion Request Service with RabbitMQ for event publishing.

**Acceptance Criteria:**
- [ ] Publishes `DeletionRequested` event when POST /deletions called
- [ ] Event payload includes: `{request_id, subject_id, trace_id, timestamp}`
- [ ] Consumes `DeletionStepSucceeded` and `DeletionStepFailed` events
- [ ] Updates deletion_steps table based on consumed events
- [ ] Aggregates step status to update deletion_request status
- [ ] Handles partial completion scenarios

**Definition of Done:**
- Messages visible in RabbitMQ Management UI
- Event consumption updates database correctly
- Error handling for message processing failures

---

### BACKEND-003: Primary Data Service
- **Priority:** 🟡 High
- **Story Points:** 4
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001, INFRA-003

**Description:**  
Service that handles actual user data deletion from the primary database.

**Acceptance Criteria:**
- [ ] Consumes `DeletionRequested` events from RabbitMQ
- [ ] Executes `DELETE FROM users WHERE id = ?` (or simulates deletion)
- [ ] Publishes `DeletionStepSucceeded` with service_name: "primary_data"
- [ ] Handles database connection failures gracefully
- [ ] Logs all deletion operations
- [ ] OpenTelemetry tracing integration

**Tech Stack:** NestJS + Database connection  
**Definition of Done:**
- Successfully processes deletion events
- Publishes result events to queue
- Traces appear in Jaeger

---

### BACKEND-004: Cache Cleanup Service (with Failure Simulation)
- **Priority:** 🟡 High
- **Story Points:** 6
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001, INFRA-003

**Description:**  
Service that cleans up cached data, with intentional failure simulation for demo purposes.

**Acceptance Criteria:**
- [ ] Consumes `DeletionRequested` events
- [ ] Executes Redis `DEL` commands for user-related cache keys
- [ ] **Feature:** First attempt fails intentionally (configurable)
- [ ] **Feature:** Retry mechanism with exponential backoff
- [ ] Publishes `DeletionStepFailed` on first attempt
- [ ] Publishes `DeletionStepSucceeded` on retry success
- [ ] Configuration for failure rate and retry delay

**Demo Value:** This service showcases distributed system failure handling  
**Definition of Done:**
- Demonstrates failure → retry → success workflow
- Configurable failure simulation
- Retry logic works correctly

---

### BACKEND-005: Proof Service
- **Priority:** 🟢 Medium
- **Story Points:** 3
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-002, INFRA-003

**Description:**  
Service that collects and stores audit evidence for deletion operations.

**Acceptance Criteria:**
- [ ] Consumes all `DeletionStepSucceeded` and `DeletionStepFailed` events
- [ ] Writes audit records to `proof_events` table
- [ ] Stores event payload as JSONB for flexible queries
- [ ] Provides query endpoint for proof generation
- [ ] Timestamps all audit events
- [ ] Handles duplicate event filtering

**Definition of Done:**
- All step events are captured
- Proof data can be queried
- No duplicate audit records

---

## 🎨 Epic: Frontend

### FRONTEND-001: React Project Setup & Basic UI
- **Priority:** 🟡 High
- **Story Points:** 4
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** None

**Description:**  
Set up React project with routing and basic component structure.

**Acceptance Criteria:**
- [ ] Create React app with TypeScript
- [ ] React Router for navigation
- [ ] Basic layout with header/sidebar
- [ ] Pages: Home, Submit Deletion, View Status, Proof Details
- [ ] UI library setup (Material-UI or Ant Design)
- [ ] Responsive design
- [ ] API client setup (Axios)

**Tech Stack:** React + TypeScript + React Router + UI Library  
**Definition of Done:**
- App runs in development mode
- Navigation between pages works
- Responsive on mobile/desktop

---

### FRONTEND-002: Deletion Request Form
- **Priority:** 🟡 High
- **Story Points:** 3
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** FRONTEND-001, BACKEND-001

**Description:**  
Form for submitting deletion requests with validation and feedback.

**Acceptance Criteria:**
- [ ] Form fields: Subject ID (required), Reason (optional)
- [ ] Client-side validation
- [ ] Calls `POST /deletions` API
- [ ] Shows success message with request ID
- [ ] Error handling for API failures
- [ ] Loading states during submission
- [ ] Redirect to status page after submission

**Definition of Done:**
- Form validates input correctly
- Successfully submits to backend API
- Good error messages for users

---

### FRONTEND-003: Status Tracking Dashboard
- **Priority:** 🟡 High
- **Story Points:** 5
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** FRONTEND-001, BACKEND-001

**Description:**  
Real-time dashboard showing deletion request status and progress.

**Acceptance Criteria:**
- [ ] Status overview: PENDING → RUNNING → PARTIAL_COMPLETED → COMPLETED
- [ ] Step-by-step progress indicator
- [ ] Auto-refresh every 5 seconds (or polling)
- [ ] Visual indicators for success/failure/in-progress
- [ ] Timeline view of step completion
- [ ] Filter by status (completed, failed, in-progress)
- [ ] Search by request ID or subject ID

**Definition of Done:**
- Real-time updates work correctly
- All status states are visually distinct
- Performance is good with many requests

---

### FRONTEND-004: Proof & Audit Trail Viewer
- **Priority:** 🟢 Medium
- **Story Points:** 4
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** FRONTEND-001, BACKEND-001, BACKEND-005

**Description:**  
Interface for viewing detailed proof and audit trail of deletion operations.

**Acceptance Criteria:**
- [ ] Calls `GET /deletions/{id}/proof` API
- [ ] Displays chronological audit trail
- [ ] Shows event details: timestamp, service, action, result
- [ ] JSON viewer for event payloads
- [ ] Export proof as PDF or JSON
- [ ] Expandable/collapsible event details
- [ ] Visual timeline representation

**Definition of Done:**
- Proof data displays correctly
- Export functionality works
- Timeline is easy to understand

---

## 🔍 Epic: Testing & Integration

### TEST-001: End-to-End Demo Script
- **Priority:** 🟡 High
- **Story Points:** 3
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** All backend and frontend tasks

**Description:**  
Automated script that demonstrates the complete deletion workflow including failure scenarios.

**Acceptance Criteria:**
- [ ] Script 1: Normal deletion flow (success)
- [ ] Script 2: Failure scenario with recovery
- [ ] Automated assertions for each step
- [ ] Generates demo data for presentation
- [ ] Cleans up test data after demo
- [ ] Documentation for running demo
- [ ] Screenshots/recordings of demo flow

**Definition of Done:**
- Demo runs reliably
- All scenarios covered
- Good for presentation

---

### TEST-002: OpenTelemetry Tracing Integration
- **Priority:** 🟢 Medium
- **Story Points:** 4
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** All backend services

**Description:**  
Add distributed tracing to all services for observability and debugging.

**Acceptance Criteria:**
- [ ] All services export traces to Jaeger
- [ ] Trace correlation across service boundaries
- [ ] Custom spans for business operations
- [ ] Error tracking in traces
- [ ] Performance metrics collection
- [ ] Trace sampling configuration
- [ ] Demo scenarios generate meaningful traces

**Definition of Done:**
- Complete request traces visible in Jaeger
- Error traces help with debugging
- Performance insights available

---

## 📚 Epic: Documentation

### DOC-001: Developer Setup Guide
- **Priority:** 🟡 High
- **Story Points:** 2
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** INFRA-001

**Description:**  
Complete setup guide for new developers joining the project.

**Acceptance Criteria:**
- [ ] Prerequisites (Docker, Node.js, etc.)
- [ ] Step-by-step setup instructions
- [ ] Environment configuration guide
- [ ] Common troubleshooting issues
- [ ] Development workflow documentation
- [ ] Testing instructions
- [ ] Port mapping reference

**Definition of Done:**
- New developer can set up environment in <10 minutes
- All common issues documented
- Instructions are clear and tested

---

### DOC-002: API Documentation
- **Priority:** 🟢 Medium
- **Story Points:** 2
- **Assignee:** _[Available]_
- **Status:** TODO
- **Dependencies:** BACKEND-001

**Description:**  
Complete API documentation with examples and schemas.

**Acceptance Criteria:**
- [ ] OpenAPI/Swagger specification
- [ ] Request/response examples
- [ ] Error code documentation
- [ ] Authentication details (if any)
- [ ] Rate limiting information
- [ ] Postman collection
- [ ] Integration examples

**Definition of Done:**
- API docs are accessible via web UI
- All endpoints documented
- Examples work correctly

---

## 🏁 Sprint Planning Suggestions

### Sprint 1 (Week 1): Foundation
**Focus:** Infrastructure and basic setup
- INFRA-001, INFRA-002, INFRA-003
- FRONTEND-001
- DOC-001

### Sprint 2 (Week 2): Core Services
**Focus:** Backend services development
- BACKEND-001, BACKEND-002
- BACKEND-003
- FRONTEND-002

### Sprint 3 (Week 3): Integration & Features
**Focus:** Complete the system
- BACKEND-004, BACKEND-005
- FRONTEND-003
- TEST-002

### Sprint 4 (Week 4): Polish & Demo
**Focus:** Testing and presentation prep
- FRONTEND-004
- TEST-001
- DOC-002
- Final integration testing

---

## 📊 Task Status Tracking

| Epic | Total Tasks | TODO | IN_PROGRESS | IN_REVIEW | DONE |
|------|-------------|------|-------------|-----------|------|
| Infrastructure | 3 | 3 | 0 | 0 | 0 |
| Backend | 5 | 5 | 0 | 0 | 0 |
| Frontend | 4 | 4 | 0 | 0 | 0 |
| Testing | 2 | 2 | 0 | 0 | 0 |
| Documentation | 2 | 2 | 0 | 0 | 0 |
| **Total** | **16** | **16** | **0** | **0** | **0** |

---

## 💡 Quick Start Guide

1. **Choose your epic** based on your skills:
   - Infrastructure → DevOps/Docker skills
   - Backend → Node.js/API development
   - Frontend → React/UI development
   - Testing → QA/automation skills
   - Documentation → Technical writing

2. **Pick a task** and assign yourself
3. **Move to IN_PROGRESS** and start coding
4. **Update this file** with your progress
5. **Create PR** when ready for review

Ready to start? Pick your first task! 🚀