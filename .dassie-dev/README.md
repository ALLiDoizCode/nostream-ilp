# Dassie Development Configuration

This directory contains local development configuration for the Dassie ILP node integration with Nostream.

## Directory Structure

```
.dassie-dev/
├── README.md           # This file
├── setup-dns.sh        # DNS configuration script
└── config.yaml         # Local development settings (optional)
```

## Environment Variables

The following environment variables should be set in your shell configuration (`~/.zshrc` or `~/.bashrc`):

### Required

```bash
# Node.js CA certificates for mkcert
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"

# fnm (Fast Node Manager) auto-switching
eval "$(fnm env --use-on-cd)"
```

### Optional

```bash
# Dassie development settings
export DASSIE_DEV_PORT=5000          # Default RPC port
export DASSIE_LOG_LEVEL=debug        # Log level (debug, info, warn, error)
export DASSIE_NODE_COUNT=3           # Number of dev nodes to spin up
```

## Common Development Tasks

Add these scripts to your `~/.zshrc` or `~/.bashrc` for convenience:

```bash
# Navigate to Dassie directory and start
alias dassie-start='cd ~/Documents/dassie && fnm use 22.8.0 && pnpm start'

# Navigate to Dassie and reset environment
alias dassie-reset='cd ~/Documents/dassie && rm -rf .dassie-dev/node*/db/ && echo "Dassie databases cleared"'

# Check Dassie status
alias dassie-status='ps aux | grep "start-development-server.js" | grep -v grep'

# Kill Dassie processes
alias dassie-kill='pkill -f "start-development-server.js"'

# Navigate to Dassie
alias dassie='cd ~/Documents/dassie'
```

## Resetting Development Environment

### Clear All Node Databases

```bash
cd ~/Documents/dassie
rm -rf .dassie-dev/node*/db/
```

**When to reset:**

- After breaking changes to ledger schema
- Testing new settlement modules from scratch
- Debugging peer discovery issues
- Clearing test payment history

### Reset Specific Node

```bash
cd ~/Documents/dassie
rm -rf .dassie-dev/node1/db/  # Replace node1 with target node
```

### Full Reset (Nuclear Option)

```bash
cd ~/Documents/dassie
rm -rf .dassie-dev/
pnpm start  # Will recreate .dassie-dev/ on next run
```

## Clearing SQLite Databases Between Runs

Dassie uses SQLite for its internal ledger and state management. Database files are stored in:

```
~/Documents/dassie/.dassie-dev/node*/db/
```

### Manual Cleanup

```bash
# Stop Dassie first (Ctrl+C or dassie-kill)
cd ~/Documents/dassie
find .dassie-dev -name "*.db" -type f -delete
find .dassie-dev -name "*.db-shm" -type f -delete
find .dassie-dev -name "*.db-wal" -type f -delete
```

### Automated Cleanup Script

Create `~/.dassie-dev/clear-db.sh`:

```bash
#!/bin/bash
# Clear Dassie SQLite databases

DASSIE_DIR=~/Documents/dassie

echo "🗑️  Clearing Dassie databases..."

# Stop Dassie if running
pkill -f "start-development-server.js" 2>/dev/null

# Wait for processes to terminate
sleep 2

# Clear databases
find "$DASSIE_DIR/.dassie-dev" -name "*.db" -type f -delete 2>/dev/null
find "$DASSIE_DIR/.dassie-dev" -name "*.db-shm" -type f -delete 2>/dev/null
find "$DASSIE_DIR/.dassie-dev" -name "*.db-wal" -type f -delete 2>/dev/null

echo "✅ Databases cleared!"
echo "💡 Run 'dassie-start' to restart with fresh databases."
```

Make it executable:

```bash
chmod +x ~/.dassie-dev/clear-db.sh
```

Add alias:

```bash
alias dassie-clean='~/.dassie-dev/clear-db.sh'
```

## Development Ports

The development environment uses the following ports:

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Debug UI | 443 (HTTPS) | `https://localhost/` | Development dashboard |
| tRPC Server | 5000 | `ws://localhost:5000/trpc` | RPC WebSocket API |
| Node 1 | 7768 | `https://node1.localhost/` | First Dassie node |
| Node 2 | 7769 | `https://node2.localhost/` | Second Dassie node |
| Node 3 | 7770 | `https://node3.localhost/` | Third Dassie node |

**Note:** Actual ports may vary. Check console output when starting Dassie.

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Database Locked

```bash
# Stop all Dassie processes
pkill -f "start-development-server.js"

# Clear databases
dassie-reset  # or manually delete .db files
```

### Node Version Mismatch

```bash
# Verify Node version
node --version  # Must be v22.8.0

# Switch to correct version
fnm use 22.8.0
```

### DNS Not Working

```bash
# Restart dnsmasq
sudo brew services restart dnsmasq

# Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Test resolution
ping test.localhost
```

## Integration with Nostream

### Connecting Nostream to Dassie

Example tRPC client configuration (Epic 2 Story 2.2):

```typescript
// src/services/dassie-client.ts
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '@dassie/app-dassie/src/rpc-server';

const wsClient = createWSClient({
  url: 'ws://localhost:5000/trpc',
  connectionParams: {
    token: process.env.DASSIE_RPC_TOKEN,
  },
});

export const dassieClient = createTRPCProxyClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});
```

### Environment Variables for Nostream

Add to `.env`:

```bash
# Dassie Integration
DASSIE_RPC_URL=ws://localhost:5000/trpc
DASSIE_RPC_TOKEN=dev-token-placeholder  # Story 2.2 will add real auth
DASSIE_NODE_ID=node1
DASSIE_SETTLEMENT_ASSET=XRP
```

## Next Steps

1. **Verify Dassie is running:** `dassie-status`
2. **Access Debug UI:** Open `https://localhost/` in browser
3. **Check RPC server:** Look for tRPC WebSocket connection in browser DevTools
4. **Proceed to Epic 2 Story 2.2:** Implement RPC token authentication

---

*Last Updated: 2025-11-25*
*Story: 2.1 - Set Up Dassie Development Environment*
