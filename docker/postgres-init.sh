#!/bin/bash
set -e

echo "=== Nostream PostgreSQL Initialization ==="
echo "Database: $POSTGRES_DB"
echo "User: $POSTGRES_USER"

# Function to run SQL file
run_migration() {
  local file=$1
  echo "Applying migration: $(basename "$file")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" < "$file"
}

# Run migrations in order (sorted by filename)
if [ -d "/docker-entrypoint-initdb.d/migrations" ]; then
  # Use find and sort to ensure consistent ordering
  find /docker-entrypoint-initdb.d/migrations -name "*.sql" -type f | sort | while read -r migration; do
    run_migration "$migration"
  done
else
  echo "Warning: No migrations directory found at /docker-entrypoint-initdb.d/migrations"
fi

# Create indexes for performance
echo "Creating performance indexes..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events(pubkey);
  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_tags ON events USING gin(tags);
EOSQL

echo "=== Initialization Complete ==="
