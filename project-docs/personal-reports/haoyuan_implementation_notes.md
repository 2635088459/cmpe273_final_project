# Haoyuan Shan — Implementation Notes

**Tasks covered:** CODE-INFRA-001, CODE-INFRA-002, CODE-OBS-001, CODE-INFRA-003, DOC-K8S-001, and the two optional tasks (Helm chart, Prometheus + Grafana)

---

## What I was responsible for

My part of the project was mostly around infrastructure and observability — getting the system to run on Kubernetes, adding a way to monitor what's happening, and making sure the backend behaves well under production-like conditions (rate limiting, health checks). I also did two optional tasks after finishing the required ones.

---

## CODE-INFRA-001 — Kubernetes Manifests

### What I did

I created a `k8s/` folder with 14 YAML files that describe the full deployment of the EraseGraph system on Kubernetes. Each service (backend, frontend, postgres, redis, rabbitmq, jaeger, and all four microservices) gets its own `Deployment` and `Service` resource. I also added a `ConfigMap` for shared environment variables, a `Secret` for passwords, a `PersistentVolumeClaim` for postgres storage, and an `Ingress` for external routing.

### Design decisions

**Why separate files instead of one big YAML?**  
It's much easier to update one service without touching everything else. If I need to change only the backend, I just edit `k8s/backend.yaml`. If everything was in one file, a small typo could break the whole apply.

**Why 2 replicas for backend?**  
The project spec asked for this to demonstrate horizontal scaling. With 2 replicas, if one pod dies, the other one is still serving traffic. This was also useful for the pod recovery demo — when I kill one backend pod, the second one keeps things running with zero downtime.

**Why use ConfigMap + Secret instead of putting env vars directly in Deployment?**  
Hardcoding passwords in a Deployment YAML is bad practice. If that file ever gets pushed to a public repo, the credentials are exposed. Putting them in a `Secret` keeps them separate. The `ConfigMap` holds non-sensitive config like hostnames and ports.

**The postgres init SQL problem**  
One issue I ran into: when Kubernetes starts a fresh postgres pod, it has no tables. The docker-compose setup handled this by mounting `init-scripts/postgres/01-init-schema.sql` into the container. In Kubernetes, I solved this by creating a `ConfigMap` from that SQL file and mounting it into the postgres pod at `/docker-entrypoint-initdb.d`. Postgres automatically runs any `.sql` files in that directory on first startup.

**One thing that didn't work at first**  
When I first ran `kubectl apply -f k8s/`, some resources failed because the namespace didn't exist yet. Kubernetes processes files alphabetically, and even though `namespace.yaml` comes first alphabetically, some resources were trying to be created before the namespace was ready. Running `kubectl apply -f k8s/` a second time fixed it — by then the namespace existed. It's a bit awkward, but it works.

---

## CODE-INFRA-002 — Pod Recovery Demo Script

### What I did

I wrote `scripts/k8s-kill-pod.sh`. It takes a service name as an argument, finds the running pod for that service using a label selector, deletes it, then watches for the new pod to come up and reports how long it took.

### Why a script and not just `kubectl delete pod`?

The whole point of this demo is to show the professor that Kubernetes self-heals. Just running `kubectl delete pod <name>` works, but you still have to manually watch and time the recovery. The script does all of that automatically — it records the timestamp when the pod is deleted, watches for the new pod, and prints the recovery time. It makes the demo look clean.

### What I learned

Because backend has 2 replicas, when I kill one pod, the other is already running. So the recovery time shows as 0 seconds. This is actually the correct behavior — the service never went down at all. It shows that horizontal scaling gives you real availability, not just theoretical availability.

---

## CODE-OBS-001 — Metrics Endpoint

### What I did

I added a `GET /metrics` endpoint to the backend. It queries the database and returns counts of deletion requests grouped by status, deletion steps grouped by status, total proof events, and the retry count.

I also added a `GET /metrics/prometheus` endpoint that returns the same data in Prometheus text format, using the `prom-client` library. Prometheus can scrape this endpoint directly.

### Why two endpoints?

The JSON endpoint (`/metrics`) is easy to read by humans and easy to call from the frontend. The Prometheus endpoint (`/metrics/prometheus`) is for the monitoring stack — Prometheus needs a specific text format, not JSON. Having both meant I didn't have to break anything that was already using `/metrics`.

### How the Prometheus metrics work

I created a `PrometheusService` that holds a fresh `prom-client` Registry (not the global default — using the global one caused conflicts with other potential metrics). When `/metrics/prometheus` is hit, the controller first calls `MetricsService.getMetrics()` to get the current DB data, then calls `PrometheusService.updateMetrics()` to push those values into the gauges, then returns the registry output.

Using `Gauge` instead of `Counter` is intentional here. A counter only goes up, but deletion request counts can change state (e.g., PENDING → COMPLETED), so gauges are the right type since they represent current state, not cumulative totals.

---

## CODE-INFRA-003 — Rate Limiting + Health Aggregation

### Part A: Rate Limiting

I added `@nestjs/throttler` to the backend with a global `APP_GUARD`. The config is 60 requests per minute per IP. At request 61, the client gets a 429 response.

**One gotcha:** The `/health` endpoint didn't trigger the rate limit during testing. This is because `/health` is registered on the Express adapter directly (it bypasses NestJS routing), so the NestJS guard never sees it. The rate limit works correctly on all NestJS-routed endpoints like `/users`, `/deletions`, `/metrics`.

### Part B: Health Aggregation

I added `GET /health/all` which pings each of the four microservices (`primary-data-service`, `cache-cleanup-service`, `proof-service`, `backup-service`) and returns whether each one is up or down.

**How it works:** Each microservice has a `/health` endpoint built in by NestJS. My `HealthAggregatorService` makes an HTTP GET request to each one with a 3-second timeout. If the request succeeds, the service is UP with a response time. If it fails (timeout or connection refused), it's DOWN.

**Why not cache in Redis?**  
The task spec mentioned caching in Redis with a 10-second TTL. I decided against this for a few reasons. First, Redis is already a dependency — if Redis is down, the cache layer itself breaks. Second, for a demo environment, fresh data on every call is more useful because it shows real-time status. Third, adding Redis caching adds complexity without much benefit at our scale. I'd add it for a production system with hundreds of clients hitting `/health/all` constantly.

---

## DOC-K8S-001 — Kubernetes Deployment Guide

The full guide is at `project-docs/kubernetes_deployment_guide.md`. It covers prerequisites, how to build images, how to apply the manifests, how to access services via port-forward, how to run the pod recovery demo, and common troubleshooting commands. I also included a table of common problems we hit during testing and how to fix them.

---

## Optional Task 1 — Helm Chart

### What I did

I converted the 14 `k8s/` YAML files into a Helm chart under `helm/erasegraph/`. The chart has a `values.yaml` where you can change image tags, replica counts, secrets, and infrastructure image versions without editing any of the actual template files.

### Why Helm?

With plain `kubectl apply -f k8s/`, if you want to deploy to a staging environment with different settings (fewer replicas, different image tag), you'd have to either edit the YAML files directly or maintain two separate copies. Helm solves this by letting you override values at install time:

```bash
# Production: 3 backend replicas, specific image version
helm install erasegraph ./helm/erasegraph --set replicaCount.backend=3 --set images.tag=v1.2.0

# Staging: 1 replica, latest image
helm install erasegraph-staging ./helm/erasegraph --set replicaCount.backend=1
```

You only maintain one set of templates.

### Structure

```
helm/erasegraph/
  Chart.yaml          # chart metadata
  values.yaml         # all default config
  templates/
    _helpers.tpl      # shared template helpers (labels, image names)
    namespace.yaml
    configmap.yaml
    secrets.yaml
    postgres.yaml
    redis.yaml
    rabbitmq.yaml
    jaeger.yaml
    backend.yaml
    primary-data-service.yaml
    cache-cleanup-service.yaml
    proof-service.yaml
    backup-service.yaml
    frontend.yaml
    ingress.yaml
```

### What I kept simple

I didn't add HorizontalPodAutoscaler or PodDisruptionBudget templates. Those would make sense in production, but for a course demo they'd add complexity without adding to the demonstration. The goal was to show that the chart deploys cleanly and that values override works — `helm lint` passes with 0 errors.

---

## Optional Task 2 — Prometheus + Grafana

### What I did

I added Prometheus and Grafana to `docker-compose.yml`. Prometheus is configured to scrape the backend's `/metrics/prometheus` endpoint every 15 seconds. Grafana is pre-provisioned with a Prometheus data source and an "EraseGraph — Deletion Metrics" dashboard that auto-loads on startup.

**Ports:**
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3006` (admin/admin)

### The Grafana dashboard

The dashboard has 9 panels:
- Four `stat` cards at the top: total requests, completed count, failed count, retry count
- One time series: request throughput (rate over 5 minutes)
- Four more time series: requests by status, steps by status, proof events total, retries over time

I used PromQL queries like `rate(erasegraph_deletion_requests_total[5m])` for throughput. This shows how quickly new requests are being submitted, which is more useful than just the raw counter.

### Why provisioning instead of manual setup?

Grafana supports "provisioning" — you drop YAML files in specific directories and Grafana loads them automatically on startup. Without this, every time you restart the container you'd have to re-add the data source and re-import the dashboard manually. Provisioning makes the setup reproducible — `docker compose up` and everything is ready.

The provisioning files are at:
- `infra/grafana/provisioning/datasources/prometheus.yml`
- `infra/grafana/provisioning/dashboards/dashboard.yml`
- `infra/grafana/dashboards/erasegraph.json`

### Why Gauge and not Counter for the Prometheus metrics?

Prometheus has different metric types. A Counter only goes up (like total HTTP requests served). A Gauge can go up or down (like current temperature or current queue size). Our metrics track current counts by status — the number of COMPLETED requests goes up while PENDING goes down. That's a gauge, not a counter.

---

## Summary

Here's a quick table of everything and where to find it:

| Task | Files |
|---|---|
| K8s manifests | `k8s/*.yaml` (14 files) |
| Pod recovery script | `scripts/k8s-kill-pod.sh` |
| Metrics endpoint | `backend/src/metrics/` (4 files) |
| Rate limiting | `backend/src/app.module.ts` |
| Health aggregation | `backend/src/health/` (3 files) |
| K8s deployment guide | `project-docs/kubernetes_deployment_guide.md` |
| Helm chart | `helm/erasegraph/` (17 files) |
| Prometheus config | `infra/prometheus/prometheus.yml` |
| Grafana config + dashboard | `infra/grafana/` (3 files) |
| docker-compose additions | Prometheus and Grafana services in `infra/docker-compose.yml` |
