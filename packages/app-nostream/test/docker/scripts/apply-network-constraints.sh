#!/bin/sh
# Apply network constraints using tc (traffic control)
# This script simulates network latency and packet loss for testing

set -e

LATENCY_MS="${NETWORK_LATENCY_MS:-0}"
PACKET_LOSS_PERCENT="${NETWORK_PACKET_LOSS:-0}"
INTERFACE="${NETWORK_INTERFACE:-eth0}"

echo "Applying network constraints to interface $INTERFACE:"
echo "  Latency: ${LATENCY_MS}ms"
echo "  Packet Loss: ${PACKET_LOSS_PERCENT}%"

# Only apply constraints if values are non-zero
if [ "$LATENCY_MS" -gt 0 ] || [ "$PACKET_LOSS_PERCENT" != "0" ]; then
  # Check if tc is available
  if ! command -v tc > /dev/null 2>&1; then
    echo "Warning: tc command not found. Install iproute2 package."
    exit 1
  fi

  # Add qdisc (queuing discipline) with delay and loss
  tc qdisc add dev "$INTERFACE" root netem \
    delay "${LATENCY_MS}ms" \
    loss "${PACKET_LOSS_PERCENT}%" \
    2>/dev/null || {
      echo "Warning: Failed to apply network constraints (already configured?)"
      tc qdisc change dev "$INTERFACE" root netem \
        delay "${LATENCY_MS}ms" \
        loss "${PACKET_LOSS_PERCENT}%"
    }

  echo "✓ Network constraints applied successfully"
else
  echo "✓ No network constraints configured (zero values)"
fi
