# EraseGraph — Architecture & Sequence Diagrams

This document uses **Mermaid** syntax. GitHub renders it natively.  
To export as PNG / SVG, see the "Export Options" section at the bottom.

---

## 1. System Architecture Diagram (MVP)

```mermaid
graph TB
    %% ───── User ─────
    User([👤 User / Admin])

    %% ───── Frontend ─────
    subgraph Frontend
        React[React Dashboard]
    end

    %% ───── Backend Services ─────
    subgraph Backend Services
        DRS[Deletion Request Service<br/><i>Orchestrator</i>]
        PDS[Primary Data Service]
        CCS[Cache Cleanup Service]
        PS[Proof Service]
    end

    %% ───── Storage ─────
    subgraph Storage
        PG[(PostgreSQL<br/>deletion_requests<br/>deletion_steps<br/>proof_events)]
        Redis[(Redis Cache)]
    end

    %% ───── Message Queue ─────
    subgraph Messaging
        RMQ[[RabbitMQ]]
    end

    %% ───── Observability ─────
    subgraph Observability
        OTel[OpenTelemetry<br/>Collector]
        Jaeger[Jaeger UI]
    end

    %% ───── Synchronous Communication (HTTP REST) ─────
    User -->|HTTP| React
    React -->|POST /deletions<br/>GET /deletions/id<br/>GET /deletions/id/proof| DRS
    DRS -->|READ / WRITE| PG
    PS  -->|WRITE proof_events| PG
    PDS -->|DELETE user row| PG
    CCS -->|DEL key| Redis

    %% ───── Asynchronous Communication (RabbitMQ) ─────
    DRS -->|publish<br/>DeletionRequested| RMQ
    RMQ -->|consume| PDS
    RMQ -->|consume| CCS
    PDS -->|publish<br/>DeletionStepSucceeded / Failed| RMQ
    CCS -->|publish<br/>DeletionStepSucceeded / Failed| RMQ
    RMQ -->|consume step results| DRS
    RMQ -->|consume step results| PS

    %% ───── Tracing ─────
    DRS -.->|traces| OTel
    PDS -.->|traces| OTel
    CCS -.->|traces| OTel
    PS  -.->|traces| OTel
    OTel -.-> Jaeger

    %% ───── Styles ─────
    classDef svc fill:#4A90D9,color:#fff,stroke:#2B6CB0
    classDef store fill:#48BB78,color:#fff,stroke:#2F855A
    classDef mq fill:#ED8936,color:#fff,stroke:#C05621
    classDef obs fill:#9F7AEA,color:#fff,stroke:#6B46C1

    class DRS,PDS,CCS,PS svc
    class PG,Redis store
    class RMQ mq
    class OTel,Jaeger obs
```

**Legend**

| Color | Meaning |
|-------|---------|
| 🔵 Blue | Backend microservices |
| 🟢 Green | Persistent storage (PostgreSQL / Redis) |
| 🟠 Orange | Message queue (RabbitMQ) |
| 🟣 Purple | Observability (OpenTelemetry + Jaeger) |
| Solid arrow | Synchronous HTTP or direct read/write |
| Dashed arrow | Asynchronous tracing data |

---

## 2. Success Sequence Diagram (Normal Deletion Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant React as React Dashboard
    participant DRS as Deletion Request<br/>Service
    participant PG as PostgreSQL
    participant RMQ as RabbitMQ
    participant PDS as Primary Data<br/>Service
    participant CCS as Cache Cleanup<br/>Service
    participant PS as Proof Service

    User->>React: Click "Delete User"
    React->>DRS: POST /deletions {subject_id}
    activate DRS
    DRS->>PG: INSERT deletion_request (PENDING)
    DRS->>PG: INSERT deletion_steps x2 (PENDING)
    DRS->>RMQ: publish DeletionRequested
    DRS-->>React: 202 Accepted {request_id}
    deactivate DRS

    Note over RMQ: fanout / topic exchange

    RMQ->>PDS: consume DeletionRequested
    activate PDS
    PDS->>PG: DELETE FROM users WHERE id = ?
    PDS->>RMQ: publish DeletionStepSucceeded (primary_data)
    deactivate PDS

    RMQ->>CCS: consume DeletionRequested
    activate CCS
    CCS->>CCS: DEL redis key
    CCS->>RMQ: publish DeletionStepSucceeded (cache)
    deactivate CCS

    RMQ->>PS: consume StepSucceeded x2
    activate PS
    PS->>PG: INSERT proof_events x2
    deactivate PS

    RMQ->>DRS: consume StepSucceeded x2
    activate DRS
    DRS->>PG: UPDATE deletion_steps -> SUCCEEDED
    DRS->>PG: UPDATE deletion_request -> COMPLETED
    deactivate DRS

    User->>React: Check status
    React->>DRS: GET /deletions/{id}
    DRS-->>React: {status: COMPLETED, steps: [...]}

    User->>React: View proof
    React->>DRS: GET /deletions/{id}/proof
    DRS->>PG: SELECT proof_events
    DRS-->>React: [{service: primary_data, ...}, {service: cache, ...}]
```

---

## 3. Failure & Recovery Sequence Diagram (Cache Cleanup Fails -> Retry -> Recovery)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant React as React Dashboard
    participant DRS as Deletion Request<br/>Service
    participant PG as PostgreSQL
    participant RMQ as RabbitMQ
    participant PDS as Primary Data<br/>Service
    participant CCS as Cache Cleanup<br/>Service
    participant PS as Proof Service

    User->>React: Click "Delete User"
    React->>DRS: POST /deletions {subject_id}
    activate DRS
    DRS->>PG: INSERT request (PENDING) + steps x2
    DRS->>RMQ: publish DeletionRequested
    DRS-->>React: 202 Accepted
    deactivate DRS

    %% ───── Primary Data succeeds ─────
    RMQ->>PDS: consume DeletionRequested
    activate PDS
    PDS->>PG: DELETE user row ✅
    PDS->>RMQ: publish DeletionStepSucceeded (primary_data)
    deactivate PDS

    %% ───── Cache Cleanup first attempt fails ─────
    RMQ->>CCS: consume DeletionRequested
    activate CCS
    CCS->>CCS: DEL redis key
    Note right of CCS: ❌ Simulated failure<br/>(connection timeout /<br/>intentional exception)
    CCS->>RMQ: publish DeletionStepFailed (cache, attempt=1)
    deactivate CCS

    %% ───── Proof recording ─────
    RMQ->>PS: consume StepSucceeded + StepFailed
    activate PS
    PS->>PG: INSERT proof_events (succeeded: primary_data)
    PS->>PG: INSERT proof_events (failed: cache, attempt=1)
    deactivate PS

    %% ───── DRS aggregates -> PARTIAL_COMPLETED ─────
    RMQ->>DRS: consume StepSucceeded + StepFailed
    activate DRS
    DRS->>PG: UPDATE step(primary_data) -> SUCCEEDED
    DRS->>PG: UPDATE step(cache) -> FAILED, attempt_count=1
    DRS->>PG: UPDATE request -> PARTIAL_COMPLETED
    deactivate DRS

    %% ───── User sees partial completion ─────
    User->>React: Check status
    React->>DRS: GET /deletions/{id}
    DRS-->>React: {status: PARTIAL_COMPLETED}

    %% ───── Retry (delayed queue / scheduled task) ─────
    Note over RMQ: ⏰ After 30s delay<br/>message redelivered<br/>(dead-letter + TTL)

    RMQ->>CCS: re-consume DeletionRequested (retry)
    activate CCS
    CCS->>CCS: DEL redis key
    Note right of CCS: ✅ Retry succeeds
    CCS->>RMQ: publish DeletionStepSucceeded (cache, attempt=2)
    deactivate CCS

    %% ───── Proof records retry success ─────
    RMQ->>PS: consume StepSucceeded (cache)
    activate PS
    PS->>PG: INSERT proof_events (succeeded: cache, attempt=2)
    deactivate PS

    %% ───── DRS aggregates -> COMPLETED ─────
    RMQ->>DRS: consume StepSucceeded (cache)
    activate DRS
    DRS->>PG: UPDATE step(cache) -> SUCCEEDED
    DRS->>PG: UPDATE request -> COMPLETED ✅
    deactivate DRS

    %% ───── User sees final completion ─────
    User->>React: Check status
    React->>DRS: GET /deletions/{id}
    DRS-->>React: {status: COMPLETED}
    User->>React: View proof
    React->>DRS: GET /deletions/{id}/proof
    DRS-->>React: [primary_data ✅, cache ✅ (retry)]
```

---



