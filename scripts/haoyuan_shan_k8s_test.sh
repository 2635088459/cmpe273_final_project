#!/usr/bin/env bash
# =============================================================================
# haoyuan_shan_k8s_test.sh
#
# Integration test script for Haoyuan Shan's Kubernetes features:
#   CODE-INFRA-001 — K8s manifests are valid and all pods are Running
#   CODE-INFRA-002 — Pod recovery (kill a pod, watch K8s restart it)
#   CODE-OBS-001   — GET /metrics and GET /metrics/prometheus endpoints
#   CODE-INFRA-003 — GET /health/all + rate limiting (429 on excess requests)
#
# Usage:
#   chmod +x scripts/haoyuan_shan_k8s_test.sh
#   ./scripts/haoyuan_shan_k8s_test.sh
#
# Requirements: kubectl configured, cluster running (Docker Desktop K8s is fine)
# =============================================================================

set -euo pipefail

NAMESPACE="erasegraph"
BACKEND_LOCAL_PORT=13001   # port-forward local port (avoids conflicts)
PASS_COUNT=0
FAIL_COUNT=0

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "  ${GREEN}✓ PASS${RESET}  $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "  ${RED}✗ FAIL${RESET}  $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
section() { echo -e "\n${BOLD}${YELLOW}━━━  $1  ━━━${RESET}"; }

# ── Port-forward lifecycle ────────────────────────────────────────────────────
PF_PID=""

start_port_forward() {
  kubectl port-forward svc/backend ${BACKEND_LOCAL_PORT}:3001 \
    -n "${NAMESPACE}" &>/tmp/haoyuan_pf.log &
  PF_PID=$!
  sleep 3   # give kubectl time to establish the tunnel
}

stop_port_forward() {
  if [[ -n "${PF_PID}" ]]; then
    kill "${PF_PID}" 2>/dev/null || true
    PF_PID=""
  fi
}

trap stop_port_forward EXIT

BACKEND="http://localhost:${BACKEND_LOCAL_PORT}"

# =============================================================================
# TEST AREA 1 — CODE-INFRA-001: Manifest validation + pod health
# =============================================================================
section "CODE-INFRA-001 — K8s Manifests"

# 1-A  All 14+ manifest files parse without errors (dry-run)
echo "  Checking kubectl apply --dry-run=client on k8s/ …"
if kubectl apply --dry-run=client -f k8s/ &>/tmp/dryrun.log 2>&1; then
  RESOURCE_COUNT=$(grep -c "dry run" /tmp/dryrun.log || true)
  pass "All manifests valid — ${RESOURCE_COUNT} resources parsed (dry-run)"
else
  fail "kubectl dry-run failed — check /tmp/dryrun.log"
fi

# 1-B  Namespace exists
if kubectl get namespace "${NAMESPACE}" &>/dev/null; then
  pass "Namespace '${NAMESPACE}' exists"
else
  fail "Namespace '${NAMESPACE}' not found"
fi

# 1-C  All expected pods are Running
echo "  Checking pod status …"
EXPECTED_APPS=(backend frontend api-gateway primary-data-service cache-cleanup-service proof-service backup-service postgres redis rabbitmq jaeger)
for APP in "${EXPECTED_APPS[@]}"; do
  POD_STATUS=$(kubectl get pods -n "${NAMESPACE}" -l app="${APP}" \
    --no-headers 2>/dev/null | awk '{print $3}' | head -1)
  if [[ "${POD_STATUS}" == "Running" ]]; then
    pass "Pod app=${APP} is Running"
  else
    fail "Pod app=${APP} status='${POD_STATUS:-NOT FOUND}'"
  fi
done

# 1-D  Backend has 2 replicas (horizontal scaling demo)
BACKEND_REPLICAS=$(kubectl get deployment backend -n "${NAMESPACE}" \
  -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
if [[ "${BACKEND_REPLICAS}" -ge 2 ]]; then
  pass "Backend has ${BACKEND_REPLICAS} replicas (≥2 for HA demo)"
else
  fail "Backend replicas=${BACKEND_REPLICAS}, expected ≥2"
fi

# =============================================================================
# Start port-forward for remaining tests that hit the backend HTTP API
# =============================================================================
echo ""
echo "  Starting port-forward backend → localhost:${BACKEND_LOCAL_PORT} …"
start_port_forward

# =============================================================================
# TEST AREA 2 — CODE-OBS-001: /metrics and /metrics/prometheus
# =============================================================================
section "CODE-OBS-001 — Metrics Endpoint"

# 2-A  GET /metrics returns HTTP 200
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/metrics")
if [[ "${HTTP_STATUS}" == "200" ]]; then
  pass "GET /metrics returns HTTP 200"
else
  fail "GET /metrics returned HTTP ${HTTP_STATUS}"
fi

# 2-B  /metrics body contains expected JSON keys
METRICS_BODY=$(curl -s "${BACKEND}/metrics")
for KEY in deletion_requests deletion_steps proof_events collected_at; do
  if echo "${METRICS_BODY}" | grep -q "${KEY}"; then
    pass "/metrics body contains '${KEY}'"
  else
    fail "/metrics body missing '${KEY}'"
  fi
done

# 2-C  GET /metrics/prometheus returns HTTP 200
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/metrics/prometheus")
if [[ "${HTTP_STATUS}" == "200" ]]; then
  pass "GET /metrics/prometheus returns HTTP 200"
else
  fail "GET /metrics/prometheus returned HTTP ${HTTP_STATUS}"
fi

# 2-D  /metrics/prometheus body is Prometheus text format
PROM_BODY=$(curl -s "${BACKEND}/metrics/prometheus")
for METRIC in erasegraph_deletion_requests_total erasegraph_proof_events_total erasegraph_proof_retries_total; do
  if echo "${PROM_BODY}" | grep -q "${METRIC}"; then
    pass "/metrics/prometheus contains '${METRIC}'"
  else
    fail "/metrics/prometheus missing '${METRIC}'"
  fi
done

# =============================================================================
# TEST AREA 3 — CODE-INFRA-003 Part B: GET /health/all
# =============================================================================
section "CODE-INFRA-003 — Health Aggregation (GET /health/all)"

# 3-A  Returns HTTP 200
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/health/all")
if [[ "${HTTP_STATUS}" == "200" ]]; then
  pass "GET /health/all returns HTTP 200"
else
  fail "GET /health/all returned HTTP ${HTTP_STATUS}"
fi

# 3-B  Body contains overall field
HEALTH_BODY=$(curl -s "${BACKEND}/health/all")
if echo "${HEALTH_BODY}" | grep -q '"overall"'; then
  pass "/health/all body contains 'overall' field"
else
  fail "/health/all body missing 'overall' field"
fi

# 3-C  Overall status is UP
if echo "${HEALTH_BODY}" | grep -q '"overall":"UP"'; then
  pass "/health/all reports overall:UP"
else
  fail "/health/all does not report overall:UP — body: ${HEALTH_BODY}"
fi

# 3-D  All four downstream services appear in the response
for SVC in primary-data-service cache-cleanup-service proof-service backup-service; do
  if echo "${HEALTH_BODY}" | grep -q "\"${SVC}\""; then
    pass "/health/all includes service '${SVC}'"
  else
    fail "/health/all missing service '${SVC}'"
  fi
done

# =============================================================================
# TEST AREA 4 — CODE-INFRA-003 Part A: Rate Limiting (429)
# =============================================================================
section "CODE-INFRA-003 — Rate Limiting"

# 4-A  First request to /users succeeds (not rate limited yet)
FIRST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/users")
if [[ "${FIRST_STATUS}" != "429" ]]; then
  pass "First request to /users is not rate-limited (HTTP ${FIRST_STATUS})"
else
  fail "First request was already rate-limited — ThrottlerGuard may be misconfigured"
fi

# 4-B  Sending 65 rapid requests eventually triggers 429
echo "  Sending 65 rapid requests to /users to trigger rate limit …"
GOT_429=false
for i in $(seq 1 65); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/users")
  if [[ "${STATUS}" == "429" ]]; then
    GOT_429=true
    break
  fi
done

if [[ "${GOT_429}" == "true" ]]; then
  pass "Rate limiter returned 429 after burst of requests"
else
  fail "No 429 received after 65 requests — rate limiter may not be active"
fi

# =============================================================================
# TEST AREA 5 — CODE-INFRA-002: Pod Recovery
# =============================================================================
section "CODE-INFRA-002 — Pod Recovery Demo"

# Stop port-forward before killing a pod (avoid confusion)
stop_port_forward

# 5-A  Kill one backend pod and measure recovery time
TARGET_POD=$(kubectl get pods -n "${NAMESPACE}" -l app=backend \
  --no-headers | head -1 | awk '{print $1}')

if [[ -z "${TARGET_POD}" ]]; then
  fail "Could not find a backend pod to kill"
else
  echo "  Killing pod: ${TARGET_POD} …"
  kubectl delete pod "${TARGET_POD}" -n "${NAMESPACE}" --grace-period=0 &>/dev/null

  # Wait up to 90s for a new Running pod
  START_TS=$(date +%s)
  RECOVERED=false
  for i in $(seq 1 30); do
    sleep 3
    NEW_POD=$(kubectl get pods -n "${NAMESPACE}" -l app=backend \
      --no-headers 2>/dev/null | grep "Running" | grep -v "${TARGET_POD}" | head -1 | awk '{print $1}')
    if [[ -n "${NEW_POD}" ]]; then
      END_TS=$(date +%s)
      RECOVERY_TIME=$((END_TS - START_TS))
      pass "Pod recovered in ${RECOVERY_TIME}s — new pod: ${NEW_POD}"
      RECOVERED=true
      break
    fi
  done

  if [[ "${RECOVERED}" == "false" ]]; then
    fail "Pod did not recover within 90 seconds"
  fi
fi

# 5-B  After recovery, backend is still reachable
echo "  Restarting port-forward after pod recovery …"
start_port_forward

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/health")
if [[ "${HTTP_STATUS}" == "200" ]]; then
  pass "Backend responds with HTTP 200 after pod recovery"
else
  fail "Backend health check failed after pod recovery (HTTP ${HTTP_STATUS})"
fi

# =============================================================================
# Summary
# =============================================================================
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Results: ${GREEN}${PASS_COUNT} passed${RESET}  /  ${RED}${FAIL_COUNT} failed${RESET}  /  ${TOTAL} total${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi
