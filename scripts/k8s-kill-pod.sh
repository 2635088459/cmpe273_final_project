#!/usr/bin/env bash
# ============================================================
# k8s-kill-pod.sh — Pod recovery demonstration script
# Usage: ./scripts/k8s-kill-pod.sh <service-name> [namespace]
# Example: ./scripts/k8s-kill-pod.sh backend erasegraph
# ============================================================
set -euo pipefail

SERVICE="${1:-}"
NAMESPACE="${2:-${NAMESPACE:-erasegraph}}"
TIMEOUT=120

if [[ -z "$SERVICE" ]]; then
  echo "Usage: $0 <service-name> [namespace]" >&2
  echo "  service-name: backend | primary-data-service | cache-cleanup-service | proof-service" >&2
  exit 1
fi

echo "======================================================"
echo " Pod Recovery Demo — service: $SERVICE"
echo " Namespace: $NAMESPACE"
echo "======================================================"

# Find a running pod for the service
POD=$(kubectl get pods \
  -n "$NAMESPACE" \
  -l "app=$SERVICE" \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [[ -z "$POD" ]]; then
  echo "ERROR: No running pod found for service '$SERVICE' in namespace '$NAMESPACE'" >&2
  echo "  Check: kubectl get pods -n $NAMESPACE -l app=$SERVICE" >&2
  exit 1
fi

echo ""
echo "Target pod:   $POD"
echo "Deleting pod at: $(date '+%H:%M:%S')"
kubectl delete pod -n "$NAMESPACE" "$POD"

echo ""
echo "Waiting for Kubernetes to schedule a replacement pod..."
START=$(date +%s)

while true; do
  NEW_POD=$(kubectl get pods \
    -n "$NAMESPACE" \
    -l "app=$SERVICE" \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

  ELAPSED=$(( $(date +%s) - START ))

  if [[ -n "$NEW_POD" && "$NEW_POD" != "$POD" ]]; then
    echo ""
    echo "======================================================"
    echo " Recovery complete!"
    echo " New pod:      $NEW_POD"
    echo " Recovery time: ${ELAPSED}s"
    echo " Recovered at:  $(date '+%H:%M:%S')"
    echo "======================================================"
    break
  fi

  if (( ELAPSED >= TIMEOUT )); then
    echo "" >&2
    echo "ERROR: Pod did not recover within ${TIMEOUT}s" >&2
    echo "  Run: kubectl describe pod -n $NAMESPACE -l app=$SERVICE" >&2
    exit 1
  fi

  printf "\r  ...waiting for new pod (${ELAPSED}s elapsed)"
  sleep 2
done
