# Cloud Deployment & Bug Fix Log
**Author:** Haoyuan Shan  
**Project:** EraseGraph — CMPE 273 Final Project  
**Platform:** Google Kubernetes Engine (GKE)

---

## Overview

This document explains everything we did to get EraseGraph running on GKE (Google Cloud), and documents every bug we ran into and how we fixed it. We started from a situation where zero pods were running, and ended up with a fully working end-to-end deletion pipeline accessible at public IPs.

**Cluster:** `erasegraph`, zone `us-central1-a`  
**Frontend public URL:** `http://34.56.39.214`  
**API Gateway public URL:** `http://34.56.122.235:3000`

---

## Step 1: Rebuild All Docker Images for the Right Architecture

### Problem
All 10 service images were built on a MacBook with Apple Silicon (M-series chips), so they were `arm64` images. GKE nodes run on `amd64` (x86_64). When Kubernetes tried to pull and run the images, every pod went into **ImagePullBackOff** because the architecture didn't match.

### Fix
We had to rebuild every single image from scratch targeting `linux/amd64` using Docker's cross-platform build support:

```bash
docker buildx build \
  --platform linux/amd64 \
  --tag aaronshan2635088459/erasegraph-backend:latest \
  --push \
  ./backend
```

We created a script (`scripts/haoyuan_shan_push_images_amd64.sh`) to do this for all 10 services in one go.

### Extra issue: GKE node image cache
One service (`notification-service`) kept pulling the old arm64 image even after we pushed the new one, because the GKE node had cached the old `:latest` manifest. We fixed this by tagging the new image as `:v2` so the node had to pull fresh.

---

## Step 2: Fix PostgreSQL Crash on Startup

### Problem
After the first deployment, the postgres pod was crashing with an error like:
```
initdb: error: directory "/var/lib/postgresql/data" exists but is not empty
It contains a lost+found directory, perhaps due to it being a mount point.
```
The PVC (persistent volume) had a `lost+found` directory at the root mount point, which caused `initdb` to refuse to initialize.

### Fix
Added a `PGDATA` environment variable to the postgres Kubernetes manifest (`k8s/postgres.yaml`) pointing to a subdirectory inside the volume:

```yaml
- name: PGDATA
  value: /var/lib/postgresql/data/pgdata
```

This tells Postgres to use `/var/lib/postgresql/data/pgdata` instead of the root of the volume, avoiding the `lost+found` conflict.

---

## Step 3: Seed the Database Schema and Demo Users

### Problem
Even after Postgres started, there were no tables and no demo users. The init SQL script (`init-scripts/postgres/01-init-schema.sql`) only runs automatically when the database directory is completely empty — but since we had an existing PVC, `initdb` had already run before and the script was skipped.

### Fix
We manually ran the SQL inside the running pod:

```bash
kubectl exec -n erasegraph postgres-75457f8-x9kq2 -- \
  psql -U erasegraph -d erasegraph -c "
    CREATE TABLE users (...);
    INSERT INTO users (id, username, email) VALUES
      ('...', 'alice', 'alice@example.com'),
      ('...', 'bob',   'bob@example.com'),
      ...
  "
```

This created all the tables and seeded the 5 demo users: alice, bob, charlie, diana, eve.

---

## Step 4: Fix Frontend Calling localhost Instead of the Real API

### Problem
The React frontend was hardcoded to call `http://localhost:3001`. This worked locally but obviously not on GKE — the browser was trying to reach the user's own machine.

### Root cause
React apps bake environment variables into the JavaScript bundle **at build time**, not at runtime. Even if you set `REACT_APP_API_BASE_URL` in the container, it doesn't matter — the value was already compiled in during `npm run build`.

### Fix
We modified `frontend/Dockerfile` to accept a build argument and pass it as an environment variable before the build step:

```dockerfile
ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
RUN npm run build
```

Then rebuilt the image with the real IP:

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg REACT_APP_API_BASE_URL=http://34.56.122.235:3000 \
  --tag aaronshan2635088459/erasegraph-frontend:v2 \
  --push \
  ./frontend
```

We had to use `:v2` tag here too because the GKE node had the old image cached.

---

## Step 5: Fix CORS Blocking All API Requests

### Problem
After fixing the API URL, the browser still couldn't load any data. The Chrome DevTools console showed:

```
Access to XMLHttpRequest at 'http://34.56.122.235:3000/users' from origin 'http://34.56.39.214'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

The api-gateway wasn't returning any CORS headers. The browser sends a preflight `OPTIONS` request first, and when it got no response with `Access-Control-Allow-Origin`, it blocked the actual request.

### Fix
We added CORS headers directly inside the raw Express middleware in `api-gateway-service/src/main.ts`, placed before any auth or routing logic so it runs on every request including `OPTIONS`:

```typescript
app.use(async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  // ... rest of middleware
});
```

Rebuilt and deployed as `api-gateway-service:v2`.

---

## Step 6: Fix 401 Unauthorized on All API Requests

### Problem
Even with CORS fixed, all API calls were returning `401 Unauthorized`:
```json
{"statusCode": 401, "message": "Missing or invalid X-Service-Token"}
```

The api-gateway requires an `X-Service-Token` header on every request for internal service authentication. The frontend was never sending it.

### Fix
Added the token as a default header in the axios instance in `frontend/src/services/api.ts`:

```typescript
const API = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:3001",
  headers: {
    "X-Service-Token": process.env.REACT_APP_SERVICE_TOKEN || "Eg2026SvcInternal!",
  },
});
```

Rebuilt and redeployed the frontend image.

---

## Step 7: Fix POST Body Not Being Forwarded Through API Gateway

### Problem
When submitting a deletion request from the UI, the backend returned 400 Bad Request:
```
subject_id can only contain alphanumeric characters, dots, dashes, and underscores
subject_id should not be empty
subject_id must be a string
```

Even though the frontend was sending `{ "subject_id": "alice" }`, the backend was receiving an empty body `{}`.

### Root cause
The api-gateway uses a raw `app.use()` middleware as a proxy. NestJS's default body parser wasn't guaranteed to run before our middleware in the right order, so `req.body` was `undefined`. When we did `JSON.stringify(req.body || {})`, it forwarded `{}` to the backend.

### Fix
Explicitly added `express.json()` middleware before the proxy middleware, and disabled NestJS's built-in body parser to avoid conflicts:

```typescript
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

Rebuilt and deployed as `api-gateway-service:v3`.

---

## Step 8: Fix RabbitMQ Liveness Probe Killing the Pod

### Problem
The RabbitMQ pod was in `CrashLoopBackOff` with 35+ restarts. Looking at the events:
```
Liveness probe failed: command timed out: "rabbitmq-diagnostics -q ping" timed out after 1s
```

The liveness probe was using the default `timeoutSeconds: 1`, but `rabbitmq-diagnostics -q ping` regularly takes more than 1 second on a loaded cluster. Kubernetes kept killing the pod thinking it was dead when it was actually healthy.

### Fix
Added explicit `timeoutSeconds` to both liveness and readiness probes in `k8s/rabbitmq.yaml`:

```yaml
readinessProbe:
  exec:
    command: ["rabbitmq-diagnostics", "-q", "ping"]
  initialDelaySeconds: 20
  periodSeconds: 10
  timeoutSeconds: 10      # was missing (defaulted to 1s)
  failureThreshold: 10
livenessProbe:
  exec:
    command: ["rabbitmq-diagnostics", "-q", "ping"]
  initialDelaySeconds: 60
  periodSeconds: 30
  timeoutSeconds: 15      # was missing (defaulted to 1s)
  failureThreshold: 5
```

---

## Step 9: Fix RabbitMQ Losing All Queues/Users After Restart

### Problem
Every time RabbitMQ restarted, all queues, exchange bindings, and users were gone. The worker services couldn't connect (`ACCESS_REFUSED - Login was refused`), and even when they could connect, events were silently dropped because the queues didn't exist yet.

The `definitions.json` file was mounted into the container, and there was a `postStart` lifecycle hook that tried to import it via the management API — but the hook ran too early before RabbitMQ was fully up, so it always failed silently.

### Fix — Part A: Auto-load definitions via rabbitmq.conf
Added `rabbitmq.conf` to the ConfigMap with the native auto-load setting:

```
management.load_definitions = /etc/rabbitmq/definitions.json
loopback_users = none
```

Then mounted it in `k8s/rabbitmq.yaml`:

```yaml
- name: rabbitmq-definitions
  mountPath: /etc/rabbitmq/rabbitmq.conf
  subPath: rabbitmq.conf
  readOnly: true
```

This makes RabbitMQ itself load the definitions at startup before accepting any connections, which is more reliable than a postStart hook.

### Fix — Part B: Manual recovery for immediate sessions
When RabbitMQ had already started without definitions, we manually ran:

```bash
# Restore user
kubectl exec -n erasegraph deploy/rabbitmq -- rabbitmqctl add_user erasegraph <password>
kubectl exec -n erasegraph deploy/rabbitmq -- rabbitmqctl set_user_tags erasegraph administrator
kubectl exec -n erasegraph deploy/rabbitmq -- rabbitmqctl set_permissions -p / erasegraph '.*' '.*' '.*'

# Re-import definitions (queues, exchanges, bindings)
kubectl exec -n erasegraph deploy/rabbitmq -- wget -qO- \
  --header="Authorization: Basic <base64>" \
  --post-file=/etc/rabbitmq/definitions.json \
  http://localhost:15672/api/definitions
```

Then restarted all worker services so they could reconnect and start consuming from the now-existing queues.

---

## Step 10: Fix Backend Not Reconnecting to RabbitMQ After Restart

### Problem
After any RabbitMQ restart, the backend would throw `IllegalOperationError: Channel closed` on every deletion request. The backend process was still running, but its AMQP channel was dead and nothing would ever fix it without restarting the backend pod manually.

### Root cause
`EventPublisherService` had zero error handling on the AMQP connection/channel. When RabbitMQ went down, the `channel` object entered a closed state and just sat there. The code checked `if (!this.channel)` but a closed channel is not `null`, so it passed the check and then crashed on use.

### Fix
Added connection and channel event listeners in `backend/src/events/event-publisher.service.ts` to handle disconnections gracefully, plus a `scheduleReconnect()` function:

```typescript
this.connection.on('error', () => this.scheduleReconnect());
this.connection.on('close', () => this.scheduleReconnect());
this.channel.on('error', () => { this.channel = null; });
this.channel.on('close', () => { this.channel = null; });

private scheduleReconnect() {
  this.channel = null;
  this.connection = null;
  setTimeout(async () => {
    try { await this.connect(); }
    catch { this.scheduleReconnect(); }  // retry every 5s until success
  }, 5000);
}
```

Also updated `publishEvent()` to detect a null channel and rebuild it before publishing, instead of throwing.

Rebuilt and deployed as `backend:v2`.

---

## Summary of All Changes

| # | Problem | File Changed | Fix |
|---|---------|-------------|-----|
| 1 | Images built for arm64, GKE is amd64 | `scripts/haoyuan_shan_push_images_amd64.sh` (new) | Rebuild all images with `--platform linux/amd64` |
| 2 | GKE node cache served stale image | — | Used new version tags (`:v2`, `:v3`) to bypass cache |
| 3 | Postgres crash: `lost+found` directory | `k8s/postgres.yaml` | Added `PGDATA` env var to subdirectory |
| 4 | No schema or demo users in DB | — | Manually ran SQL via `kubectl exec` |
| 5 | Frontend calling `localhost:3001` | `frontend/Dockerfile` | Added `ARG REACT_APP_API_BASE_URL`, rebuilt with real IP |
| 6 | CORS blocking all browser requests | `api-gateway-service/src/main.ts` | Added CORS headers + OPTIONS preflight handler in middleware |
| 7 | All API calls returning 401 | `frontend/src/services/api.ts` | Added `X-Service-Token` default header to axios instance |
| 8 | POST body forwarded as empty `{}` | `api-gateway-service/src/main.ts` | Added explicit `express.json()`, disabled NestJS body parser |
| 9 | RabbitMQ killed by liveness probe | `k8s/rabbitmq.yaml` | Added `timeoutSeconds: 10/15` to probes |
| 10 | RabbitMQ loses all data on restart | `k8s/rabbitmq.yaml` + ConfigMap | Mounted `rabbitmq.conf` with `management.load_definitions` |
| 11 | Backend AMQP channel never reconnects | `backend/src/events/event-publisher.service.ts` | Added connection error handlers and auto-reconnect with retry |
