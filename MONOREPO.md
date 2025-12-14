# Monorepo Development Guide

This document explains how to work with the Nostream-ILP monorepo using pnpm workspaces.

## Table of Contents

1. [Architecture](#architecture)
2. [Adding New Packages](#adding-new-packages)
3. [Dependency Management](#dependency-management)
4. [Cross-Package Imports](#cross-package-imports)
5. [Testing Strategy](#testing-strategy)
6. [Build Process](#build-process)
7. [Troubleshooting](#troubleshooting)

---

## Architecture

The monorepo uses **pnpm workspaces** to manage multiple packages:

```
nostream-ilp/
├── packages/
│   ├── app-nostream/          # Nostr relay application
│   ├── app-dassie/            # Dassie ILP node
│   ├── lib-payment-types/     # Shared payment interfaces
│   ├── lib-contracts/         # Smart contracts (Hardhat)
│   └── lib-dassie-*/         # Dassie library packages
├── pnpm-workspace.yaml        # Workspace configuration
├── package.json               # Root package with scripts
└── tsconfig.json              # Root TypeScript config
```

### Package Naming Convention

All packages use the `@nostream-ilp/` scope:

- `@nostream-ilp/app-nostream` - Main relay
- `@nostream-ilp/app-dassie` - ILP node
- `@nostream-ilp/lib-payment-types` - Shared types
- `@nostream-ilp/lib-contracts` - Solidity contracts
- `@nostream-ilp/lib-dassie-*` - Dassie libraries

---

## Adding New Packages

### 1. Create Package Directory

```bash
mkdir -p packages/lib-my-new-package/src
```

### 2. Create package.json

```json
{
  "name": "@nostream-ilp/lib-my-new-package",
  "version": "0.1.0",
  "description": "Description here",
  "main": "./src/index.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint --ext .ts ./src"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

### 3. Create tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 4. Add to Root tsconfig.json

```json
{
  "references": [
    { "path": "./packages/lib-my-new-package" }
  ]
}
```

### 5. Install Dependencies

```bash
pnpm install
```

---

## Dependency Management

### Installing Dependencies

**Add to specific package:**
```bash
# Add production dependency
pnpm --filter @nostream-ilp/app-nostream add axios

# Add dev dependency
pnpm --filter @nostream-ilp/lib-payment-types add -D typescript
```

**Add to all packages:**
```bash
pnpm add -r typescript
```

**Add to root (monorepo tools):**
```bash
pnpm add -D -w concurrently
```

### Workspace Dependencies

To depend on another package in the monorepo:

```json
{
  "dependencies": {
    "@nostream-ilp/lib-payment-types": "workspace:^"
  }
}
```

The `workspace:^` protocol tells pnpm to link to the local package.

### Updating Dependencies

```bash
# Update all dependencies
pnpm update -r

# Update specific package
pnpm --filter @nostream-ilp/app-nostream update axios
```

---

## Cross-Package Imports

### TypeScript Imports

Import from workspace packages like normal npm packages:

```typescript
// In packages/app-nostream/src/services/payment/verifier.ts
import { PaymentClaim, SUPPORTED_CURRENCIES } from '@nostream-ilp/lib-payment-types'
import type { AppRouter } from '@nostream-ilp/lib-payment-types'
```

### Path Aliases

Each package can define its own path aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"],
      "@types/*": ["src/@types/*"]
    }
  }
}
```

### TypeScript Project References

The monorepo uses TypeScript project references for incremental builds:

- Root `tsconfig.json` references all packages
- Each package references its dependencies
- Enables faster builds (only rebuild changed packages)

---

## Testing Strategy

### Running Tests

**All packages:**
```bash
pnpm test
```

**Specific package:**
```bash
pnpm test:nostream
pnpm test:dassie
pnpm test:contracts
```

**Watch mode (for development):**
```bash
pnpm --filter @nostream-ilp/app-nostream test:unit:watch
```

### Test Organization

Each package maintains its own tests:

```
packages/app-nostream/
├── src/
└── test/
    ├── unit/
    └── integration/
```

### Integration Tests

For cross-package integration tests, create a dedicated package:

```bash
packages/integration-tests/
├── nostream-dassie-integration.spec.ts
└── payment-flow-e2e.spec.ts
```

---

## Build Process

### Build Order

pnpm automatically determines the correct build order based on dependencies:

1. `lib-payment-types` (no dependencies)
2. `lib-contracts` (no workspace dependencies)
3. `app-nostream` (depends on `lib-payment-types`)
4. `app-dassie` (depends on `lib-dassie-*` packages)

### Build Commands

**Build all:**
```bash
pnpm build
```

**Build specific package:**
```bash
pnpm build:nostream
pnpm build:dassie
pnpm build:contracts
```

**Incremental build (TypeScript project references):**
```bash
pnpm -r build --incremental
```

### Clean Build

```bash
# Clean all build artifacts
pnpm clean

# Rebuild from scratch
pnpm clean && pnpm build
```

---

## Development Workflow

### 1. Clone and Setup

```bash
git clone https://github.com/cameri/nostream.git
cd nostream
corepack enable
pnpm install
```

### 2. Make Changes

Edit files in `packages/app-nostream/` or `packages/app-dassie/`.

### 3. Run in Dev Mode

```bash
# Run Nostream only
pnpm dev:nostream

# Run both Nostream + Dassie
pnpm dev:all
```

### 4. Run Tests

```bash
pnpm test
```

### 5. Lint and Typecheck

```bash
pnpm lint
pnpm typecheck
```

### 6. Build for Production

```bash
pnpm build
```

---

## Troubleshooting

### Problem: "Cannot find module '@nostream-ilp/lib-payment-types'"

**Solution:** Ensure the package is built and installed:

```bash
pnpm install
pnpm --filter @nostream-ilp/lib-payment-types build
```

### Problem: "Circular dependency detected"

**Solution:** Check `tsconfig.json` references. Ensure no circular dependencies between packages.

```bash
# Visualize dependency graph
pnpm list --graph
```

### Problem: "Workspace dependency not found"

**Solution:** Verify `workspace:^` protocol is used in package.json:

```json
{
  "dependencies": {
    "@nostream-ilp/lib-payment-types": "workspace:^"
  }
}
```

Then run:
```bash
pnpm install
```

### Problem: "TypeScript errors in IDE but builds succeed"

**Solution:** Restart TypeScript server in your editor:

- VS Code: `Cmd+Shift+P` → "TypeScript: Restart TS Server"
- Rebuild project references: `pnpm -r build --force`

### Problem: "pnpm install fails with ENOENT"

**Solution:** Clear pnpm cache:

```bash
pnpm store prune
rm -rf node_modules packages/*/node_modules
pnpm install
```

---

## Best Practices

### 1. Use Workspace Dependencies

Always use `workspace:^` for internal dependencies:

```json
{
  "dependencies": {
    "@nostream-ilp/lib-payment-types": "workspace:^"
  }
}
```

### 2. Keep Packages Focused

Each package should have a single responsibility:

- `lib-payment-types`: Only types, no logic
- `lib-contracts`: Only Solidity contracts
- `app-*`: Application entry points

### 3. Avoid Circular Dependencies

If Package A depends on Package B, Package B should NOT depend on Package A.

### 4. Use TypeScript Project References

Enable incremental builds for faster development:

```json
{
  "compilerOptions": {
    "composite": true
  },
  "references": [
    { "path": "../lib-payment-types" }
  ]
}
```

### 5. Version Together

All packages share the same version. Update root `package.json` version when releasing.

---

## Additional Resources

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Monorepo Best Practices](https://monorepo.tools/)

---

**Last Updated:** December 12, 2025
**Maintainer:** Nostream-ILP Team
