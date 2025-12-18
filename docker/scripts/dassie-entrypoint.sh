#!/bin/bash
set -e

# Apply network simulation if configured
# Note: This requires CAP_NET_ADMIN capability
if [ -f /usr/local/bin/apply-network-sim.sh ]; then
  /usr/local/bin/apply-network-sim.sh || {
    echo "Warning: Network simulation script failed, continuing anyway..."
  }
fi

# Switch to node user and execute the main command
exec su-exec node "$@"
