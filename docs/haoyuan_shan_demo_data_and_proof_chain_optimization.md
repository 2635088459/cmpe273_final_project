# Haoyuan Shan - Demo Data and Proof Chain Optimization

## Overview

This document explains the improvements I made after the merge and cloud deployment work. The main goal was to make the demo better and more reliable.

Before this optimization, the system had two problems:

1. The deletion proof often showed empty results for search, analytics, and cache.
2. The proof hash chain sometimes failed verification, even when the deletion workflow itself finished successfully.

I also updated the Kubernetes manifests so the repo matches the real cloud deployment.

---

## Problem 1: Demo proof looked too empty

### What was happening

The `restore-demo` endpoint only recreated users in the main `users` table. It did not recreate related data in the other storage systems.

Because of that, when I deleted a demo user, the proof usually looked like this:

- `primary_data` had real deletion results
- `search_cleanup` showed `deleted_records: 0`
- `analytics_cleanup` showed `soft_deleted_rows: 0`
- `cache_cleanup` showed an empty `cache_keys_removed` array

This made the demo look weak, even though the system was working correctly.

### What I changed

I extended the demo restore flow so it now seeds data into multiple places, not just the main user table.

Now, when `POST /users/restore-demo` is called, it restores:

- users in the primary database
- search documents in `search_index_documents`
- analytics rows in `analytics_events`
- Redis cache keys like `user:<subject>`, `session:<subject>:*`, and `profile:<subject>`

### Why this is better

Now the proof shows real cleanup work from different parts of the system. This makes the demo easier to explain, because we can clearly show that one deletion request affects multiple storage layers.

---

## Problem 2: Proof verification failed

### What was happening

The API has a proof verification endpoint:

- `GET /deletions/:id/proof/verify`

Sometimes this returned:

```json
{
  "valid": false,
  "verified": false,
  "message": "previous_hash_mismatch"
}
```

The deletion request itself was finishing, but the proof chain was not always valid.

### Root cause

The problem was not in the hash formula.

The real problem was concurrent proof event writes.

Different services could finish at almost the same time. When that happened, two events could both read the same "last" proof event before saving. Then both of them used the same `previous_hash`. This created a fork in the chain.

Later, when the system tried to verify the proof as one linear chain, verification failed.

### What I changed

I created a shared proof append service that serializes proof event writes for each request.

The new logic uses:

- a database transaction
- a PostgreSQL advisory lock based on `request_id`

This means proof events for the same deletion request are appended one at a time in a safe order.

I also updated both places that create proof events to use this shared service:

- the event consumer
- the SLA monitor

### Why this is better

Now the proof chain is written in one correct order. New requests do not create hash forks, so verification works the way it was designed to work.

---

## Problem 3: Kubernetes manifests did not match the cloud

### What was happening

The live cloud deployment was using fixed image tags, but the repo manifests still pointed to `latest`.

That is risky because a future `kubectl apply` could move the cluster back to an older or different image.

### What I changed

I updated the Kubernetes manifests to match the actual cloud deployment.

Current image tags:

- frontend: `aaronshan2635088459/erasegraph-frontend:fix-api-20260508-1`
- backend: `aaronshan2635088459/erasegraph-backend:proof-chain-20260508-1`

### Why this is better

Now the repository and the cluster are aligned. This makes deployment more predictable and avoids accidental rollback to stale images.

---

## Validation

After making the changes, I tested the system again on the cloud deployment.

### Test steps

1. Call `POST /users/restore-demo`
2. Create a new deletion request for a demo user
3. Wait for the request to finish
4. Read the proof
5. Call the proof verification endpoint

### Result

For a new deletion request, the system returned:

- `status: COMPLETED`
- `valid: true`
- `verified: true`

The proof also showed real metadata from multiple services, for example:

- `primary_data.deleted_records = 1`
- `search_cleanup.deleted_records = 2`
- `analytics_cleanup.soft_deleted_rows = 2`
- `cache_cleanup.cache_keys_removed` contained 4 keys
- `backup.backup_records_removed = 1`

This means the demo is now stronger in two ways:

1. The proof contains meaningful data.
2. The proof chain is actually verifiable.

---

## Important note about old requests

Old deletion requests that were created before this fix may still fail verification.

That is expected.

Those old proof events were already written with the broken concurrent behavior, so the historical chain data is still inconsistent. The new fix prevents the problem for new requests, but it does not automatically repair old proof chains.

---

## Main files changed

- `backend/src/users/users.service.ts`
- `backend/src/users/users.controller.ts`
- `backend/src/proof/proof-chain.service.ts`
- `backend/src/proof/proof.module.ts`
- `backend/src/events/event-consumer.service.ts`
- `backend/src/admin/sla-monitor.service.ts`
- `backend/src/admin/admin.module.ts`
- `backend/src/app.module.ts`
- `backend/package.json`
- `k8s/backend.yaml`
- `k8s/frontend.yaml`

---

## Conclusion

This optimization improved the project in three important ways.

First, the demo data is much better because deletion proofs now show real cleanup results from multiple systems.

Second, the proof verification logic now works correctly for new requests because proof events are appended in a safe order.

Third, the Kubernetes manifests now match the real cloud deployment, which makes future updates safer.

Overall, the system is now easier to demo, easier to explain, and more reliable.