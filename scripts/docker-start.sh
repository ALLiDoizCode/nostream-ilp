#!/bin/bash
set -e

echo "Starting Nostream-ILP stack (Nostream + Dassie)..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example to .env and configure."
  exit 1
fi

# Start stack
docker-compose up -d

# Wait for health checks
echo "Waiting for services to become healthy..."
sleep 15

# Check health
docker-compose ps

echo ""
echo "Stack started!"
echo "  - Nostream relay: ws://localhost:8008"
echo "  - Dassie ILP node: http://localhost:7768"
echo ""
echo "Check logs with: docker-compose logs -f"
