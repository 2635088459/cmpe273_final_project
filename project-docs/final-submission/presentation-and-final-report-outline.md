# EraseGraph Final Week Team Execution Memo

## 0. Team Goal and Scope

Team, this is my working plan for our final submission week.

I organized two ready-to-use structures:

1. Presentation slide outline (based on the current README, with detailed click-by-click operations intentionally omitted)
2. Final report outline (based on common sample project report structure)

This memo also includes:
- A dedicated team-contribution slide template
- What to write in each report section and what images/figures are needed
- Clear assignments for each of you

My primary lane (Haoyuan):
- Final GitHub structure and content planning
- Fill missing content and unify quality/style across docs
- Keep report and slide assets traceable and easy to review

---

## 1. Presentation Slide Outline (No Detailed Operation Steps)

Recommended total duration: 12-15 minutes, 13-15 slides.

### Slide 1. Title
- Project name: EraseGraph
- Course: CMPE 273 Final Project
- Team member names
- One-line positioning: Verifiable deletion propagation in distributed systems

Figure suggestion:
- A small architecture overview image

### Slide 2. Problem and Motivation
- Real-world issue: user data is spread across DB, cache, search, analytics, and backup systems
- Deleting from only one system is not enough
- We need deletion workflows that are observable, traceable, and verifiable

Figure suggestion:
- A simple "data scattered across systems" visual

### Slide 3. Solution Overview
- Core idea: event-driven orchestration + multi-service cleanup + proof/audit chain
- Key capabilities: status tracking, failure retry, eventual consistency, verifiable evidence

Figure suggestion:
- High-level flow: Request -> MQ -> Services -> Proof -> Dashboard

### Slide 4. System Architecture
- Frontend, backend orchestrator, cleanup workers, proof service, RabbitMQ, PostgreSQL, Redis, tracing stack
- Main communication paths (API + event-driven)

Figure suggestion:
- Existing architecture diagram from design docs

### Slide 5. End-to-End Workflow
- Request lifecycle: PENDING -> RUNNING -> COMPLETED / PARTIAL_COMPLETED / FAILED
- Step-level updates and final aggregation

Figure suggestion:
- Success-path sequence diagram

### Slide 6. Reliability Design
- Retry + dead-letter queue
- Idempotency for duplicate-event safety
- Circuit breaker and failure isolation

Figure suggestion:
- RabbitMQ retry/DLQ image
- Failure-recovery sequence image

### Slide 7. Proof and Auditability
- Why proof matters (compliance, accountability, audit)
- Proof event timeline and tamper-evident chain verification
- Export and verification support

Figure suggestion:
- Proof page screenshot
- Verify-chain result screenshot

### Slide 8. Consistency and Tradeoffs
- Strong consistency vs eventual consistency
- Why analytics uses delayed/soft-delete strategy
- Why PARTIAL_COMPLETED is useful and intentional

Figure suggestion:
- Tradeoff table (latency, correctness, complexity)

### Slide 9. Observability and Operations
- OpenTelemetry, Jaeger, Prometheus, Grafana
- Admin page: service health, circuit breaker state, SLA violations
- Operational value in production-like environments

Figure suggestion:
- Jaeger trace screenshot + Admin page screenshot


### Slide 12. Team Contributions (Dedicated Slide)
- Use a table: Member / Owned Areas / Deliverables / Impact

Use this exact direction:

- Haoyuan Shan
  - GitHub final content planning and consolidation, Kubernetes/cloud deployment execution, backend integration closure, overall documentation coordination
  - Impact: turned the project into a cohesive, demo-ready, submission-ready deliverable

- Vritika Malhotra
  - Retry, DLQ, idempotency, and reliability design/documentation
  - Impact: improved failure recovery and robustness of distributed deletion workflows

- Sakshat Patil
  - Frontend dashboard and key workflow UX improvements, real-time status experience
  - Impact: improved visualization quality and demo clarity

- Asim Mohammed
  - Consistency semantics, backend/admin workflow support, status-behavior refinement
  - Impact: improved state-model clarity and operational reliability

Figure suggestion:
- Responsibility matrix visual (light RACI-style)




---

## 2. Final Report Outline (Based on Common Sample Report Structure)

Note for everyone: many sample reports follow a "problem -> design -> implementation -> evaluation -> conclusion" pattern. Please write directly into this structure so we can merge quickly.

### 2.1 Title Page
What to write:
- Project title, course, term, team number, member names, date

Figure suggestion:
- Optional small architecture thumbnail

### 2.2 Abstract (150-250 words)
What to write:
- Problem background
- Proposed approach (event-driven verifiable deletion)
- Key outcomes (working cloud deployment, reliability mechanisms, audit-proof flow)
- Main contributions

Figure suggestion:
- Usually none (optional mini diagram)

### 2.3 Introduction
What to write:
- Context and pain points
- Goals and scope (in-scope vs out-of-scope)
- Report organization

Figure suggestion:
- Problem-context diagram

### 2.4 Requirements and Use Cases
What to write:
- Functional requirements: orchestration, status tracking, proof generation, bulk upload, admin view
- Non-functional requirements: reliability, observability, scalability, maintainability
- Key use cases (compliance deletion, audit evidence)

Figure suggestion:
- Use-case diagram
- Functional vs non-functional requirement table

### 2.5 System Design
What to write:
- Overall architecture
- Service responsibility split
- Event model and request-state machine

Figure suggestion:
- Architecture diagram (main)
- State-machine diagram

### 2.6 Detailed Implementation
What to write:
- Backend orchestration logic
- Cleanup-service processing logic
- Proof-service model and verification approach
- Frontend page structure and key interactions

Figure suggestion:
- Module-level implementation diagram
- 1-2 core UI screenshots (Overview, Proof)

### 2.7 Reliability, Failure Handling, and Consistency
What to write:
- Retry policy (count, interval, trigger conditions)
- DLQ behavior
- Idempotency strategy
- Eventual-consistency semantics and PARTIAL_COMPLETED meaning

Figure suggestion:
- Retry/DLQ flow diagram
- Failure-recovery sequence diagram
- Consistency tradeoff table

### 2.8 Security and Compliance Considerations
What to write:
- Security needs in deletion-and-audit systems
- Value of tamper-evident proof chain
- Key management/encryption approach (if applicable)

Figure suggestion:
- Proof-chain validation visual
- Trust-boundary diagram

### 2.9 Deployment and DevOps
What to write:
- Local deployment (Docker Compose)
- Cloud deployment (Kubernetes)
- Config management, image strategy, environment differences

Figure suggestion:
- Deployment topology
- Optional CI/CD or image-publish flow

### 2.10 Testing and Evaluation
What to write:
- Unit/integration testing strategy
- Core scenario validation results
- Failure-injection results

Figure suggestion:
- Test result table
- Success/failure/recovery scenario comparison

### 2.11 Results and Discussion
What to write:
- Functional completion summary
- Reliability performance summary
- Known limitations (for example: extreme network jitter, high-concurrency stress coverage)

Figure suggestion:
- Metrics chart or summary table

### 2.12 Team Contributions
What to write:
- Member ownership, concrete deliverables, measurable impact
- Collaboration interfaces (who depended on whom)

Figure suggestion:
- Responsibility matrix table (member x module x deliverable)

### 2.13 Conclusion and Future Work
What to write:
- Goal-achievement summary
- Three practical future-work items

Figure suggestion:
- Roadmap (Now / Next / Later)



---

## 3. Minimum Figure Pack (If Time Is Tight)

If we are short on time, we prioritize these 10 visuals first:

1. System architecture diagram (required)
2. Success-path sequence diagram (required)
3. Failure-recovery sequence diagram (required)
4. Retry + DLQ diagram (required)
5. Overview page screenshot (required)
6. Submit/live-progress screenshot (recommended)
7. Proof page screenshot (required)
8. Admin page screenshot (recommended)
9. Jaeger trace screenshot (recommended)
10. Test result screenshot/table (required)

---

## 4. Task Assignment and Ownership

I will own the final GitHub organization and final merge.
- I will also fill in any missing content and unify the style/quality across docs.


### Quality Bar for Everyone

- Keep writing concise and concrete; avoid generic claims
- Every section should include at least one evidence item (diagram, screenshot, or measurable result)
- Use consistent terms for statuses: PENDING, RUNNING, COMPLETED, PARTIAL_COMPLETED, FAILED, RETRYING
- Do not change naming conventions in existing docs without coordinating first

### Merge and Review Rules

- Send me your deliverables in one batch when your section is complete
- I will do one final consistency pass for wording, structure, and cross-links
- If a section references a figure, include the exact figure filename in the text

---

## 5. Where We Edit (Single Source of Truth)

Final report link:
- https://docs.google.com/document/d/1zVc8gXQr986p7e5dH3lIziEjarvsWX0QjNkUjb5WaaE/edit?usp=sharing

Presentation link:
- https://docs.google.com/presentation/d/1w3Axv_KIA-J0iOfelKVlZ5N0FL2gBbWsoLwL0sVEK1o/edit?usp=sharing

Execution order:
1. We use Section 1 as the slide backbone.
2. We use Section 2 as the report backbone.
3. We execute Section 4 in parallel and I do final integration.

---

## 6. My Immediate Actions (Haoyuan)

1. Open one final-submission checklist issue covering slides, report, screenshots, testing evidence, and team-contribution proof.
2. Add two top-level README links: Final Report (Google Doc) and Presentation (Google Slides).
3. Add a docs index page that connects design-docs, demos, and personal reports to reduce reviewer lookup time.


