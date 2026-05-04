# Subject Resolution Service — Design Document

**Author:** Sakshat Patil  
**Task:** DOC-SVC-001

---

## The Problem: One User, Many Internal IDs

In a distributed system each service typically evolves its own storage schema independently. A user who signs up as `alice@example.com` may be stored under completely different keys in each downstream service:

| Service | Internal identifier |
|---|---|
| Primary database | UUID `9f3c…` (auto-generated primary key) |
| Cache service | Redis key `user:alice` (username-based) |
| Search index | Indexed by `alice@example.com` (email) |
| Analytics service | Session token `sess_abc123` |
| Backup store | Composite key `tenant:demo/user:9f3c…` |

When a GDPR deletion request arrives with `subject_id = alice@example.com`, each service receives that same string. Services that store data under a different key — such as the cache service which uses `user:alice` — silently skip deletion because the identifier doesn't match anything they know.

This is a real-world bug class that EraseGraph currently does not protect against.

---

## Proposed Solution: Subject Resolution Step

Add a **subject resolution step** as the first action in every deletion workflow, before any cleanup events are published. This step looks up the canonical internal identifier for each registered service, then embeds those identifiers in the outgoing event payload.

```
DeletionRequested (subject_id = alice@example.com)
         │
         ▼
  SubjectResolutionService
  ┌──────────────────────────────────────────────┐
  │  primary_data  → 9f3c-…  (UUID lookup)       │
  │  cache         → user:alice  (username lookup)│
  │  search_index  → alice@example.com  (no-op)  │
  │  analytics     → sess_abc123  (session lookup)│
  └──────────────────────────────────────────────┘
         │
         ▼
  DeletionRequestedResolved
  {
    subject_id: "alice@example.com",
    resolved_ids: {
      primary_data:  "9f3c-…",
      cache:         "user:alice",
      search_index:  "alice@example.com",
      analytics:     "sess_abc123"
    }
  }
```

Each downstream service reads its own key from `resolved_ids` instead of using the raw `subject_id`.

---

## Database Schema

```sql
CREATE TABLE subject_mappings (
    external_user_id  VARCHAR(100) NOT NULL,
    service_name      VARCHAR(100) NOT NULL,
    internal_subject_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (external_user_id, service_name)
);

-- Example rows
INSERT INTO subject_mappings VALUES
  ('alice@example.com', 'primary_data',  '9f3c1b2a-…'),
  ('alice@example.com', 'cache',         'user:alice'),
  ('alice@example.com', 'analytics',     'sess_abc123');
```

The table is populated at registration time and updated whenever a service creates a new internal representation of a user.

---

## How It Makes the System More GDPR-Compliant

GDPR Article 17 (Right to Erasure) requires that personal data be erased "without undue delay." A deletion workflow that silently skips a service because of an ID mismatch is a compliance failure even if the orchestrator reports `COMPLETED`.

Subject resolution closes this gap by making the identifier translation explicit and auditable. A `RESOLUTION_FAILED` proof event (emitted when no mapping exists for a service) is better than a silent skip — it gives the compliance team a clear signal to investigate.

---

## API Changes Required

### New resolution endpoint (internal use only)

```
GET /internal/resolve?external_user_id={id}&services[]={svc1}&services[]={svc2}

Response:
{
  "primary_data":  "9f3c-…",
  "cache":         "user:alice",
  "analytics":     "sess_abc123"
}
```

### Event payload change

`DeletionRequested` gains a `resolved_ids` field (optional, absent until resolution runs):

```typescript
type DeletionRequestedEvent = {
  request_id: string;
  subject_id: string;
  trace_id: string;
  resolved_ids?: Record<string, string>;
};
```

### Consumer change

Each cleanup service checks `resolved_ids[serviceName] ?? subject_id` so it degrades gracefully if resolution data is absent.

---

## What We Would Build (Full Implementation)

1. `SubjectResolutionModule` in the backend with a `SubjectResolutionService`
2. Seed script to populate `subject_mappings` from the existing `demo_users` table
3. Resolution step runs synchronously before `DeletionRequested` is published — adds ~50 ms latency in exchange for correctness
4. Emit `SUBJECT_RESOLVED` proof event listing which services got mapped IDs
5. Emit `SUBJECT_RESOLUTION_PARTIAL` if one or more services had no mapping (workflow still continues)
