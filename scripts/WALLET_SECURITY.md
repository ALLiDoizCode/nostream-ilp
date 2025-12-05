# Wallet Security Guide

## Overview

This document explains how to securely set up deployment wallets for the Nostream-ILP project.

## CRITICAL SECURITY RULES

🚨 **NEVER hardcode seed phrases or private keys in source code**
🚨 **NEVER commit `.env` files to version control**
🚨 **NEVER share seed phrases or private keys with anyone**
🚨 **ALWAYS back up seed phrases to encrypted storage (1Password, etc.)**

---

## Secure Wallet Setup Methods

The `setup-wallet-from-seed.ts` script provides three secure methods for wallet setup:

### Method 1: Interactive Prompt (MOST SECURE)

This method ensures your seed phrase is **never written to bash history**.

```bash
# Run the script without any arguments
npx ts-node scripts/setup-wallet-from-seed.ts

# The script will prompt you to enter your seed phrase
🔐 Enter your 12-word seed phrase: [type your seed phrase here]
```

**Why this is secure:**
- Seed phrase never appears in bash history
- No files contain the seed phrase
- Direct input from stdin

**Recommended for:** Production deployments

---

### Method 2: Environment Variable

Pass the seed phrase as an environment variable (safer than hardcoding).

```bash
# One-time use (not saved to history if you prefix with space on most shells)
 WALLET_SEED_PHRASE="your twelve word seed phrase here" npx ts-node scripts/setup-wallet-from-seed.ts
```

**Security considerations:**
- ⚠️ Seed phrase may appear in bash history (use `history -d` to remove)
- ⚠️ Visible in process list while script runs
- ✅ Not saved to any files

**Recommended for:** Testing/development only

---

### Method 3: Read from Gitignored File

Store seed phrase in `.wallet-seed.txt` (gitignored).

```bash
# Create seed file (this will be gitignored)
echo "your twelve word seed phrase here" > .wallet-seed.txt

# Run script with --from-file flag
npx ts-node scripts/setup-wallet-from-seed.ts --from-file

# IMPORTANT: Delete the seed file after use
rm .wallet-seed.txt
```

**Security considerations:**
- ⚠️ Seed phrase temporarily stored on disk
- ✅ File is gitignored (won't be committed)
- ✅ No bash history contamination

**Recommended for:** Automated CI/CD pipelines (with encrypted secrets)

---

## What the Script Does

1. **Accepts seed phrase** via one of the three secure methods
2. **Validates** seed phrase (12 or 24 words)
3. **Derives wallet** using BIP-39 standard
4. **Creates `.env` file** with private key (from `.env.example` template)
5. **Backs up seed phrase** to `.wallet-seed.txt` (gitignored)

---

## Post-Setup Security Checklist

After running the setup script:

### 1. Verify .env is Gitignored

```bash
# Should return: .gitignore:35:*.env	.env
git check-ignore -v .env
```

✅ If you see output, `.env` is ignored
❌ If no output, **STOP and add `*.env` to `.gitignore`**

### 2. Back Up Seed Phrase

```bash
# The script creates .wallet-seed.txt
cat .wallet-seed.txt
```

**Action Required:**
1. Copy seed phrase to encrypted password manager (1Password, Bitwarden, etc.)
2. Verify backup is accessible
3. **Delete `.wallet-seed.txt` from disk:**

```bash
rm .wallet-seed.txt
```

### 3. Verify Git Status

```bash
# Should NOT show .env or .wallet-seed.txt
git status
```

✅ Good: `.env` and seed files not listed
❌ Bad: If listed, **do NOT commit** - add to `.gitignore` first

### 4. Fund Deployment Wallet

```bash
# Get wallet address from .env setup output
# Or check:
grep "Deploying with account" deployments/base-mainnet.json
```

**Funding Requirements:**
- **Base Mainnet:** ≥0.005 ETH (for deployment + gas)
- **Cronos Mainnet:** ≥10 CRO (for AKT channel deployment)

---

## Rotating Compromised Keys

If your seed phrase or private key is compromised:

### Immediate Actions

1. **Stop all deployments** using the compromised wallet
2. **Transfer all funds** to a new secure wallet
3. **Generate new seed phrase** using a hardware wallet or secure method
4. **Update `.env`** with new private key
5. **Re-deploy contracts** from new wallet address

### Update Environment

```bash
# Generate new wallet
npx ts-node scripts/setup-wallet-from-seed.ts

# Verify new address
grep PRIVATE_KEY .env

# Update all deployed contract ownership if needed
```

---

## Git History Cleanup

If a seed phrase was accidentally committed:

### Check Git History

```bash
# Search entire history for seed phrases or private keys
git log -p -S "seed" --all
git log -p -S "PRIVATE_KEY" --all
```

### Remove from History (DESTRUCTIVE)

⚠️ **WARNING:** This rewrites git history. Coordinate with team first.

```bash
# Install BFG Repo-Cleaner (recommended method)
brew install bfg  # macOS
# or download from: https://rtyley.github.io/bfg-repo-cleaner/

# Remove file from all commits
bfg --delete-files .env
bfg --delete-files .wallet-seed.txt

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (requires team coordination)
git push --force
```

**After cleanup:**
- Rotate all compromised keys immediately
- Notify team members to re-clone repository

---

## CI/CD Integration (GitHub Actions)

For automated deployments, use **GitHub Secrets**:

### Setup

1. Go to: `Settings → Secrets and variables → Actions`
2. Create secret: `WALLET_SEED_PHRASE`
3. Paste seed phrase (store backup in 1Password)

### Usage in Workflow

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup wallet
        env:
          WALLET_SEED_PHRASE: ${{ secrets.WALLET_SEED_PHRASE }}
        run: |
          npx ts-node scripts/setup-wallet-from-seed.ts

      - name: Deploy contracts
        run: |
          npx hardhat run scripts/deploy-base-factory.ts --network base
```

**Security:**
- ✅ Secret encrypted by GitHub
- ✅ Not visible in logs
- ✅ Only accessible to authorized workflows

---

## Security Best Practices

### DO ✅

- Use hardware wallets for production (Ledger, Trezor)
- Enable 2FA on all related accounts (GitHub, BaseScan, etc.)
- Use separate wallets for testnet and mainnet
- Regularly audit `.gitignore` effectiveness
- Keep seed phrases in encrypted password managers
- Use multi-sig wallets for high-value deployments

### DON'T ❌

- Hardcode seed phrases in source code
- Commit `.env` files to git
- Share private keys via email/Slack/Discord
- Store seed phrases in plaintext files
- Reuse deployment wallets across projects
- Deploy from personal wallets with large balances

---

## Emergency Contacts

If you discover a security vulnerability:

1. **Do NOT create public GitHub issue**
2. **Email security team** (if applicable)
3. **Rotate keys immediately**
4. **Document incident** for post-mortem

---

## Additional Resources

- **BIP-39 Specification:** https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
- **Hardhat Security:** https://hardhat.org/hardhat-runner/docs/guides/deploying
- **OpenZeppelin Security:** https://docs.openzeppelin.com/defender/
- **GitHub Secrets:** https://docs.github.com/en/actions/security-guides/encrypted-secrets

---

**Last Updated:** 2025-12-05
**Maintained By:** Quinn (Test Architect) - Security Review
