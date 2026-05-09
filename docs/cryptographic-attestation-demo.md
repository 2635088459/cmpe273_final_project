# Haoyuan Shan - Cryptographic Attestation Demo Guide

## Overview

ErasEGraph now supports signed deletion proof with Ed25519.
In the web UI, you can see both crypto proof and service evidence in real time.
This guide shows the full demo flow in a simple way.

## Demo Flow

### Step 1: Open the dashboard
Go to: http://34.56.39.214/

You should see:
- Left side: deletion request list, like alice and bob
- Right side: proof panel for the selected request

### Step 2: Select or create one deletion request
Click a completed request, for example alice.

Now the panel should show:
- Proof and audit trail
- Step summary
- Proof verified status
- Cryptographic Attestation card

### Step 3: Open Signature Details
Click View Signature Details.

You should see:
- Signed payload hash (SHA256)
- Signature (Base64)
- Public key for verification

### Step 4: Open Operational Evidence
Click View Operational Evidence.

You should see service status, like:
- COMPLETED Primary Data
- COMPLETED Cache Cleanup
- COMPLETED Search Cleanup
- COMPLETED Analytics Cleanup
- COMPLETED Backup

## Key Talking Points

### 1) Crypto proof
- The system signs each deletion proof with Ed25519.
- The public key is open, so anyone can verify the signature.
- This helps us show the report was not changed.

### 2) Operation proof
- It is not only hash chain.
- We also show that all cleanup services joined the deletion flow.
- Each service gives status for the same user.

### 3) Clear answer
- The system answers one direct question:
   Can we prove the user data was deleted across all systems?
- If all checks pass, the answer is yes.

### 4) Compliance value
- Users can export report files.
- Third parties can verify the signature.
- This gives better trust and audit support.

## Live Demo Script

Use this script for a live class or project demo.

```bash
#!/bin/bash

echo "ErasEGraph cryptographic attestation demo"
echo "========================================="

echo "Step 1: Restore demo data"
curl -s -X POST http://34.56.39.214/api/users/restore-demo > /dev/null
echo "Done"

echo ""
echo "Step 2: Create a deletion request for alice"
RESPONSE=$(curl -s -X POST http://34.56.39.214/api/deletions \
   -H "Content-Type: application/json" \
   -d '{"subject_id":"alice"}')
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.request_id')
echo "Request ID: $REQUEST_ID"

echo ""
echo "Step 3: Wait for completion"
for i in {1..40}; do
   STATUS=$(curl -s http://34.56.39.214/api/deletions/$REQUEST_ID | jq -r '.status')
   if [ "$STATUS" = "COMPLETED" ]; then
      echo "Deletion completed"
      break
   fi
   sleep 1
done

echo ""
echo "Step 4: Get attestation"
ATTESTATION=$(curl -s http://34.56.39.214/api/deletions/$REQUEST_ID/proof/attestation)

echo ""
echo "Report"
echo "Question: $(echo "$ATTESTATION" | jq -r '.answer.question')"
echo "Can prove deleted: $(echo "$ATTESTATION" | jq -r '.answer.can_prove_deleted_across_all_systems')"
echo "Reason: $(echo "$ATTESTATION" | jq -r '.answer.rationale' | head -c 120)..."

echo ""
echo "Signature info"
echo "Algorithm: $(echo "$ATTESTATION" | jq -r '.signature.algorithm')"
echo "Key ID: $(echo "$ATTESTATION" | jq -r '.signature.key_id')"
echo "Digest: $(echo "$ATTESTATION" | jq -r '.signature.signed_payload_sha256' | cut -c1-32)..."

echo ""
echo "Service status"
echo "$ATTESTATION" | jq -r '.operational_evidence.step_statuses | to_entries | .[] | "\(.value): \(.key)"' | sed 's/_/ /g'

echo ""
echo "Demo done"
```

Run it with:

```bash
bash demo-attestation-live.sh
```

## UI Parts Added

Main parts in the new card:

1. Cryptographic attestation card
- Main container for proof summary

2. Header row
- Card title and signed badge

3. Answer block
- Question, yes or no answer, and reason

4. Meta info block
- Algorithm, key id, service count, proof event count

5. Signature details
- SHA256 payload hash, signature, public key

6. Operational evidence details
- Status from all cleanup services

## Learning Value

This demo is good for students because it shows:

1. Real crypto in a real app
- Not only theory, but running code and UI

2. Distributed system proof
- Multiple services giving one final proof

3. Better audit and compliance story
- Signed report that others can verify

4. Good system design practice
- Hash chain plus signatures plus service checks

## Deployment Steps

### 1) Build and push frontend image

```bash
docker build --tag aaronshan2635088459/erasegraph-frontend:attestation-showcase-20260508 ./frontend
docker push aaronshan2635088459/erasegraph-frontend:attestation-showcase-20260508
```

### 2) Update Kubernetes deployment

```bash
kubectl set image deployment/frontend frontend=aaronshan2635088459/erasegraph-frontend:attestation-showcase-20260508 -n erasegraph
kubectl rollout status deployment/frontend -n erasegraph
```

### 3) Verify online

```bash
# Open http://34.56.39.214/
# Select a completed deletion request
# Check the Cryptographic Attestation card
```

## Short Demo Speech

You can say:

1. We do not only claim deletion. We prove it with crypto.
2. We use Ed25519 signatures, hash chain, and service checks.
3. Users can export proof and others can verify it.
4. This gives more trust, transparency, and audit value.

Project demo ready.
