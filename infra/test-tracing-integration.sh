#!/bin/bash
# ============================================================
# EraseGraph Tracing Integration Test
# ============================================================
# Tests TEST-002: OpenTelemetry tracing across backend services
# Usage:
#   cd infra
#   chmod +x test-tracing-integration.sh
#   ./test-tracing-integration.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_URL="http://localhost:3001"
JAEGER_URL="http://localhost:16686"
TESTS_PASSED=0
TESTS_FAILED=0

print_header() {
  echo -e "\n${BLUE}=================================${NC}"
  echo -e "${BLUE} $1 ${NC}"
  echo -e "${BLUE}=================================${NC}\n"
}

print_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
}

print_success() {
  echo -e "${GREEN}✅ PASS:${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_error() {
  echo -e "${RED}❌ FAIL:${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_info() {
  echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}Missing required command:${NC} $1"
    exit 1
  fi
}

check_trace_for_service() {
  local service_name="$1"
  local traces

  traces=$(curl -s "${JAEGER_URL}/api/traces?service=${service_name}&limit=5&lookback=1h")

  if echo "$traces" | grep -q "\"traceID\""; then
    print_success "Recent traces found for ${service_name}"
  else
    print_error "No recent traces found for ${service_name}"
  fi
}

require_command curl

print_header "TRACING INFRASTRUCTURE CHECKS"

print_test "Checking backend health"
if curl -fsS "${BACKEND_URL}/health" >/dev/null 2>&1; then
  print_success "Backend is reachable"
else
  print_error "Backend is not reachable at ${BACKEND_URL}"
  exit 1
fi

print_test "Checking Jaeger health"
if curl -fsS "${JAEGER_URL}" >/dev/null 2>&1; then
  print_success "Jaeger UI is reachable"
else
  print_error "Jaeger UI is not reachable at ${JAEGER_URL}"
  exit 1
fi

print_header "CREATE TRACEABLE REQUEST"

print_test "Creating deletion request to generate traces"
RESPONSE=$(curl -s -X POST "${BACKEND_URL}/deletions" \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"tracing_test_user"}')

REQUEST_ID=$(echo "$RESPONSE" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$REQUEST_ID" ]; then
  print_success "Deletion request created"
  print_info "Request ID: ${REQUEST_ID}"
else
  print_error "Could not extract request_id from backend response"
  echo "$RESPONSE"
  exit 1
fi

print_info "Waiting 10 seconds for async processing and trace export..."
sleep 10

print_header "JAEGER SERVICE DISCOVERY"

print_test "Checking service list in Jaeger"
SERVICES_RESPONSE=$(curl -s "${JAEGER_URL}/api/services")

for service in \
  "erasegraph-backend" \
  "erasegraph-primary-data-service" \
  "erasegraph-cache-cleanup-service" \
  "erasegraph-proof-service"
do
  if echo "$SERVICES_RESPONSE" | grep -q "$service"; then
    print_success "Jaeger lists ${service}"
  else
    print_error "Jaeger does not list ${service}"
  fi
done

print_header "TRACE VERIFICATION"

check_trace_for_service "erasegraph-backend"
check_trace_for_service "erasegraph-primary-data-service"
check_trace_for_service "erasegraph-cache-cleanup-service"
check_trace_for_service "erasegraph-proof-service"

print_header "TEST SUMMARY"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo -e "📊 ${BLUE}Tracing Test Results:${NC}"
echo -e "   Total Tests: $TOTAL_TESTS"
echo -e "   ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "   ${RED}Failed: $TESTS_FAILED${NC}"

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "\n${GREEN}TEST-002 tracing verification passed.${NC}"
else
  echo -e "\n${RED}TEST-002 tracing verification has failures.${NC}"
  exit 1
fi
