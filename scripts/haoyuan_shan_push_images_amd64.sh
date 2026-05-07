#!/usr/bin/env bash
# =============================================================================
# haoyuan_shan_push_images_amd64.sh
#
# Builds all EraseGraph images for linux/amd64 (required for GKE) and pushes
# them to Docker Hub using docker buildx.
#
# Usage:
#   chmod +x scripts/haoyuan_shan_push_images_amd64.sh
#   ./scripts/haoyuan_shan_push_images_amd64.sh
# =============================================================================

set -euo pipefail

DOCKER_USER="aaronshan2635088459"
TAG="latest"
PLATFORM="linux/amd64"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ok()  { echo -e "  ${GREEN}✓${RESET}  $1"; }

echo -e "${BOLD}Building & pushing for ${PLATFORM} (GKE) — Docker Hub: ${DOCKER_USER}${RESET}\n"

# Ensure buildx builder with multi-platform support
docker buildx create --name gke-builder --use --bootstrap 2>/dev/null || \
  docker buildx use gke-builder 2>/dev/null || true

# service-dir : hub-image-name
SERVICES=(
  "backend:erasegraph-backend"
  "frontend:erasegraph-frontend"
  "api-gateway-service:erasegraph-api-gateway"
  "primary-data-service:erasegraph-primary-data-service"
  "cache-cleanup-service:erasegraph-cache-cleanup-service"
  "proof-service:erasegraph-proof-service"
  "backup-service:erasegraph-backup-service"
  "analytics-cleanup-service:erasegraph-analytics-cleanup-service"
  "search-cleanup-service:erasegraph-search-cleanup-service"
  "notification-service:erasegraph-notification-service"
)

for PAIR in "${SERVICES[@]}"; do
  SVC_DIR="${PAIR%%:*}"
  HUB_NAME="${PAIR##*:}"
  REMOTE="${DOCKER_USER}/${HUB_NAME}:${TAG}"
  BUILD_CTX="${PROJECT_ROOT}/${SVC_DIR}"

  echo "  Building ${HUB_NAME} …"
  docker buildx build \
    --platform "${PLATFORM}" \
    --tag "${REMOTE}" \
    --push \
    "${BUILD_CTX}"
  ok "Pushed ${REMOTE}"
done

echo -e "\n${BOLD}${GREEN}All amd64 images pushed. Restart GKE pods with:${RESET}"
echo "  kubectl rollout restart deployment -n erasegraph"
