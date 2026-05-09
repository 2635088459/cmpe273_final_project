# Kubernetes Deployment Guide

**Author:** Haoyuan Shan  
**Task:** DOC-K8S-001

---

## What this is

This guide explains how to deploy EraseGraph on Kubernetes. I put all the manifests in a `k8s/` folder — 14 YAML files total, one for each service plus shared config. Everything runs inside a namespace called `erasegraph` to keep it separate from other stuff on the cluster.

Here's what each file does:

| File | What it creates |
|---|---|
| `namespace.yaml` | The `erasegraph` namespace |
| `configmap.yaml` | Shared environment variables (hostnames, ports, etc.) |
| `secrets.yaml` | Passwords stored as K8s Secrets |
| `postgres.yaml` | Postgres database — includes a PVC for persistent storage |
| `redis.yaml` | Redis cache |
| `rabbitmq.yaml` | RabbitMQ with the management web UI |
| `jaeger.yaml` | Jaeger for distributed tracing |
| `backend.yaml` | The main NestJS API — runs **2 replicas** |
| `primary-data-service.yaml` | Consumes deletion events, cleans primary DB |
| `cache-cleanup-service.yaml` | Consumes deletion events, cleans Redis |
| `proof-service.yaml` | Records proof events to the database |
| `backup-service.yaml` | Cleans up backup records |
| `frontend.yaml` | React app served through nginx |
| `ingress.yaml` | Routes external traffic to frontend and backend |

---

## Before you start

You need one of these:
- **Docker Desktop** (Mac or Windows) with Kubernetes turned on in settings
- **Minikube** — run `minikube start` to spin up a local cluster

Also make sure `kubectl` is working:
```bash
kubectl cluster-info
```

If you want the Ingress to work (optional), you need the nginx ingress controller:
```bash
# Docker Desktop
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

# Minikube
minikube addons enable ingress
```

---

## Step 1 — Build the Docker images

All the manifests use `imagePullPolicy: IfNotPresent`, which means Kubernetes will only use images that already exist locally. So you need to build them before applying anything.

```bash
# Go into the infra folder where docker-compose.yml lives
cd infra/

# Build everything at once
docker compose build

# Or build one at a time if you only changed one service
docker compose build backend
docker compose build frontend
```

After building, double-check they're there:
```bash
docker images | grep infra
```

You should see something like:
```
infra-backend                  latest    ...
infra-frontend                 latest    ...
infra-primary-data-service     latest    ...
infra-cache-cleanup-service    latest    ...
infra-proof-service            latest    ...
infra-backup-service           latest    ...
```

> **If you're using Minikube:** Run `eval $(minikube docker-env)` before building. Otherwise the images get built into your local Docker daemon, not Minikube's, and the pods won't find them.

---

## Step 2 — Deploy everything

The safest way is to apply in order — infrastructure first, then apps:

```bash
# Create the namespace first, everything else goes inside it
kubectl apply -f k8s/namespace.yaml

# Config and secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# Infrastructure (postgres, redis, rabbitmq, jaeger)
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/rabbitmq.yaml
kubectl apply -f k8s/jaeger.yaml

# Wait a minute for postgres and rabbitmq to finish starting up, then:
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/primary-data-service.yaml
kubectl apply -f k8s/cache-cleanup-service.yaml
kubectl apply -f k8s/proof-service.yaml
kubectl apply -f k8s/backup-service.yaml
kubectl apply -f k8s/frontend.yaml

# Ingress last (only needed if you set up the ingress controller)
kubectl apply -f k8s/ingress.yaml
```

You can also just do `kubectl apply -f k8s/` to apply everything at once. The first time I ran it some resources errored because the namespace wasn't ready yet — running it a second time fixed it.

---

## Step 3 — Check that everything started

```bash
# Watch pods come up live
kubectl get pods -n erasegraph -w

# Or just check the current state
kubectl get pods -n erasegraph
```

When it's all working you should see 11 pods, all `Running`:

```
NAME                                  READY   STATUS    RESTARTS   AGE
backend-xxxx                          1/1     Running   0          2m
backend-yyyy                          1/1     Running   0          2m    ← 2 replicas
postgres-xxxx                         1/1     Running   0          3m
redis-xxxx                            1/1     Running   0          3m
rabbitmq-xxxx                         1/1     Running   0          3m
jaeger-xxxx                           1/1     Running   0          3m
primary-data-service-xxxx             1/1     Running   0          2m
cache-cleanup-service-xxxx            1/1     Running   0          2m
proof-service-xxxx                    1/1     Running   0          2m
backup-service-xxxx                   1/1     Running   0          2m
frontend-xxxx                         1/1     Running   0          2m
```

The two backend pods are intentional — I set `replicas: 2` so there's always a backup if one goes down.

---

## Step 4 — Access the services

The easiest way is `kubectl port-forward`. Run each of these in a separate terminal (or background them with `&`):

```bash
# Backend API
kubectl port-forward -n erasegraph svc/backend 3001:3001

# Frontend
kubectl port-forward -n erasegraph svc/frontend 3000:80

# RabbitMQ management UI
kubectl port-forward -n erasegraph svc/rabbitmq 15672:15672

# Jaeger tracing UI
kubectl port-forward -n erasegraph svc/jaeger 16686:16686

# Postgres (if you want to connect with psql or pgAdmin)
kubectl port-forward -n erasegraph svc/postgres 5434:5432
```

Then open these in the browser:

| What | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Swagger / API docs | http://localhost:3001/api/docs |
| Metrics | http://localhost:3001/metrics |
| Health check (all services) | http://localhost:3001/health/all |
| RabbitMQ UI | http://localhost:15672 |
| Jaeger UI | http://localhost:16686 |

---

## Step 5 — Ingress (optional)

If you installed the nginx ingress controller and want to access the app through a hostname instead of port-forward:

```bash
# Add this to your /etc/hosts file
echo "127.0.0.1 erasegraph.local" | sudo tee -a /etc/hosts

# For Minikube use its IP instead of 127.0.0.1
echo "$(minikube ip) erasegraph.local" | sudo tee -a /etc/hosts
```

Then you can go to:
- http://erasegraph.local — the frontend
- http://erasegraph.local/api — the backend

---

## Pod Recovery Demo

This is the main demo for showing that Kubernetes can recover from pod failures automatically. I wrote a script that kills a pod and times how long it takes to come back.

### How to run it

```bash
chmod +x scripts/k8s-kill-pod.sh

# Kill one of the backend pods
./scripts/k8s-kill-pod.sh backend

# You can also test other services
./scripts/k8s-kill-pod.sh primary-data-service
./scripts/k8s-kill-pod.sh proof-service
```

### What you'll see

```
======================================================
 Pod Recovery Demo — service: backend
 Namespace: erasegraph
======================================================

Target pod:   backend-7d4f9b8c6-xk2lp
Deleting pod at: 14:32:10
pod "backend-7d4f9b8c6-xk2lp" deleted

Waiting for Kubernetes to schedule a replacement pod...
  ...waiting for new pod (4s elapsed)
  ...waiting for new pod (6s elapsed)
  ...waiting for new pod (8s elapsed)

======================================================
 Recovery complete!
 New pod:      backend-7d4f9b8c6-m9pqr
 Recovery time: 12s
 Recovered at:  14:32:22
======================================================
```

Because backend runs 2 replicas, when you kill one pod the other is still running the whole time. So the recovery time for the service itself is actually 0 seconds — users never notice anything. The script reports 12s because that's how long it took K8s to spin up a replacement pod, but the service stayed up the whole time.

### Running in a different namespace

```bash
NAMESPACE=my-namespace ./scripts/k8s-kill-pod.sh backend
```

---

## Useful kubectl commands

A few commands I kept coming back to while testing:

```bash
# See everything in the namespace
kubectl get all -n erasegraph

# Check logs for a service
kubectl logs -n erasegraph -l app=backend --tail=50

# Follow logs live
kubectl logs -n erasegraph -l app=backend -f

# Get more detail on a deployment (good for debugging why pods won't start)
kubectl describe deployment -n erasegraph backend

# Scale up or down
kubectl scale deployment -n erasegraph backend --replicas=3

# Open a shell inside a running pod
kubectl exec -it -n erasegraph $(kubectl get pod -n erasegraph -l app=backend -o name | head -1) -- sh

# See events (super useful when something's broken at startup)
kubectl get events -n erasegraph --sort-by='.lastTimestamp'
```

---

## Tearing it down

```bash
# Delete everything but keep the PVC (postgres data survives)
kubectl delete -f k8s/

# Nuke everything including the namespace and all storage
kubectl delete namespace erasegraph
```

---

## Things that went wrong and how to fix them

| Error | Why it happens | Fix |
|---|---|---|
| `ImagePullBackOff` | K8s can't find the image locally | Run `docker compose build` again. For Minikube, run `eval $(minikube docker-env)` first |
| `CrashLoopBackOff` on backend | Postgres or RabbitMQ isn't ready yet | Wait a bit and the pod will retry. Check infra pods first with `kubectl get pods -n erasegraph` |
| Pod stuck in `Pending` | Not enough CPU/memory on the node | Run `kubectl describe pod <name> -n erasegraph` to see the specific error |
| `Connection refused` on port-forward | The service name or port is wrong | Run `kubectl get svc -n erasegraph` to double check |
| RabbitMQ takes forever to start | It just does, it's slow | Wait up to 2 minutes. The other services have retry logic built in |
| Ingress gives 404 | The nginx ingress controller isn't installed | Follow the ingress controller install in the Prerequisites section |
| Backend logs show `ECONNREFUSED` | A microservice pod isn't up yet | Check pod status — they'll reconnect automatically once the pod is running |
