#!/bin/bash
set -e

echo "Building Docker images from monorepo..."

# Build Nostream
echo "Building Nostream..."
docker build -f docker/Dockerfile.nostream -t nostream-ilp:latest .

# Build Dassie
echo "Building Dassie..."
docker build -f docker/Dockerfile.dassie -t dassie-node:latest .

# Build PostgreSQL
echo "Building PostgreSQL..."
docker build -t nostream-postgres:latest -f docker/Dockerfile.postgres .

# Tag for registry (optional)
if [ ! -z "$REGISTRY" ]; then
  echo "Tagging images for registry: $REGISTRY"
  docker tag nostream-ilp:latest $REGISTRY/nostream-ilp:latest
  docker tag dassie-node:latest $REGISTRY/dassie-node:latest
fi

echo "Build complete!"
docker images | grep -E "nostream-ilp|dassie-node"
