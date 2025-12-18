#!/bin/bash
set -e

# Read configuration from environment
LATENCY=${NETWORK_LATENCY:-0ms}
JITTER=${NETWORK_JITTER:-0ms}
PACKET_LOSS=${NETWORK_PACKET_LOSS:-0%}

# Apply tc rules if any simulation enabled
if [ "$LATENCY" != "0ms" ] || [ "$PACKET_LOSS" != "0%" ]; then
  echo "Applying network simulation: latency=$LATENCY jitter=$JITTER loss=$PACKET_LOSS"

  if ! tc qdisc add dev eth0 root netem \
    delay $LATENCY $JITTER \
    loss $PACKET_LOSS; then
    echo "ERROR: Failed to apply network simulation (tc command failed)"
    echo "Ensure container has CAP_NET_ADMIN capability"
    exit 1
  fi

  echo "✓ Network simulation applied"
else
  echo "Network simulation disabled"
fi
