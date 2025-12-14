# Docker Images - Nostream-ILP Monorepo

This directory contains Dockerfiles for building containerized versions of the Nostream relay and Dassie ILP node from the monorepo.

## Overview

The monorepo uses **multi-stage builds** to create optimized production images:

- **Nostream** (`Dockerfile.nostream`): Nostr relay with ILP payment integration
- **Dassie** (`Dockerfile.dassie`): ILP routing node with settlement modules
- **PostgreSQL** (`Dockerfile.postgres`): Custom PostgreSQL with Nostr-specific schema

All images use `node:22-alpine` as the base for minimal size and security.

---

## Dockerfiles

### `Dockerfile.nostream`

Multi-stage build for Nostream relay:

**Stage 1: Dependencies**
- Installs pnpm and workspace dependencies
- Filters to only install `@nostream-ilp/app-nostream` and its workspace deps
- Uses `--frozen-lockfile` to ensure reproducible builds
- Cached separately for faster rebuilds

**Stage 2: Build**
- Compiles TypeScript to JavaScript
- Uses `pnpm --filter` to build only required packages
- Copies compiled output to `dist/`

**Stage 3: Production**
- Minimal runtime environment
- Only production dependencies and compiled code
- Runs as non-root `node` user
- Health check on port 8008

**Image Size Target:** <500MB acceptable, <400MB ideal (currently 539MB after prod-deps optimization)

### `Dockerfile.dassie`

Multi-stage build for Dassie ILP node:

**Stage 1: Dependencies**
- Installs pnpm and all Dassie workspace libraries
- Filters to `@nostream-ilp/app-dassie...` (includes lib-dassie-* deps)
- Requires copying all `lib-dassie-*/package.json` files

**Stage 2: Build**
- Compiles all Dassie packages (app + libraries)
- Uses TypeScript project references for incremental builds
- Produces production-ready bundles

**Stage 3: Production**
- Includes `curl` for health checks and `sqlite` for ledger storage
- Creates `/app/data` volume for persistent ledger database
- Health check on port 7768

**Image Size Target:** <450MB

### `Dockerfile.postgres`

Custom PostgreSQL 14 image with:
- Nostr event schema migrations
- BTP-NIPs extensions (if applicable)
- Health check configured for Docker Compose

---

## Multi-Stage Build Strategy

### Why 3 Stages?

**1. Dependencies Stage (`deps`)**
- **Purpose:** Install npm dependencies separately from source code
- **Benefit:** Docker caches this layer; only reinstalls if `package.json` changes
- **Cache Duration:** Usually lasts for weeks/months between dependency updates

**2. Builder Stage (`builder`)**
- **Purpose:** Compile TypeScript to JavaScript
- **Benefit:** Build tools (TypeScript, tsc-alias) are not included in production image
- **Cache Duration:** Invalidates on any source code change

**3. Production Stage**
- **Purpose:** Minimal runtime environment
- **Benefit:** Smallest possible image (no dev dependencies, no TypeScript compiler)
- **Security:** Fewer packages = smaller attack surface

### Layer Caching Strategy

Dockerfile order is optimized for maximum cache hits:

```dockerfile
# 1. Copy package.json FIRST (least frequently changed)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 2. Install dependencies (cached until package.json changes)
RUN pnpm install --frozen-lockfile

# 3. Copy source code LAST (most frequently changed)
COPY packages/app-nostream ./packages/app-nostream
```

**Result:** If you only change source code, Docker reuses cached dependency layers. Rebuilds complete in ~30 seconds instead of 5 minutes.

---

## Image Optimization Techniques

### 1. Alpine Base Image

```dockerfile
FROM node:22-alpine
```

- **Size:** 120MB vs 900MB for `node:22` (Debian-based)
- **Security:** Minimal attack surface (only essential packages)
- **Trade-off:** Some native modules may require build dependencies (`apk add python3 make g++`)

### 2. pnpm Workspaces

```dockerfile
RUN pnpm install --frozen-lockfile --filter @nostream-ilp/app-nostream...
```

- **Benefit:** Only installs dependencies for the specified package and its workspace deps
- **vs npm/yarn:** Better deduplication, faster installs
- **Monorepo-aware:** Resolves `workspace:^` dependencies automatically

### 3. Production Dependencies Only

In the final stage, we copy `node_modules` from the `deps` stage which includes dev dependencies. For further optimization, consider:

```dockerfile
# In production stage
RUN pnpm install --prod --frozen-lockfile
```

**Trade-off:** Adds build time but reduces image size by 20-30%.

### 4. `.dockerignore`

Excludes unnecessary files from Docker build context:

```
node_modules  # Rebuilt inside container
.git          # Not needed in image
docs          # Documentation
test          # Test files
*.md          # Markdown files
dist          # Old build artifacts
```

**Benefit:** Faster build context transfer (especially over network), smaller images.

### 5. Minimize Layers

Docker images are composed of layers. Each `RUN`, `COPY`, `ADD` command creates a new layer.

**Bad:**
```dockerfile
RUN apk add curl
RUN apk add sqlite
RUN apk add bash
```

**Good:**
```dockerfile
RUN apk add --no-cache curl sqlite bash
```

**Benefit:** Fewer layers = faster image pulls, smaller total size.

---

## Health Checks

Both Dockerfiles include health checks to ensure services are responsive:

### Nostream Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:8008/health || exit 1
```

**Parameters:**
- `interval=30s`: Check every 30 seconds
- `timeout=10s`: Fail if check takes >10 seconds
- `retries=3`: Mark unhealthy after 3 consecutive failures
- `start-period=40s`: Grace period on startup (don't fail during initialization)

**Why:** Nostream needs time to:
- Connect to PostgreSQL
- Connect to Redis
- Establish Dassie RPC connection

### Dassie Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD curl -f http://localhost:7768/health || exit 1
```

**Start Period:** 60s (longer than Nostream) because Dassie must:
- Initialize SQLite ledger
- Load settlement modules (Base, Cronos, etc.)
- Start RPC server

### Custom Health Check Scripts

Standalone Node.js scripts are also available:

- `packages/app-nostream/healthcheck.js`
- `packages/app-dassie/healthcheck.js`

**Usage in Dockerfile:**
```dockerfile
COPY healthcheck.js ./
HEALTHCHECK CMD node healthcheck.js
```

**Benefit:** More control over health check logic (e.g., check database connections, not just HTTP 200).

---

## Building Images

### Option 1: Build Script (Recommended)

```bash
pnpm docker:build
```

This runs `./scripts/docker-build.sh` which:
1. Builds Nostream image → `nostream-ilp:latest`
2. Builds Dassie image → `dassie-node:latest`
3. Builds PostgreSQL image → `nostream-postgres:latest`
4. (Optional) Tags images for registry if `$REGISTRY` env var is set

### Option 2: Manual Build

```bash
# Build Nostream
docker build -f docker/Dockerfile.nostream -t nostream-ilp:latest .

# Build Dassie
docker build -f docker/Dockerfile.dassie -t dassie-node:latest .

# Build PostgreSQL
docker build -f docker/Dockerfile.postgres -t nostream-postgres:latest .
```

**Note:** Always build from the monorepo root (`.`) so Docker has access to all packages.

### Option 3: Docker Compose

```bash
docker-compose build
```

This uses the `build:` sections in `docker-compose.yml` to build all images.

---

## Running Services

### Start Stack

```bash
pnpm docker:start
```

This runs `./scripts/docker-start.sh` which:
1. Checks if `.env` exists (exits if not)
2. Runs `docker-compose up -d` (detached mode)
3. Waits 15 seconds for services to start
4. Shows service status

**Services Started:**
- `nostream-db` (PostgreSQL)
- `nostream-cache` (Redis)
- `dassie` (Dassie ILP node)
- `nostream` (Nostream relay)

### Check Health

```bash
docker-compose ps
```

**Healthy Output:**
```
NAME            IMAGE                 STATUS
nostream-db     nostream-postgres     Up (healthy)
nostream-cache  redis:7-alpine        Up (healthy)
dassie-node     dassie-node:latest    Up (healthy)
nostream-ilp    nostream-ilp:latest   Up (healthy)
```

**Unhealthy?**
1. Check logs: `docker-compose logs <service>`
2. Verify environment variables in `.env`
3. Ensure dependent services are healthy (e.g., Nostream needs Dassie)

### Stop Stack

```bash
pnpm docker:stop
```

This runs `docker-compose down`, which stops and removes containers (but keeps volumes).

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f nostream
docker-compose logs -f dassie
```

---

## Troubleshooting

### Build Errors

**Error: `pnpm install` fails**
- **Cause:** Lock file out of sync
- **Fix:** Run `pnpm install` locally, commit `pnpm-lock.yaml`, rebuild

**Error: TypeScript compilation fails**
- **Cause:** Type errors in source code
- **Fix:** Run `pnpm typecheck` locally, fix errors, rebuild

**Error: "Cannot find module @nostream-ilp/..."**
- **Cause:** Workspace dependency not copied into Docker build
- **Fix:** Ensure all required `COPY packages/<name>` commands are in Dockerfile

### Runtime Errors

**Service marked "unhealthy"**
- **Cause:** Health check endpoint not responding
- **Fix:**
  1. Check logs: `docker logs <container>`
  2. Verify port is correct in HEALTHCHECK command
  3. Increase `start-period` if service needs more startup time

**Nostream: "Cannot connect to Dassie RPC"**
- **Cause:** Dassie not started or wrong URL
- **Fix:**
  1. Verify `DASSIE_RPC_URL=ws://dassie:7768/trpc` in `docker-compose.yml`
  2. Ensure `dassie` service is in `depends_on` with `condition: service_healthy`
  3. Check `DASSIE_RPC_TOKEN` matches in both services

**Dassie: "Cannot connect to settlement module"**
- **Cause:** Settlement RPC URL unreachable or missing private key
- **Fix:**
  1. Verify `SETTLEMENT_BASE_RPC_URL` in `.env`
  2. Ensure `SETTLEMENT_BASE_ENABLED=false` if not using Base settlement
  3. Check private key format (must start with `0x`)

**PostgreSQL: "Connection refused"**
- **Cause:** Database not fully initialized
- **Fix:**
  1. Wait longer (check logs: `docker logs nostream-db`)
  2. Verify `DB_PASSWORD` matches in Nostream and PostgreSQL services
  3. Ensure health check passes: `docker inspect --format='{{.State.Health.Status}}' nostream-db`

### Performance Issues

**Build takes >10 minutes**
- **Cause:** No layer caching (building from scratch)
- **Fix:**
  1. Don't change `package.json` unless necessary
  2. Use `docker buildx` for better caching
  3. Consider CI/CD with remote cache

**Nostream uses high CPU**
- **Cause:** Handling many subscriptions or large events
- **Fix:**
  1. Set resource limits in `docker-compose.yml`:
     ```yaml
     deploy:
       resources:
         limits:
           cpus: '2.0'
           memory: 2G
     ```
  2. Tune PostgreSQL connection pool size
  3. Enable Redis caching for frequently requested events

**Dassie uses high memory**
- **Cause:** Large SQLite ledger or many settlement channels
- **Fix:**
  1. Set memory limit: `deploy.resources.limits.memory: 1G`
  2. Periodically backup and compact ledger: `sqlite3 data/ledger.db 'VACUUM;'`
  3. Close unused payment channels

---

## Environment Variables

See `.env.example` for full list. Key variables for Docker deployment:

### Nostream

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET` | *required* | Session encryption key (generate with `openssl rand -hex 32`) |
| `DB_HOST` | `nostream-db` | PostgreSQL hostname (Docker service name) |
| `DB_PASSWORD` | `nostr_ts_relay` | PostgreSQL password |
| `REDIS_HOST` | `nostream-cache` | Redis hostname (Docker service name) |
| `DASSIE_RPC_URL` | `ws://dassie:7768/trpc` | Dassie WebSocket RPC endpoint |
| `DASSIE_RPC_TOKEN` | *required* | RPC authentication token (min 32 chars) |

### Dassie

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `RPC_AUTH_TOKEN` | *required* | Must match `DASSIE_RPC_TOKEN` |
| `LEDGER_DB_PATH` | `/app/data/ledger.db` | SQLite ledger file path |
| `SETTLEMENT_BASE_ENABLED` | `false` | Enable Base L2 settlement |
| `SETTLEMENT_BASE_RPC_URL` | - | Base RPC endpoint (e.g., Sepolia testnet) |
| `SETTLEMENT_BASE_FACTORY_ADDRESS` | - | Payment channel factory contract address |
| `SETTLEMENT_BASE_RELAY_PRIVATE_KEY` | - | Private key for settlement transactions |

### Security Best Practices

1. **Never commit secrets to version control**
   - Use `.env` (ignored by `.gitignore`)
   - For production, use Docker secrets or Kubernetes secrets

2. **Generate strong tokens**
   ```bash
   openssl rand -hex 32  # 64-character hex string
   ```

3. **Use read-only file systems**
   ```yaml
   services:
     nostream:
       read_only: true
       tmpfs:
         - /tmp
   ```

4. **Drop unnecessary capabilities**
   ```yaml
   services:
     nostream:
       cap_drop:
         - ALL
       cap_add:
         - NET_BIND_SERVICE  # Only if binding to port <1024
   ```

---

## Registry and Deployment

### Tagging for Registry

Set `$REGISTRY` environment variable before building:

```bash
export REGISTRY=ghcr.io/your-org
pnpm docker:build
```

This tags images as:
- `ghcr.io/your-org/nostream-ilp:latest`
- `ghcr.io/your-org/dassie-node:latest`

### Push to Registry

```bash
docker push ghcr.io/your-org/nostream-ilp:latest
docker push ghcr.io/your-org/dassie-node:latest
```

### Pull and Run on Production

```bash
# On production server
docker pull ghcr.io/your-org/nostream-ilp:latest
docker pull ghcr.io/your-org/dassie-node:latest

# Update docker-compose.yml to use registry images
docker-compose up -d
```

### Akash Deployment

For deploying to Akash Network, see:
- `akash/deploy.yaml` - Akash SDL manifest
- `docs/stories/8.2.story.md` - Akash deployment guide

**Key Differences:**
- Images must be public (or use imagePullSecrets)
- No persistent volumes (use object storage for backups)
- Environment variables configured in SDL `env:` section

---

## Additional Resources

- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Health Checks](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Node.js Alpine Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

---

**Last Updated:** December 14, 2025
**Story:** 2.12 - Create Docker Images for Monorepo Services
