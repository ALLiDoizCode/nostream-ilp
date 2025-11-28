# Prerequisites for CosmWasm Local Testnet

This document outlines all prerequisites for setting up a local CosmWasm testnet environment for AKT custody contract development.

## Operating System Requirements

### macOS (Primary - Tested on Darwin 23.5.0)

**System Requirements:**
- macOS 12 (Monterey) or later
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space
- Intel or Apple Silicon (M1/M2/M3)

**Package Manager:**
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Linux (Ubuntu/Debian)

**System Requirements:**
- Ubuntu 20.04 LTS or later
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space

**Package Manager:**
```bash
sudo apt-get update
sudo apt-get upgrade
```

### Windows (WSL2)

**Requirements:**
- Windows 10 version 2004+ or Windows 11
- WSL2 enabled
- Ubuntu 20.04+ WSL distribution
- 8GB RAM minimum (16GB recommended)

**Enable WSL2:**
```powershell
wsl --install
wsl --set-default-version 2
```

## Core Development Tools

### 1. Rust Toolchain

Rust is the primary language for CosmWasm smart contracts.

**Installation:**
```bash
# Install rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Source the environment
source $HOME/.cargo/env

# Verify installation
rustc --version  # Should be 1.70.0 or later
cargo --version
```

**Required Version:** Rust 1.70.0 or later

**Add Wasm Target:**
```bash
# Required for compiling to WebAssembly
rustup target add wasm32-unknown-unknown

# Verify
rustup target list --installed | grep wasm32
```

**Optional Rust Components:**
```bash
# Formatting
rustup component add rustfmt

# Linting
rustup component add clippy
```

### 2. Go Language

Required for wasmd and Cosmos SDK tools.

**macOS:**
```bash
brew install go

# Verify
go version  # Should be 1.21.0 or later
```

**Linux:**
```bash
# Download Go (check for latest version)
wget https://go.dev/dl/go1.21.6.linux-amd64.tar.gz

# Extract
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.6.linux-amd64.tar.gz

# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH=$PATH:/usr/local/go/bin
export PATH=$PATH:$HOME/go/bin

# Reload
source ~/.bashrc  # or source ~/.zshrc

# Verify
go version
```

**Required Version:** Go 1.21.0 or later

### 3. Docker and Docker Compose

Required for Docker-based setups and cosmwasm-optimizer.

**macOS:**
```bash
# Install Docker Desktop
brew install --cask docker

# Start Docker Desktop application
open /Applications/Docker.app

# Verify
docker --version
docker-compose --version  # or docker compose version
```

**Linux:**
```bash
# Install Docker
sudo apt-get install docker.io docker-compose

# Add user to docker group (avoid sudo)
sudo usermod -aG docker $USER
newgrp docker

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify
docker --version
docker-compose --version
```

**Required Versions:**
- Docker: 20.10.0 or later
- Docker Compose: 1.29.0 or later (or Docker Compose V2)

### 4. Node.js and npm (Optional)

Useful for client-side tooling and scripts.

**macOS:**
```bash
brew install node

# Verify
node --version
npm --version
```

**Linux:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

**Recommended Version:** Node.js 18.x or later

## CosmWasm-Specific Tools

### 1. cosmwasm-check

Validates that Wasm binaries are proper smart contracts.

**Installation:**
```bash
cargo install cosmwasm-check

# Verify
cosmwasm-check --version
```

**Purpose:** Validates contracts before upload to ensure they meet CosmWasm standards.

### 2. cosmwasm-optimizer (Docker-based)

No installation needed - runs as Docker container.

**Verify Docker Images:**
```bash
# Pull optimizer image
docker pull cosmwasm/optimizer:0.16.0

# Pull rust-optimizer (single contract)
docker pull cosmwasm/rust-optimizer:0.16.0
```

**Purpose:** Produces optimized, deterministic Wasm binaries with minimal size.

### 3. wasmd (Optional for Native Setup)

The Cosmos SDK application with WebAssembly support.

**Installation (Native):**
```bash
# Clone repository
git clone https://github.com/CosmWasm/wasmd.git
cd wasmd

# Checkout stable version
git checkout v0.50.0  # Or latest stable

# Build and install
make install

# Verify
wasmd version
```

**Installation (Pre-built Binary):**
```bash
# macOS/Linux - check releases page for binaries
# https://github.com/CosmWasm/wasmd/releases

# Example for macOS arm64
wget https://github.com/CosmWasm/wasmd/releases/download/v0.50.0/wasmd-darwin-arm64
chmod +x wasmd-darwin-arm64
sudo mv wasmd-darwin-arm64 /usr/local/bin/wasmd

# Verify
wasmd version
```

**Required for:** Native binary setup (not needed for Docker approach)

## Editor and IDE Setup

### Recommended: Visual Studio Code

**Installation:**
```bash
# macOS
brew install --cask visual-studio-code

# Linux
sudo snap install code --classic
```

**Recommended Extensions:**
- rust-analyzer: Rust language support
- Even Better TOML: TOML syntax highlighting
- Docker: Docker file support
- CosmWasm IDE: CosmWasm-specific tooling

**Install Extensions:**
```bash
code --install-extension rust-lang.rust-analyzer
code --install-extension tamasfe.even-better-toml
code --install-extension ms-azuretools.vscode-docker
```

## Version Compatibility Matrix

| Tool | Minimum Version | Recommended Version | Notes |
|------|----------------|---------------------|-------|
| Rust | 1.70.0 | 1.75.0+ | Latest stable recommended |
| Go | 1.21.0 | 1.21.6+ | Required for wasmd |
| Docker | 20.10.0 | Latest | For optimizer and compose |
| Docker Compose | 1.29.0 | 2.x | V2 preferred |
| cosmwasm-std | 2.0.0 | 2.0.x | Contract dependency |
| wasmd | 0.45.0 | 0.50.0+ | Latest stable |
| cosmwasm-check | 2.0.0 | Latest | Matches cosmwasm-std |
| Node.js | 18.0.0 | 20.x | Optional |

## Directory Structure Recommendations

### Project Organization

```bash
# Create development workspace
mkdir -p ~/cosmwasm-dev
cd ~/cosmwasm-dev

# Structure
~/cosmwasm-dev/
├── contracts/           # Your contract projects
│   └── akt-custody/
├── testnet/            # Local testnet data
│   ├── docker/         # Docker compose files
│   └── native/         # Native wasmd data
├── scripts/            # Automation scripts
└── tools/              # Additional tools
```

### Create Structure:
```bash
mkdir -p ~/cosmwasm-dev/{contracts,testnet/{docker,native},scripts,tools}
```

## Validation Checklist

Run these commands to verify your environment is ready:

```bash
# Rust
rustc --version
cargo --version
rustup target list --installed | grep wasm32-unknown-unknown

# Go
go version

# Docker
docker --version
docker-compose --version
docker ps

# CosmWasm Tools
cosmwasm-check --version

# Optional: wasmd (if using native approach)
wasmd version

# Optional: Node.js
node --version
npm --version
```

**Expected Output Example:**
```
rustc 1.75.0 (82e1608df 2023-12-21)
cargo 1.75.0 (1d8b05cdd 2023-11-20)
wasm32-unknown-unknown (installed)
go version go1.21.6 darwin/arm64
Docker version 24.0.7, build afdd53b
Docker Compose version v2.23.3
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
cosmwasm-check 2.0.3
wasmd version v0.50.0
v20.11.0
10.2.4
```

## Troubleshooting Prerequisites

### Rust Installation Issues

**Problem:** `rustup: command not found`
**Solution:**
```bash
source $HOME/.cargo/env
# Add to ~/.bashrc or ~/.zshrc for persistence
echo 'source $HOME/.cargo/env' >> ~/.zshrc
```

**Problem:** Cannot add wasm32 target
**Solution:**
```bash
# Update rustup
rustup update

# Retry
rustup target add wasm32-unknown-unknown
```

### Go Installation Issues

**Problem:** `go: command not found` after installation
**Solution:**
```bash
# Check if Go is in PATH
echo $PATH | grep /usr/local/go/bin

# If not, add to shell config
export PATH=$PATH:/usr/local/go/bin
export PATH=$PATH:$HOME/go/bin
```

### Docker Permission Issues (Linux)

**Problem:** `permission denied while trying to connect to the Docker daemon`
**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker

# Verify
docker ps
```

### macOS-Specific: Docker Desktop Not Starting

**Problem:** Docker Desktop fails to start
**Solution:**
```bash
# Reset Docker Desktop
rm -rf ~/Library/Group\ Containers/group.com.docker
rm -rf ~/Library/Containers/com.docker.docker
rm -rf ~/.docker

# Restart Docker Desktop
open /Applications/Docker.app
```

## Next Steps

Once all prerequisites are installed and verified:

1. **Docker Setup:** Proceed to [Docker Setup Guide](./docker-setup.md)
2. **Native Setup:** Proceed to [Native Setup Guide](./native-setup.md)
3. **Token Configuration:** See [Akash Token Configuration](./akash-token-config.md)

## Additional Resources

- **Rust Installation:** https://rustup.rs/
- **Go Installation:** https://go.dev/doc/install
- **Docker Installation:** https://docs.docker.com/get-docker/
- **CosmWasm Book:** https://book.cosmwasm.com/
- **wasmd Repository:** https://github.com/CosmWasm/wasmd

---

*Last Updated: 2025-11-28*
*Environment: macOS Darwin 23.5.0*
