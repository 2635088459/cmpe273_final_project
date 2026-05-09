# Consistency tradeoffs in EraseGraph (DOC-CONSISTENCY-001)

EraseGraph models a **distributed deletion**: one API request fans out to several stores (primary database, cache, simulated search index, backup marker, delayed analytics). Each store has different latency, failure modes, and consistency expectations.

## Why deletion is not instant

Work is **asynchronous** after `POST /deletions`. The coordinator records steps and publishes `DeletionRequested`. Workers run in parallel (subject to RabbitMQ dispatch and prefetch). Some steps are intentionally slower: **analytics cleanup** waits several seconds before soft-deleting rows to demonstrate **eventual consistency** and a visible `PARTIAL_COMPLETED` window while faster steps (`primary_data`, `cache`, `search_cleanup`, `backup`) have already finished.

## Strong vs eventual consistency (in this codebase)

| Area | Behavior in EraseGraph |
|------|-------------------------|
| **Coordinator state** (`deletion_requests`, `deletion_steps`) | **Strong** from the API’s perspective: the backend updates steps as step-result events arrive; status aggregates only when the model says it is safe. |
| **Primary user row** | **Strong** for the row itself once the primary-data service runs: the user record is removed from Postgres. |
| **Cache** | **Eventual**: Redis keys may lag until the cache worker runs; retries can extend the window. |
| **Search index table** | **Eventual**: documents disappear when the search worker processes the message. |
| **Analytics** | **Eventual by design**: soft delete after a delay; the request may show `PARTIAL_COMPLETED` while analytics is still pending. |
| **Proof / audit** | **Append-only audit trail** with a **tamper-evident hash chain** on `proof_events`: integrity is verifiable after the fact; ordering follows event processing, not wall-clock “simultaneity” across services. |

## Why `PARTIAL_COMPLETED` is a valid state

`PARTIAL_COMPLETED` is used in two situations:

1. **Mid-workflow (Member 2 demo)**: All “fast” steps succeeded but **analytics** is still running. The dashboard can show overall partial completion without implying the workflow failed.
2. **Terminal outcome (existing behavior)**: All steps reached a terminal state and at least one step was **skipped** due to a **circuit breaker** while others succeeded—business-wise the request did not fully propagate everywhere.

Neither case is a generic “bug”; they encode **realistic tradeoffs** between availability, latency, and completeness.

## Example timeline (analytics after primary/cache/search)

1. `PENDING` → request created; steps created; `DeletionRequested` published.  
2. Primary, cache, search, and backup workers finish quickly → their steps move to `SUCCEEDED`.  
3. Coordinator sets **`PARTIAL_COMPLETED`** while analytics is still `PENDING` or `RUNNING`.  
4. After the configured delay, analytics soft-deletes its rows and publishes success → analytics step `SUCCEEDED`.  
5. All steps terminal with no failures → status becomes **`COMPLETED`**, `completed_at` set, and a **simulated GDPR notification** row is written from the lifecycle event.

This timeline is what we show when explaining **eventual consistency**: the user’s data is gone from the “hot” path first; analytics catches up seconds later.
