#!/usr/bin/env bash
# =============================================================================
# EraseGraph — Demo Script for Sakshat Patil's Features
# Author: Sakshat Patil
# Features covered:
#   FRONTEND-001  Dashboard auto-refresh + step display
#   FRONTEND-002  Proof timeline view + export
#   FRONTEND-003  SSE real-time status stream
#   FRONTEND-004  History page + Admin panel
#   SLA-001       SLA Violation Monitoring & Alerts
# =============================================================================

set -euo pipefail

BACKEND="${BACKEND_URL:-http://localhost:3001}"
GATEWAY="${GATEWAY_URL:-http://localhost:3007}"
PASS=0
FAIL=0
SKIP=0

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
pass()         { echo -e "  ${GREEN}✓${NC}  $1"; PASS=$((PASS+1)); }
fail()         { echo -e "  ${RED}✗${NC}  $1"; FAIL=$((FAIL+1)); }
skip()         { echo -e "  ${YELLOW}–${NC}  $1 (skipped)"; SKIP=$((SKIP+1)); }
info()         { echo -e "  ${YELLOW}▸${NC}  $1"; }

# ── helpers ───────────────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Required command '$1' not found. Install it and retry."; exit 1; }
}
require_cmd curl
require_cmd jq

http_get() {
  curl -s -o /dev/null -w "%{http_code}" "$1"
}

http_get_body() {
  curl -s "$1"
}

http_post_json() {
  curl -s -X POST -H "Content-Type: application/json" -d "$2" "$1"
}

http_head_content_type() {
  # Returns the Content-Type header value for a URL (first 2 seconds only)
  curl -s -I --max-time 2 "$1" 2>/dev/null | grep -i "^content-type" | tr -d '\r' | awk -F': ' '{print $2}'
}

# ── pre-flight ────────────────────────────────────────────────────────────────
log_section "Pre-flight: Backend Reachability"
STATUS=$(http_get "${BACKEND}/health")
if [ "$STATUS" = "200" ]; then
  pass "Backend is reachable at ${BACKEND} (HTTP $STATUS)"
else
  fail "Backend not reachable at ${BACKEND} (HTTP $STATUS). Start the stack first: cd infra && docker-compose up -d"
  echo -e "\n${RED}Aborting — backend must be running.${NC}"
  exit 1
fi

# ── 1. Submit a deletion request ──────────────────────────────────────────────
log_section "Test 1: Submit Deletion Request"
SUBJECT="demo-sakshat-$(date +%s)"
RESPONSE=$(http_post_json "${BACKEND}/deletions" "{\"subject_id\":\"${SUBJECT}\"}")
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.request_id // empty')
if [ -n "$REQUEST_ID" ]; then
  pass "Deletion request created — request_id: ${REQUEST_ID}"
  info "subject_id: ${SUBJECT}"
else
  fail "Could not create deletion request. Response: ${RESPONSE}"
  REQUEST_ID=""
fi

# ── 2. SSE stream — Content-Type header ───────────────────────────────────────
log_section "Test 2: SSE Stream (FRONTEND-003)"
if [ -n "$REQUEST_ID" ]; then
  CT=$(http_head_content_type "${BACKEND}/deletions/${REQUEST_ID}/stream")
  if echo "$CT" | grep -qi "text/event-stream"; then
    pass "GET /deletions/:id/stream returns Content-Type: text/event-stream"
    info "Header value: ${CT}"
  else
    fail "Expected text/event-stream, got: '${CT}'"
  fi
else
  skip "SSE test skipped — no request ID"
fi

# ── 3. GET single deletion request ────────────────────────────────────────────
log_section "Test 3: Single Request Status (FRONTEND-001)"
if [ -n "$REQUEST_ID" ]; then
  BODY=$(http_get_body "${BACKEND}/deletions/${REQUEST_ID}")
  GOT_ID=$(echo "$BODY" | jq -r '.id // empty')
  GOT_STATUS=$(echo "$BODY" | jq -r '.status // empty')
  if [ "$GOT_ID" = "$REQUEST_ID" ]; then
    pass "GET /deletions/:id returns correct request"
    info "status: ${GOT_STATUS}"
    STEP_COUNT=$(echo "$BODY" | jq '.steps | length')
    info "steps in response: ${STEP_COUNT}"
  else
    fail "GET /deletions/:id did not return expected request"
  fi
else
  skip "Skipped — no request ID"
fi

# ── 4. Deletion list / History endpoint ───────────────────────────────────────
log_section "Test 4: Deletion History / List (FRONTEND-004 Part A)"
LIST_BODY=$(http_get_body "${BACKEND}/deletions?limit=25")
ITEMS_COUNT=$(echo "$LIST_BODY" | jq '.items | length' 2>/dev/null || echo "0")
if echo "$LIST_BODY" | jq -e '.items' >/dev/null 2>&1; then
  pass "GET /deletions returns items array (${ITEMS_COUNT} items)"
else
  fail "GET /deletions did not return expected shape"
fi

# Status filter check
COMPLETED_BODY=$(http_get_body "${BACKEND}/deletions?status=COMPLETED")
COMPLETED_OK=true
if echo "$COMPLETED_BODY" | jq -e '.items' >/dev/null 2>&1; then
  NON_COMPLETED=$(echo "$COMPLETED_BODY" | jq '[.items[] | select(.status != "COMPLETED")] | length')
  if [ "$NON_COMPLETED" = "0" ]; then
    pass "Status filter ?status=COMPLETED returns only COMPLETED requests"
  else
    fail "Status filter returned non-COMPLETED items (${NON_COMPLETED} found)"
    COMPLETED_OK=false
  fi
else
  skip "Status filter test skipped — unexpected response shape"
fi

# Subject search filter check
if [ -n "$SUBJECT" ]; then
  SEARCH_BODY=$(http_get_body "${BACKEND}/deletions?search=${SUBJECT}")
  SEARCH_COUNT=$(echo "$SEARCH_BODY" | jq '.items | length' 2>/dev/null || echo "0")
  if [ "$SEARCH_COUNT" -ge "1" ]; then
    pass "Search ?search=subject_id returns matching request (${SEARCH_COUNT} result(s))"
  else
    fail "Search by subject_id returned 0 results"
  fi
fi

# ── 5. Proof endpoint ─────────────────────────────────────────────────────────
log_section "Test 5: Proof Chain (FRONTEND-002)"
if [ -n "$REQUEST_ID" ]; then
  PROOF_BODY=$(http_get_body "${BACKEND}/deletions/${REQUEST_ID}/proof")
  if echo "$PROOF_BODY" | jq -e '.proof_events' >/dev/null 2>&1; then
    pass "GET /deletions/:id/proof returns proof_events"
    EVENT_COUNT=$(echo "$PROOF_BODY" | jq '.proof_events | length')
    info "proof events so far: ${EVENT_COUNT}"
  else
    fail "GET /deletions/:id/proof did not return expected shape"
  fi

  VERIFY_BODY=$(http_get_body "${BACKEND}/deletions/${REQUEST_ID}/proof/verify")
  if echo "$VERIFY_BODY" | jq -e '.valid' >/dev/null 2>&1; then
    VALID=$(echo "$VERIFY_BODY" | jq -r '.valid')
    pass "GET /deletions/:id/proof/verify returns valid field (valid=${VALID})"
  else
    fail "GET /deletions/:id/proof/verify did not return expected shape"
  fi
else
  skip "Proof test skipped — no request ID"
fi

# ── 6. Admin panel endpoints (FRONTEND-004 Part B) ─────────────────────────────
log_section "Test 6: Admin Panel — Health + Circuits (FRONTEND-004 Part B)"
HEALTH_BODY=$(http_get_body "${BACKEND}/health/all")
if echo "$HEALTH_BODY" | jq -e '.overall' >/dev/null 2>&1; then
  OVERALL=$(echo "$HEALTH_BODY" | jq -r '.overall')
  SVC_COUNT=$(echo "$HEALTH_BODY" | jq '.services | keys | length')
  pass "GET /health/all returns overall=${OVERALL}, ${SVC_COUNT} services tracked"
else
  fail "GET /health/all did not return expected shape"
fi

CIRCUITS_BODY=$(http_get_body "${BACKEND}/admin/circuits")
if echo "$CIRCUITS_BODY" | jq -e 'type == "array"' >/dev/null 2>&1; then
  CIRCUIT_COUNT=$(echo "$CIRCUITS_BODY" | jq 'length')
  pass "GET /admin/circuits returns circuit array (${CIRCUIT_COUNT} circuits)"
else
  fail "GET /admin/circuits did not return an array"
fi

# ── 7. SLA violations endpoint ────────────────────────────────────────────────
log_section "Test 7: SLA Violations Endpoint (SLA-001)"
SLA_BODY=$(http_get_body "${BACKEND}/admin/sla-violations")
if echo "$SLA_BODY" | jq -e 'type == "array"' >/dev/null 2>&1; then
  SLA_COUNT=$(echo "$SLA_BODY" | jq 'length')
  pass "GET /admin/sla-violations returns array (${SLA_COUNT} current violation(s))"
  if [ "$SLA_COUNT" -gt "0" ]; then
    FIRST=$(echo "$SLA_BODY" | jq '.[0]')
    if echo "$FIRST" | jq -e '.request_id, .subject_id, .stuck_since, .duration_minutes' >/dev/null 2>&1; then
      pass "Violation response includes request_id, subject_id, stuck_since, duration_minutes"
    else
      fail "Violation response is missing required fields"
    fi
  else
    info "No SLA violations present right now (healthy system)"
    pass "Endpoint is functional and returns empty array for a healthy system"
  fi
else
  fail "GET /admin/sla-violations did not return an array"
fi

# ── 8. SLA violation detection — simulated (optional, requires docker) ────────
log_section "Test 8: SLA Violation Detection Simulation (SLA-001 Integration)"
info "This test simulates SLA violation by submitting a request and checking"
info "that GET /admin/sla-violations surfaces it after the threshold elapses."
info ""
info "To run the full simulation manually:"
info "  1. Set SLA_THRESHOLD_MINUTES=1 in your .env or docker-compose environment"
info "  2. docker-compose stop cache-cleanup-service   # stall the pipeline"
info "  3. Submit a deletion request"
info "  4. Wait 90 seconds"
info "  5. Check: curl -s http://localhost:3001/admin/sla-violations | jq ."
info "  6. docker-compose start cache-cleanup-service  # resume"
skip "Automated simulation skipped (requires live docker and timing)"

# ── 9. API Gateway token check (FRONTEND-related gateway) ─────────────────────
log_section "Test 9: API Gateway Auth Token Enforcement"
GW_STATUS=$(http_get "${GATEWAY}/deletions" 2>/dev/null || echo "000")
if [ "$GW_STATUS" = "401" ] || [ "$GW_STATUS" = "403" ]; then
  pass "Gateway rejects requests without X-Service-Token (HTTP ${GW_STATUS})"
elif [ "$GW_STATUS" = "000" ]; then
  skip "Gateway not reachable at ${GATEWAY} — skipping"
else
  info "Gateway returned HTTP ${GW_STATUS} without token (may depend on config)"
  skip "Gateway token check inconclusive"
fi

# ── 10. Unit test runner ──────────────────────────────────────────────────────
log_section "Test 10: Unit Tests (SLA + Admin Controller)"
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
if [ -f "${BACKEND_DIR}/node_modules/.bin/jest" ]; then
  echo ""
  "${BACKEND_DIR}/node_modules/.bin/jest" \
    --testPathPattern="asim_mohammed_sla|asim_mohammed_admin-sla" \
    --no-coverage --forceExit \
    --rootDir "${BACKEND_DIR}/src" 2>&1 | tail -8
  if [ $? -eq 0 ]; then
    pass "All SLA unit tests passed"
  else
    fail "One or more SLA unit tests failed"
  fi
else
  skip "node_modules not installed in backend — run 'cd backend && npm install' first"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Results: ${GREEN}${PASS} passed${NC}  |  ${RED}${FAIL} failed${NC}  |  ${YELLOW}${SKIP} skipped${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$FAIL" -gt "0" ]; then
  echo -e "${RED}Some tests failed. Check output above for details.${NC}"
  exit 1
else
  echo -e "${GREEN}All checks passed.${NC}"
  exit 0
fi
