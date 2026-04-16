#!/bin/bash
# ============================================================
# EraseGraph Backend Integration Test Suite
# ============================================================
# Tests BACKEND-001 and BACKEND-002 functionality
# Usage: cd backend && chmod +x test-backend-integration.sh && ./test-backend-integration.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_URL="http://localhost:3001"
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

# ============================================================
# 1. INFRASTRUCTURE CHECKS
# ============================================================
print_header "INFRASTRUCTURE CHECKS"

print_test "Checking if backend is running"
if curl -f "$BACKEND_URL/health" >/dev/null 2>&1; then
    print_success "Backend is accessible at $BACKEND_URL"
else
    print_error "Backend is not accessible. Please start with: cd ../infra && docker-compose up -d"
    exit 1
fi

print_test "Checking API documentation"
if curl -f "$BACKEND_URL/api/docs" >/dev/null 2>&1; then
    print_success "Swagger documentation is available"
else
    print_error "Swagger documentation not accessible"
fi

# ============================================================
# 2. BACKEND-001 API TESTS
# ============================================================
print_header "BACKEND-001: Deletion Request Service API"

# Test 1: Create deletion request
print_test "Creating deletion request"
RESPONSE=$(curl -s -X POST "$BACKEND_URL/deletions" \
    -H "Content-Type: application/json" \
    -d '{"subject_id": "integration_test_user"}' \
    -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
RESPONSE_BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ "$HTTP_STATUS" -eq 202 ]; then
    print_success "Deletion request created (HTTP 202)"
    
    # Extract request_id for further tests
    REQUEST_ID=$(echo "$RESPONSE_BODY" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$REQUEST_ID" ]; then
        print_info "Request ID: $REQUEST_ID"
    else
        print_error "Could not extract request_id from response"
    fi
else
    print_error "Failed to create deletion request (HTTP $HTTP_STATUS)"
    echo "Response: $RESPONSE_BODY"
fi

# Test 2: Get deletion request status
if [ -n "$REQUEST_ID" ]; then
    print_test "Getting deletion request status"
    RESPONSE=$(curl -s -X GET "$BACKEND_URL/deletions/$REQUEST_ID" \
        -w "HTTPSTATUS:%{http_code}")

    HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    RESPONSE_BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

    if [ "$HTTP_STATUS" -eq 200 ]; then
        print_success "Retrieved deletion request status (HTTP 200)"
        
        # Check if response contains expected fields
        if echo "$RESPONSE_BODY" | grep -q '"status"' && echo "$RESPONSE_BODY" | grep -q '"steps"'; then
            print_success "Response contains expected fields (status, steps)"
        else
            print_error "Response missing expected fields"
        fi
    else
        print_error "Failed to get deletion request status (HTTP $HTTP_STATUS)"
    fi
fi

# Test 3: Get deletion proof
if [ -n "$REQUEST_ID" ]; then
    print_test "Getting deletion proof"
    RESPONSE=$(curl -s -X GET "$BACKEND_URL/deletions/$REQUEST_ID/proof" \
        -w "HTTPSTATUS:%{http_code}")

    HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    RESPONSE_BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

    if [ "$HTTP_STATUS" -eq 200 ]; then
        print_success "Retrieved deletion proof (HTTP 200)"
        
        # Check if response contains proof events
        if echo "$RESPONSE_BODY" | grep -q '"proof_events"' && echo "$RESPONSE_BODY" | grep -q '"verification_summary"'; then
            print_success "Proof response contains expected fields"
        else
            print_error "Proof response missing expected fields"
        fi
    else
        print_error "Failed to get deletion proof (HTTP $HTTP_STATUS)"
    fi
fi

# Test 4: Invalid requests
print_test "Testing invalid deletion request"
RESPONSE=$(curl -s -X POST "$BACKEND_URL/deletions" \
    -H "Content-Type: application/json" \
    -d '{"invalid_field": "test"}' \
    -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [ "$HTTP_STATUS" -eq 400 ]; then
    print_success "Properly rejected invalid request (HTTP 400)"
else
    print_error "Did not properly reject invalid request (HTTP $HTTP_STATUS)"
fi

# ============================================================
# 3. BACKEND-002 RABBITMQ INTEGRATION TESTS
# ============================================================
print_header "BACKEND-002: RabbitMQ Event Integration"

# Check if we can inspect RabbitMQ messages
print_test "Checking RabbitMQ message publishing"

# Get message count from RabbitMQ Management API
RABBITMQ_MGMT="http://localhost:15672"
RABBITMQ_USER="erasegraph"
RABBITMQ_PASS="erasegraph_secret"

# Check if RabbitMQ management is accessible
if curl -f "$RABBITMQ_MGMT" >/dev/null 2>&1; then
    print_success "RabbitMQ Management UI accessible"
    
    # Check message counts in queues
    QUEUE_INFO=$(curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
        "$RABBITMQ_MGMT/api/queues/%2F/erasegraph.deletion-requests.primary-data" 2>/dev/null)
    
    if echo "$QUEUE_INFO" | grep -q '"messages"'; then
        MESSAGE_COUNT=$(echo "$QUEUE_INFO" | grep -o '"messages":[0-9]*' | cut -d':' -f2)
        if [ "$MESSAGE_COUNT" -gt 0 ]; then
            print_success "Found $MESSAGE_COUNT message(s) in primary data queue"
        else
            print_info "No messages in primary data queue (this might be expected if services consume quickly)"
        fi
    else
        print_error "Could not check message count in RabbitMQ queue"
    fi
else
    print_error "RabbitMQ Management UI not accessible"
fi

# ============================================================
# 4. DATABASE INTEGRATION TESTS
# ============================================================
print_header "DATABASE INTEGRATION"

print_test "Checking database connectivity through API"

# Create another deletion request to test database persistence
RESPONSE=$(curl -s -X POST "$BACKEND_URL/deletions" \
    -H "Content-Type: application/json" \
    -d '{"subject_id": "db_test_user"}' \
    -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [ "$HTTP_STATUS" -eq 202 ]; then
    print_success "Database integration working (request persisted)"
    
    # Extract the new request ID
    NEW_REQUEST_ID=$(echo "$RESPONSE" | sed -e 's/HTTPSTATUS:.*//g' | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)
    
    # Try to retrieve it immediately to test persistence
    sleep 1
    RETRIEVE_RESPONSE=$(curl -s -X GET "$BACKEND_URL/deletions/$NEW_REQUEST_ID" -w "HTTPSTATUS:%{http_code}")
    RETRIEVE_STATUS=$(echo $RETRIEVE_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$RETRIEVE_STATUS" -eq 200 ]; then
        print_success "Database persistence verified (data retrieved)"
    else
        print_error "Database persistence issue (could not retrieve data)"
    fi
else
    print_error "Database integration issue (could not persist request)"
fi

# ============================================================
# 5. OPENTELEMETRY TRACING TESTS
# ============================================================
print_header "OPENTELEMETRY TRACING"

print_test "Checking Jaeger traces"
JAEGER_URL="http://localhost:16686"

if curl -f "$JAEGER_URL" >/dev/null 2>&1; then
    print_success "Jaeger UI accessible"
    
    # Check if traces are being collected (search for our service)
    TRACE_SEARCH=$(curl -s "$JAEGER_URL/api/services" 2>/dev/null)
    
    if echo "$TRACE_SEARCH" | grep -q "erasegraph-backend"; then
        print_success "Backend service traces found in Jaeger"
    else
        print_info "Backend traces not yet visible in Jaeger (may take time to appear)"
    fi
else
    print_error "Jaeger UI not accessible"
fi

# ============================================================
# 6. FINAL REPORT
# ============================================================
print_header "TEST SUMMARY"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo -e "📊 ${BLUE}Integration Test Results:${NC}"
echo -e "   Total Tests: $TOTAL_TESTS"
echo -e "   ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "   ${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}ALL INTEGRATION TESTS PASSED!${NC}"
    echo -e "✅ BACKEND-001 (Deletion Request Service) is working correctly"
    echo -e "✅ BACKEND-002 (Event Publishing & RabbitMQ) is working correctly"
    echo -e ""
    echo -e "${BLUE}Service Endpoints:${NC}"
    echo -e "   • API: http://localhost:3001/deletions"
    echo -e "   • Docs: http://localhost:3001/api/docs"
    echo -e "   • Health: http://localhost:3001/health"
    echo -e "   • Jaeger: http://localhost:16686"
    echo -e "   • RabbitMQ: http://localhost:15672"
    exit 0
else
    echo -e "\n⚠️  ${YELLOW}SOME TESTS FAILED${NC}"
    echo -e "❌ Please review the failed tests above"
    echo -e "💡 Check service logs: docker-compose logs backend"
    exit 1
fi