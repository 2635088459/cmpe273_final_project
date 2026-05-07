# Cloud Deployment Plan for EraseGraph

**Date:** May 4, 2026
**Scope:** What we need to fix and do before EraseGraph can be deployed to a real cloud environment (e.g., AWS EKS, Google GKE, or Azure AKS)

---

## Overview

We already have Docker images for all our services, a full set of Kubernetes manifests in `k8s/`, and a Helm chart in `helm/erasegraph/`. Locally, everything works. But when we tried to assess whether the project is ready to run on a real cloud cluster, we found several issues that would either cause pods to crash or create security problems. This document lists those issues and explains what needs to be fixed.

---

## What We Already Have

Before getting into the problems, here is a quick summary of what is already done and working:

| Component | Status |
|---|---|
| Dockerfiles for all 7 services | Done — multi-stage builds, runs as non-root user |
| `docker-compose.yml` for local dev | Done — full stack spins up with health checks |
| Kubernetes YAML files (`k8s/`) | Done — 14 files covering all services and infra |
| Helm chart (`helm/erasegraph/`) | Done — templated, parameterized with values.yaml |
| `/health` endpoints on all services | Done — used for readiness and liveness probes |
| OpenTelemetry tracing to Jaeger | Done — all services send traces |

---

## Issues That Must Be Fixed Before Cloud Deployment

### Issue 1 — Missing Postgres Init ConfigMap

**File to fix:** Create a new file `k8s/postgres-init-configmap.yaml`

**What the problem is:**
`k8s/postgres.yaml` references a ConfigMap named `postgres-init-sql` to mount the database initialization SQL scripts. But that ConfigMap does not exist anywhere in the `k8s/` folder. When Kubernetes tries to start the Postgres pod, it will fail because it cannot find the volume it needs.


**How to fix it:**
Create a ConfigMap from the SQL files in `infra/init-scripts/postgres/`. This can be done with:
```bash
kubectl create configmap postgres-init-sql \
  --from-file=infra/init-scripts/postgres/ \
  --namespace=erasegraph \
  --dry-run=client -o yaml > k8s/postgres-init-configmap.yaml
```
Then add this file to the apply command along with the rest.

---

### Issue 2 — Ingress Routing Breaks API Calls

**File to fix:** `k8s/ingress.yaml`

**What the problem is:**
The ingress is set up to route `/api` traffic to the backend and `/` traffic to the frontend. However, there is an annotation:
```yaml
nginx.ingress.kubernetes.io/rewrite-target: /
```
This strips the `/api` prefix before passing the request to the backend. So a request like `GET /api/deletions` becomes `GET /deletions` by the time it reaches the backend, which does not match any of the backend routes.

**Why it matters:**
Every API call from the frontend will get a 404. The app will appear to load but nothing will work.

**How to fix it:**
Remove the `rewrite-target` annotation, or change the routing to use regex groups so the prefix is preserved properly. The simplest fix for our setup is to just remove the annotation and keep the `/api` prefix in the backend routes (which is already how the backend is set up).

---

### Issue 3 — No Kubernetes Manifest for API Gateway

**File to create:** `k8s/api-gateway.yaml`

**What the problem is:**
The `api-gateway-service/` folder has a full Dockerfile and source code, and it is in `docker-compose.yml`. But there is no matching YAML file in `k8s/`. When deploying to Kubernetes, the API Gateway simply does not exist.

**Why it matters:**
The API Gateway handles token validation. Without it, that layer of validation is skipped.

**How to fix it:**
Create `k8s/api-gateway.yaml` following the same pattern as the other service manifests (Deployment + Service). The container listens on port 3000 and needs the same environment variables from the ConfigMap.

---

### Issue 4 — `SIMULATE_FAILURE` Flag Left On in ConfigMap

**File to fix:** `k8s/configmap.yaml`

**What the problem is:**
The ConfigMap has this line:
```yaml
SIMULATE_FAILURE: "true"
```
This flag was added during development and testing. It intentionally causes services to fail at certain points to test retry logic. In a real cloud deployment, this should never be `true`.

**Why it matters:**
Leaving this on means the services will randomly fail even in production, which is exactly what we do not want.

**How to fix it:**
Change the value to `"false"` in `k8s/configmap.yaml` and in `helm/erasegraph/values.yaml`.

---

### Issue 5 — Placeholder Passwords in Secrets

**File to fix:** `k8s/secrets.yaml`

**What the problem is:**
All passwords in the secrets file are set to `erasegraph_secret`, just base64-encoded. For example:
```yaml
POSTGRES_PASSWORD: ZXJhc2VncmFwaF9zZWNyZXQ=  # decodes to "erasegraph_secret"
```
These are placeholder values we used during development. They are not safe for a real environment.

**Why it matters:**
Anyone who reads the YAML file (or knows the base64 encoding) gets the database and RabbitMQ passwords. This is a basic security problem.

**How to fix it:**
Before deploying to a real cluster:
- Replace all values with actual strong passwords
- Do not commit the real secrets to git — use a `.gitignore` rule or a tool like [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) which encrypts secrets so they are safe to store in version control

---

### Issue 6 — No Resource Limits on Any Deployment

**Files to fix:** All files in `k8s/` that define Deployments (backend, all consumer services, frontend)

**What the problem is:**
None of our Deployment specs have a `resources` block. In Kubernetes, if you do not set CPU and memory limits, a pod can use as much as it wants. On a shared cloud node, one service can starve all the others.

**Why it matters:**
Without limits, cloud providers also cannot make accurate cost estimates. More importantly, one misbehaving pod can take down the whole cluster node.

**How to fix it:**
Add a `resources` block to each container spec. For example, for the backend:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```
The exact values depend on what we observe during load testing, but even rough estimates are better than nothing.

---

## Additional Things That Are Not Blocking But Should Be Done

These are not required for a first deployment, but they matter for anything beyond a class demo.

### No TLS / HTTPS on the Ingress
The ingress does not have any TLS configuration, so all traffic is plain HTTP. For a real deployment, we would add `cert-manager` to automatically get Let's Encrypt certificates.

### Stateful Services Should Use StatefulSets
Postgres, Redis, and RabbitMQ are all deployed as `Deployment` objects. Deployments are designed for stateless services. For services that store data, `StatefulSet` is the right choice because it gives each pod a stable identity and ensures volumes are reattached correctly when a pod restarts. For this project's scope, a single-replica Deployment is acceptable, but this is a known trade-off.

### Jaeger Loses Data on Restart
The Jaeger instance we are using stores traces in memory. Every time the pod restarts, all trace history is gone. For a production system, Jaeger should be configured to write to a persistent storage backend like Elasticsearch or Cassandra. For this project, in-memory is acceptable.

### Images Need a Container Registry for Real Cloud
All our `k8s/` manifests use `imagePullPolicy: IfNotPresent`. This works when the images already exist on the local machine (e.g., Docker Desktop). On a real cloud cluster like EKS or GKE, the nodes do not have our images. We would need to push images to a registry (like Docker Hub, Amazon ECR, or Google Artifact Registry) and update the image names in the manifests to point there.

---

## Summary of Files to Create or Modify

| File | Action | Reason |
|---|---|---|
| `k8s/postgres-init-configmap.yaml` | **Create** | Postgres pod cannot start without it |
| `k8s/api-gateway.yaml` | **Create** | API Gateway has no K8s manifest |
| `k8s/ingress.yaml` | **Fix** | Rewrite rule breaks all API routes |
| `k8s/configmap.yaml` | **Fix** | `SIMULATE_FAILURE` must be set to false |
| `k8s/secrets.yaml` | **Fix** | Replace placeholder passwords |
| `k8s/*.yaml` (all Deployments) | **Fix** | Add `resources` limits and requests |
| `helm/erasegraph/values.yaml` | **Fix** | Mirror the configmap and resource fixes in Helm |

---

## Suggested Deployment Order

Once the fixes above are applied, this is the order to apply the manifests:

```bash
# 1. Create the namespace first
kubectl apply -f k8s/namespace.yaml

# 2. Apply shared config and secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres-init-configmap.yaml

# 3. Start infrastructure (database, cache, message broker, tracing)
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/rabbitmq.yaml
kubectl apply -f k8s/jaeger.yaml

# 4. Wait for infra to be ready, then start application services
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/primary-data-service.yaml
kubectl apply -f k8s/cache-cleanup-service.yaml
kubectl apply -f k8s/proof-service.yaml
kubectl apply -f k8s/backup-service.yaml
kubectl apply -f k8s/api-gateway.yaml

# 5. Start frontend and ingress last
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

You can verify everything is running with:
```bash
kubectl get pods -n erasegraph
kubectl get services -n erasegraph
```

All pods should reach `Running` status. The backend pods may take 30–60 seconds because of the `initialDelaySeconds` on their readiness probes.

---

## Conclusion

The project is in a good state and most of the deployment infrastructure is already built. The six issues described above are all fixable — most of them are small configuration changes. The biggest one (Issue 1, the missing Postgres ConfigMap) would cause the whole system to fail on startup, so that one needs to be done first. Once these are addressed, EraseGraph should be deployable to any standard managed Kubernetes cluster.
