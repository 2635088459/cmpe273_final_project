# EraseGraph

Group 6 Final Project for CMPE 273

## Team Information

Group: Group 6

Members:
Haoyuan Shan Email：haoyuan.shan@sjsu.edu ID: 015631382
Vritika Malhotra Email：vritika.malhotra@sjsu.edu 
Sakshat Patil Email：sakshatnandkumar.patil@sjsu.edu
Asim Mohammed Email：asim.mohammed@sjsu.edu 
# Final Report & Presentation

If you need to view the final report or the presentation slides for this project, please check the `project-docs/final-submission` folder:

- [Final Report (PDF)](project-docs/final-submission/CMPE273_final_report.pdf)
- [Presentation Slides (PDF)](project-docs/final-submission/erasegraph-slides-v3.pptx.pdf)
## What Is This App

EraseGraph is a distributed app for verifiable deletion propagation.

Simple meaning:
- a user sends one deletion request
- our system propagates this request to multiple services
- each service reports success/failure
- dashboard shows final status and proof timeline

This project focuses on distributed systems behavior, not only CRUD deletion.

## Why This App Is Needed

In real systems, data is copied to many places:
- primary database
- cache
- search index
- analytics store
- backup records

If we delete data in only one place, privacy risk still exists.

So we need a workflow that can:
- coordinate deletion across services
- handle failures and retries
- provide evidence (proof/audit trail)
- give clear visibility to operators

## Where It Can Be Used

- SaaS platforms with account deletion requirements
- fintech/health systems with compliance needs
- enterprise microservice platforms
- internal privacy operations teams

## Target Customers / Users

- platform engineering teams
- privacy/compliance teams
- SRE/DevOps teams
- internal admin operators

## Live Cloud Website

- **http://34.56.39.214/**

If you want to watch the full app demo, you can watch it here:
- [Demo Folder (GitHub)](project-docs/demos/)
- [Full App Demo Video (YouTube)](https://youtu.be/qp9-CSwcOkM)

### Cloud Demo Quick Start

1. **Overview page** (landing) — see dashboard with deletion request counts (active/completed/failed)

2. **Submit Request page** — enter subject ID and watch real-time progress
   - Try `alice` → all steps succeed (3 seconds)
   - Try `fail-alice` → fails, then auto-retries and succeeds
   - Try `fail-always-bob` → permanent failure

3. **History page** — search and filter all deletion requests, click to view proof

4. **Proof page** — see audit trail of every step
   - Shows which service ran, what event happened, JSON payload
   - Click "Verify proof chain" to check for tampering

5. **Demo Users page** — see primary database before/after deletion
   - Before: 5 users (alice, bob, charlie, diana, eve)
   - After deletion: 4 users (one removed)
   - Click "Restore demo users" to reset

6. **Bulk Upload page** — submit multiple deletions via CSV file

7. **Admin page** — service health, circuit breaker status, SLA violations

**For detailed step-by-step guide:**
- [project-docs/demos/cloud-demo-guide.md](project-docs/demos/cloud-demo-guide.md)

Cloud deployment technical details:
- [project-docs/design-docs/haoyuanshan-cloud deployment.md](project-docs/design-docs/haoyuanshan-cloud%20deployment.md)
- [project-docs/design-docs/kubernetes_deployment_guide.md](project-docs/design-docs/kubernetes_deployment_guide.md)

## README to Get Started With Our App (Descriptive)

### Prerequisites

- Node.js 18+
- npm
- Docker + Docker Compose
- Git

Optional (for Kubernetes):
- kubectl
- Minikube or Docker Desktop Kubernetes

### 1. Clone repository

```bash
git clone <your-repo-url>
cd cmpe273_final_project
```

### 2. Start infrastructure and services (local)

```bash
cd infra
docker compose up -d --build
cd ..
```

### 3. Run frontend (if needed)

```bash
cd frontend
npm install
npm start
```

### 4. Open common URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Swagger: http://localhost:3001/api/docs
- RabbitMQ UI: http://localhost:15672
- Jaeger UI: http://localhost:16686

### 5. First demo flow

1. Submit one deletion request.
2. Check request status page.
3. Open history page.
4. Open proof view.
5. Verify step-level status transitions.

For deeper setup steps and troubleshooting:
- [project-docs/design-docs/kubernetes_deployment_guide.md](project-docs/design-docs/kubernetes_deployment_guide.md)

## Design Philosophy

Main design ideas:
- event-driven deletion propagation
- step-level status tracking
- retry + DLQ for reliability
- proof events for auditability
- observability for debugging and demo

Detailed design docs:
- [project-docs/design-docs/diagrams.md](project-docs/design-docs/diagrams.md)
- [project-docs/design-docs/failure_retry_design.md](project-docs/design-docs/failure_retry_design.md)
- [project-docs/design-docs/consistency_tradeoffs.md](project-docs/design-docs/consistency_tradeoffs.md)
- [project-docs/design-docs/subject_resolution_design.md](project-docs/design-docs/subject_resolution_design.md)
- [project-docs/design-docs/haoyuanshan-encryption-design.md](project-docs/design-docs/haoyuanshan-encryption-design.md)

## Diagram Explanation (Important)

All diagrams are in:
- [project-docs/design-docs/diagrams.md](project-docs/design-docs/diagrams.md)

### Architecture Diagram

Shows all components and communication:
- frontend
- backend orchestrator
- cleanup services
- PostgreSQL + Redis
- RabbitMQ
- tracing stack

### Success Sequence Diagram

Shows normal flow:
1. request created
2. event published
3. workers process cleanup
4. result events consumed
5. request becomes COMPLETED

### Failure + Recovery Sequence Diagram

Shows resilience flow:
- one service fails first
- request becomes PARTIAL_COMPLETED
- retry queue schedules retry
- retry succeeds later
- request finally becomes COMPLETED

For retry internals and circuit breaker behavior:
- [project-docs/design-docs/failure_retry_design.md](project-docs/design-docs/failure_retry_design.md)

## Tech Stack

- Frontend: React + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Cache: Redis
- Messaging: RabbitMQ
- Observability: OpenTelemetry, Jaeger, Prometheus, Grafana
- Deployment: Docker Compose + Kubernetes

## Team Member Responsibilities

### Haoyuan Shan

- Kubernetes manifests and deployment flow
- pod recovery demo
- health/metrics integration and cloud deployment docs

Details:
- [project-docs/design-docs/kubernetes_deployment_guide.md](project-docs/design-docs/kubernetes_deployment_guide.md)
- [project-docs/design-docs/haoyuanshan-cloud deployment.md](project-docs/design-docs/haoyuanshan-cloud%20deployment.md)
- [project-docs/personal-reports/haoyuan_shan_backend_completion_report.md](project-docs/personal-reports/haoyuan_shan_backend_completion_report.md)

### Vritika Malhotra

- retry and DLQ flow
- idempotency handling
- failure reliability behavior and circuit breaker related work

Details:
- [project-docs/design-docs/failure_retry_design.md](project-docs/design-docs/failure_retry_design.md)
- [project-docs/personal-reports/vritika-work-summary.md](project-docs/personal-reports/vritika-work-summary.md)

### Sakshat Patil

- frontend dashboard improvements
- status/proof UX improvements
- real-time oriented workflow pages

Details:
- [project-docs/personal-reports/sakshat_patil_work_report.md](project-docs/personal-reports/sakshat_patil_work_report.md)
- [project-docs/design-docs/subject_resolution_design.md](project-docs/design-docs/subject_resolution_design.md)

### Asim Mohammed

- consistency behavior and status semantics
- backend/admin operational workflow support
- event-driven completion behavior refinement

Details:
- [project-docs/design-docs/consistency_tradeoffs.md](project-docs/design-docs/consistency_tradeoffs.md)
- [project-docs/project-tasks/TEAM_EXTENSION_TASK_SPLIT.md](project-docs/project-tasks/TEAM_EXTENSION_TASK_SPLIT.md)

## High-Level Project Structure

- frontend: React app
- backend: orchestrator API and core logic
- proof-service: proof read/verify service
- primary-data-service: primary data cleanup
- cache-cleanup-service: cache cleanup worker
- search-cleanup-service: search cleanup worker
- analytics-cleanup-service: delayed analytics cleanup
- backup-service: backup-related cleanup
- notification-service: completion/failure notification flow
- infra: local Docker stack and observability setup
- k8s: Kubernetes manifests
- project-docs: design docs and personal reports

## Final Submission Reading Order

**Quick Start (for evaluators):**
1. [README.md](README.md) — this file
2. [project-docs/design-docs/haoyuanshan-cloud-demo-guide.md](project-docs/design-docs/haoyuanshan-cloud-demo-guide.md) — step-by-step user guide for the cloud app

**Deep Dive (technical details):**
3. [project-docs/design-docs/diagrams.md](project-docs/design-docs/diagrams.md)
4. [project-docs/design-docs/failure_retry_design.md](project-docs/design-docs/failure_retry_design.md)
5. [project-docs/design-docs/consistency_tradeoffs.md](project-docs/design-docs/consistency_tradeoffs.md)
6. [project-docs/design-docs/kubernetes_deployment_guide.md](project-docs/design-docs/kubernetes_deployment_guide.md)

Backup of old README:
- [project-docs/design-docs/README-PreDesign.md](project-docs/design-docs/README-PreDesign.md)

