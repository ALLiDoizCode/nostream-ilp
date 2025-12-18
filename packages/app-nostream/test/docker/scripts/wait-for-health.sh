#!/bin/sh
# Wait for Docker containers to be healthy
# Usage: ./wait-for-health.sh <container-name> <timeout-seconds>

set -e

CONTAINER_NAME="${1}"
TIMEOUT="${2:-60}"
ELAPSED=0
INTERVAL=2

echo "Waiting for container '$CONTAINER_NAME' to be healthy (timeout: ${TIMEOUT}s)..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not-running")

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✓ Container '$CONTAINER_NAME' is healthy (after ${ELAPSED}s)"
    exit 0
  fi

  if [ "$HEALTH_STATUS" = "not-running" ]; then
    echo "✗ Container '$CONTAINER_NAME' is not running"
    exit 1
  fi

  echo "  Status: $HEALTH_STATUS (${ELAPSED}s elapsed)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "✗ Timeout waiting for '$CONTAINER_NAME' to be healthy"
exit 1
