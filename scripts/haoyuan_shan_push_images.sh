#!/usr/bin/env bash
# =============================================================================
# haoyuan_shan_push_images.sh
#
# Builds all EraseGraph service images and pushes them to Docker Hub.
# Docker Hub username: aaronshan2635088459
#
# Usage:
#   chmod +x scripts/haoyuan_shan_push_images.sh
#   ./scripts/haoyuan_shan_push_images.sh
#
# Prerequisites:
#   - Docker Desktop running
#   - Logged in to Docker Hub: docker login
# =============================================================================

set -euo pipefail

DOCKER_USER="aaronshan2635088459"
TAG="latest"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok()  { echo -e "  ${GREEN}✓${RESET}  $1"; }
err() { echo -e "  ${RED}✗${RESET}  $1"; exit 1; }

echo -e "${BOLD}Building and pushing EraseGraph images to Docker Hub (${DOCKER_USER})${RESET}\n"

# ─── Step 1: Build all images via docker-compose ────────────────────────────
echo -e "${BOLD}[1/3] Building all images with docker-compose build …${RESET}"
cd "${PROJECT_ROOT}/infra"
docker compose build
ok "All images built"

# ─── Step 2: Tag and push each image ─────────────────────────────────────────
echo -e "\n${BOLD}[2/3] Tagging and pushing images …${RESET}"

# Pairs: "local-name:remote-name"
IMAGES=(
  "infra-backend:erasegraph-backend"
  "infra-frontend:erasegraph-frontend"
  "infra-api-gateway:erasegraph-api-gateway"
  "infra-primary-data-service:erasegraph-primary-data-service"
  "infra-cache-cleanup-service:erasegraph-cache-cleanup-service"
  "infra-proof-service:erasegraph-proof-service"
  "infra-backup-service:erasegraph-backup-service"
  "infra-analytics-cleanup-service:erasegraph-analytics-cleanup-service"
  "infra-search-cleanup-service:erasegraph-search-cleanup-service"
  "infra-notification-service:erasegraph-notification-service"
)

for PAIR in "${IMAGES[@]}"; do
  LOCAL_NAME="${PAIR%%:*}"
  HUB_NAME="${PAIR##*:}"
  REMOTE_NAME="${DOCKER_USER}/${HUB_NAME}:${TAG}"
  echo "  Tagging ${LOCAL_NAME}:${TAG} → ${REMOTE_NAME}"
  docker tag "${LOCAL_NAME}:${TAG}" "${REMOTE_NAME}"
  echo "  Pushing ${REMOTE_NAME} …"
  docker push "${REMOTE_NAME}"
  ok "Pushed ${REMOTE_NAME}"
done

# ─── Step 3: Summary ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}[3/3] Done — images on Docker Hub:${RESET}"
for PAIR in "${IMAGES[@]}"; do
  HUB_NAME="${PAIR##*:}"
  echo "  https://hub.docker.com/r/${DOCKER_USER}/${HUB_NAME}"
done

echo -e "\n${BOLD}${GREEN}All images pushed successfully.${RESET}"
echo "Next step: kubectl apply -f k8s/ -n erasegraph"
