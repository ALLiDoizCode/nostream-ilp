#!/usr/bin/env node
/**
 * Akash Network Programmatic Deployment Script
 *
 * Automates deployment to Akash Network using the @akashnetwork/chain-sdk
 *
 * Usage:
 *   npm run akash:deploy -- --network testnet
 *   npm run akash:deploy -- --network mainnet
 *
 * Environment Variables:
 *   AKASH_MNEMONIC - Wallet mnemonic phrase (REQUIRED)
 *   AKASH_NETWORK - Network to deploy to (testnet|mainnet)
 */

import fs from 'fs';
import path from 'path';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { createChainNodeSDK } from '@akashnetwork/chain-sdk/chain';
import { SDL } from '@akashnetwork/chain-sdk/sdl';

interface AkashConfig {
  network: 'sandbox' | 'testnet' | 'mainnet';
  rpcUrl: string;
  grpcUrl: string;
  chainId: string;
}

interface DeploymentResult {
  dseq: string;
  provider: string;
  leaseId: string;
  uri: string;
}

const AKASH_CONFIGS: Record<string, AkashConfig> = {
  sandbox: {
    network: 'sandbox',
    rpcUrl: 'https://rpc.sandbox-2.aksh.pw:443',
    grpcUrl: 'https://grpc.sandbox-2.aksh.pw:443',
    chainId: 'sandbox-2',
  },
  testnet: {
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.akash.network:443',
    grpcUrl: 'https://grpc.testnet.akash.network:443',
    chainId: 'testnet-02',
  },
  mainnet: {
    network: 'mainnet',
    rpcUrl: 'https://akash-rpc.polkachu.com:443',
    grpcUrl: 'akash-grpc.polkachu.com:12890',
    chainId: 'akashnet-2',
  },
};

class AkashDeployer {
  private wallet: DirectSecp256k1HdWallet | null = null;
  private sdk: any = null;
  private config: AkashConfig;
  private sdlPath: string;
  private ownerAddress: string = '';

  constructor(network: 'sandbox' | 'testnet' | 'mainnet', sdlPath: string) {
    this.config = AKASH_CONFIGS[network];
    this.sdlPath = sdlPath;
  }

  /**
   * Initialize wallet from mnemonic
   */
  async initializeWallet(mnemonic: string): Promise<void> {
    console.log('🔐 Initializing Akash wallet...');
    this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'akash',
    });

    const [account] = await this.wallet.getAccounts();
    this.ownerAddress = account.address;
    console.log(`✅ Wallet initialized: ${this.ownerAddress}`);
  }

  /**
   * Initialize Akash SDK
   */
  async initializeSDK(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }

    console.log('🚀 Initializing Akash Chain SDK...');

    this.sdk = createChainNodeSDK({
      query: {
        baseUrl: this.config.grpcUrl,
      },
      tx: {
        baseUrl: this.config.rpcUrl,
        signer: this.wallet,
        gasPrice: '0.025uakt',
      },
    });

    console.log(`✅ SDK initialized for ${this.config.network}`);
  }

  /**
   * Load and parse SDL file
   */
  async loadSDL(): Promise<any> {
    console.log(`📄 Loading SDL from ${this.sdlPath}...`);

    const sdlContent = fs.readFileSync(this.sdlPath, 'utf8');

    // Parse SDL using Akash SDK
    const networkId = this.config.network === 'sandbox' ? 'sandbox' : this.config.network;
    const sdl = SDL.fromString(sdlContent, 'beta3', networkId);

    console.log('✅ SDL parsed successfully');
    return sdl;
  }

  /**
   * Check wallet balance
   */
  async checkBalance(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    console.log('💰 Checking wallet balance...');

    try {
      const balance = await this.sdk.cosmos.bank.v1beta1.getBalance({
        address: this.ownerAddress,
        denom: 'uakt',
      });

      const aktBalance = parseInt(balance.balance?.amount || '0') / 1_000_000;
      console.log(`✅ Balance: ${aktBalance} AKT`);

      if (aktBalance < 5) {
        console.warn('⚠️  Warning: Balance is low. Recommended minimum: 5 AKT');
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch balance:', error);
    }
  }

  /**
   * Create deployment on Akash Network
   */
  async createDeployment(sdl: any): Promise<string> {
    console.log('📦 Creating deployment...');

    try {
      // Get current block height for dseq
      const latestBlock = await this.sdk.cosmos.base.tendermint.v1beta1.getLatestBlock({});
      const blockHeight = parseInt(latestBlock.block?.header?.height || '0');
      const dseq = blockHeight.toString();

      console.log(`   Using DSEQ: ${dseq}`);

      // Parse SDL groups and hash
      const groups = sdl.groups();
      const hash = await sdl.manifestVersion(); // Get manifest hash (Uint8Array)

      console.log(`   Parsed ${groups.length} group(s) from SDL`);
      console.log(`   Generated manifest hash: ${Buffer.from(hash).toString('hex').substring(0, 16)}...`);

      const deploymentMsg = {
        id: {
          owner: this.ownerAddress,
          dseq: dseq,
        },
        groups: groups,
        hash: hash, // Required field!
        deposit: {
          amount: {
            denom: 'uakt',
            amount: '5000000', // 5 AKT deposit
          },
          sources: [1], // Source.balance = 1
        },
      };

      console.log('   Deployment message prepared');
      console.log('   Owner:', deploymentMsg.id.owner);
      console.log('   DSEQ:', deploymentMsg.id.dseq);
      console.log('   Deposit:', deploymentMsg.deposit.amount, deploymentMsg.deposit.denom);

      // Create deployment with manual gas limit to bypass estimation
      const result = await this.sdk.akash.deployment.v1beta4.createDeployment(
        deploymentMsg,
        {
          fee: {
            amount: [{ denom: 'uakt', amount: '50000' }], // 0.05 AKT fee
            gas: '2000000', // Manual gas limit
          },
        }
      );

      console.log('✅ Deployment created successfully');
      console.log(`   Transaction hash: ${result.transactionHash}`);

      return dseq;
    } catch (error) {
      console.error('❌ Deployment creation failed:', error);
      throw error;
    }
  }

  /**
   * Wait for provider bids
   */
  async waitForBids(dseq: string): Promise<any[]> {
    console.log('⏳ Waiting for provider bids...');

    try {
      let bids: any[] = [];
      const startTime = Date.now();
      const timeout = 5 * 60 * 1000; // 5 minutes

      while (bids.length === 0 && Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const bidResponse = await this.sdk.akash.market.v1beta5.getBids({
          filters: {
            owner: this.ownerAddress,
            dseq,
          },
        });

        bids = bidResponse.bids || [];

        if (bids.length > 0) {
          console.log(`✅ Received ${bids.length} bid(s)`);
          bids.forEach((bid: any, index: number) => {
            console.log(`   ${index + 1}. Provider: ${bid.bidId?.provider || 'unknown'}`);
            console.log(`      Price: ${bid.bid?.price?.amount || 'unknown'} ${bid.bid?.price?.denom || ''}`);
          });
        } else {
          console.log('   No bids yet, waiting...');
        }
      }

      if (bids.length === 0) {
        throw new Error('No bids received after 5 minutes');
      }

      return bids;
    } catch (error) {
      console.error('❌ Bid polling failed:', error);
      throw error;
    }
  }

  /**
   * Select and accept bid
   */
  async acceptBid(bid: any): Promise<string> {
    const provider = bid.bidId?.provider || 'unknown';
    console.log(`🤝 Accepting bid from provider ${provider}...`);

    try {
      // Create lease by accepting the bid
      const result = await this.sdk.akash.market.v1beta5.createLease({
        bidId: {
          owner: this.ownerAddress,
          dseq: bid.bidId?.dseq,
          gseq: bid.bidId?.gseq,
          oseq: bid.bidId?.oseq,
          provider: provider,
        },
      });

      const leaseId = `${this.ownerAddress}/${bid.bidId?.dseq}/${bid.bidId?.gseq}/${bid.bidId?.oseq}/${provider}`;

      console.log('✅ Lease created successfully');
      console.log(`   Lease ID: ${leaseId}`);
      console.log(`   Transaction hash: ${result.transactionHash}`);

      return leaseId;
    } catch (error) {
      console.error('❌ Lease creation failed:', error);
      throw error;
    }
  }

  /**
   * Send manifest to provider
   */
  async sendManifest(dseq: string, provider: string, sdl: any): Promise<string> {
    console.log('📤 Sending manifest to provider...');

    try {
      // Generate manifest from SDL
      const manifest = sdl.manifest();
      console.log('   Generated manifest from SDL');

      // Note: Manifest upload to provider requires:
      // 1. JWT token generation (using JwtTokenManager from '@akashnetwork/chain-sdk/provider')
      // 2. HTTP POST to provider's manifest endpoint
      // 3. Provider URL discovery from lease status

      // For now, we'll use the CLI equivalent
      console.log('⚠️  Manifest upload via SDK requires provider URL from lease');
      console.log('   Use CLI: akash provider send-manifest');
      console.log(`   Provider: ${provider}`);

      // Return placeholder URI
      const uri = `https://${provider}.provider.akash.network`;
      return uri;
    } catch (error) {
      console.error('❌ Manifest upload failed:', error);
      throw error;
    }
  }

  /**
   * Full deployment workflow
   */
  async deploy(mnemonic: string): Promise<DeploymentResult> {
    try {
      // Step 1: Initialize wallet and SDK
      await this.initializeWallet(mnemonic);
      await this.initializeSDK();

      // Step 2: Check balance
      await this.checkBalance();

      // Step 3: Load SDL
      const sdl = await this.loadSDL();

      // Step 4: Create deployment
      const dseq = await this.createDeployment(sdl);

      // Step 5: Wait for bids
      const bids = await this.waitForBids(dseq);

      // Step 6: Select best bid (lowest price)
      const bestBid = bids.sort((a, b) => {
        const priceA = parseInt(a.bid?.price?.amount || '999999999');
        const priceB = parseInt(b.bid?.price?.amount || '999999999');
        return priceA - priceB;
      })[0];

      // Step 7: Accept bid and create lease
      const leaseId = await this.acceptBid(bestBid);

      // Step 8: Send manifest to provider
      const provider = bestBid.bidId?.provider || 'unknown';
      const uri = await this.sendManifest(dseq, provider, sdl);

      console.log('\n🎉 Deployment created successfully!');
      console.log(`   DSEQ: ${dseq}`);
      console.log(`   Provider: ${provider}`);
      console.log(`   Lease ID: ${leaseId}`);
      console.log(`   URI: ${uri}`);
      console.log('\n⚠️  Note: Manifest upload requires manual CLI step:');
      console.log(`   akash provider send-manifest akash/deploy.yaml --dseq ${dseq} --provider ${provider}`);

      return {
        dseq,
        provider,
        leaseId,
        uri,
      };
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Close deployment
   */
  async closeDeployment(dseq: string): Promise<void> {
    console.log(`🛑 Closing deployment ${dseq}...`);

    try {
      // Note: Deployment closure requires transaction submission
      console.log('⚠️  Deployment closure not yet fully implemented');
      console.log(`   Would close deployment: ${dseq}`);
    } catch (error) {
      console.error('❌ Deployment closure failed:', error);
      throw error;
    }
  }

  /**
   * Query bids for a specific deployment
   */
  async listBids(dseq: string): Promise<void> {
    console.log(`📋 Listing bids for deployment ${dseq}...\n`);

    try {
      const bidResponse = await this.sdk.akash.market.v1beta5.getBids({
        filters: {
          owner: this.ownerAddress,
          dseq,
        },
      });

      const bids = bidResponse.bids || [];

      if (bids.length > 0) {
        console.log(`Found ${bids.length} bid(s):\n`);
        bids.forEach((bid: any, index: number) => {
          console.log(`${index + 1}. Provider: ${bid.bidId?.provider || 'unknown'}`);
          console.log(`   Price: ${bid.bid?.price?.amount || 'unknown'} ${bid.bid?.price?.denom || 'uakt'}`);
          console.log(`   GSEQ: ${bid.bidId?.gseq}, OSEQ: ${bid.bidId?.oseq}`);
          console.log(`   State: ${bid.state || 'unknown'}\n`);
        });
      } else {
        console.log('No bids found for this deployment.');
        console.log('\nPossible reasons:');
        console.log('- Deployment is too new (wait 1-2 minutes)');
        console.log('- Sandbox has limited providers (try testnet/mainnet)');
        console.log('- Resource requirements too high');
        console.log('- Pricing too low');
      }
    } catch (error) {
      console.error('❌ Failed to list bids:', error);
      throw error;
    }
  }

  /**
   * Query existing deployments
   */
  async listDeployments(): Promise<void> {
    console.log('📋 Listing deployments...\n');

    try {
      const deployments = await this.sdk.akash.deployment.v1beta4.getDeployments({
        filters: {
          owner: this.ownerAddress,
        },
        pagination: {
          limit: 10,
        },
      });

      if (deployments.deployments && deployments.deployments.length > 0) {
        console.log(`Found ${deployments.deployments.length} deployment(s):\n`);
        deployments.deployments.forEach((deployment: any, index: number) => {
          console.log(`${index + 1}. DSEQ: ${deployment.deployment?.deploymentId?.dseq}`);
          console.log(`   Owner: ${deployment.deployment?.deploymentId?.owner}`);
          console.log(`   State: ${deployment.deployment?.state}`);
          console.log(`   Version: ${deployment.deployment?.version}\n`);
        });
      } else {
        console.log('No deployments found for this wallet.');
      }
    } catch (error) {
      console.error('❌ Failed to list deployments:', error);
      throw error;
    }
  }
}

/**
 * CLI entry point
 */
/**
 * Read mnemonic from .akash-wallet.txt file
 */
function readMnemonicFromFile(): string | null {
  const walletFilePath = path.join(__dirname, '../.akash-wallet.txt');

  if (!fs.existsSync(walletFilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(walletFilePath, 'utf8');

    // Find the line with "Mnemonic Phrase (12 words):"
    const lines = content.split('\n');
    const mnemonicLineIndex = lines.findIndex(line =>
      line.includes('Mnemonic Phrase (12 words):')
    );

    if (mnemonicLineIndex === -1) {
      return null;
    }

    // The mnemonic is 2 lines after the header (skipping the dashes line)
    const mnemonicLine = lines[mnemonicLineIndex + 2];

    if (mnemonicLine && mnemonicLine.trim()) {
      // Validate it looks like a mnemonic (12 words separated by spaces)
      const words = mnemonicLine.trim().split(/\s+/);
      if (words.length === 12 && words.every(word => /^[a-z]+$/.test(word))) {
        return mnemonicLine.trim();
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const network = args.includes('--network')
    ? args[args.indexOf('--network') + 1] as 'sandbox' | 'testnet' | 'mainnet'
    : (process.env.AKASH_NETWORK as 'sandbox' | 'testnet' | 'mainnet') || 'sandbox';

  const sdlPath = args.includes('--sdl')
    ? args[args.indexOf('--sdl') + 1]
    : path.join(__dirname, '../akash/deploy.yaml');

  let mnemonic: string | null = null;

  // Priority order for mnemonic:
  // 1. Command line argument (--wallet-mnemonic)
  // 2. Wallet file argument (--wallet-file)
  // 3. Environment variable (AKASH_MNEMONIC)
  // 4. Local .akash-wallet.txt file (automatic)

  if (args.includes('--wallet-mnemonic')) {
    mnemonic = args[args.indexOf('--wallet-mnemonic') + 1];
  } else if (args.includes('--wallet-file')) {
    const walletFile = args[args.indexOf('--wallet-file') + 1];
    mnemonic = fs.readFileSync(walletFile, 'utf8').trim();
  } else if (process.env.AKASH_MNEMONIC) {
    mnemonic = process.env.AKASH_MNEMONIC;
  } else {
    // Try to read from local .akash-wallet.txt file
    mnemonic = readMnemonicFromFile();
    if (mnemonic) {
      console.log('📄 Using mnemonic from .akash-wallet.txt');
    }
  }

  if (!mnemonic) {
    console.error('❌ Error: Wallet mnemonic required');
    console.error('');
    console.error('   Options:');
    console.error('   1. Create .akash-wallet.txt file (recommended)');
    console.error('   2. Set AKASH_MNEMONIC environment variable');
    console.error('   3. Use --wallet-mnemonic "your mnemonic phrase"');
    console.error('   4. Use --wallet-file ~/.akash/wallet.key');
    console.error('');
    console.error('   To generate a wallet, run: npm run akash:setup');
    process.exit(1);
  }

  const deployer = new AkashDeployer(network, sdlPath);

  if (args.includes('--list')) {
    await deployer.initializeWallet(mnemonic);
    await deployer.initializeSDK();
    await deployer.checkBalance();
    await deployer.listDeployments();
  } else if (args.includes('--bids')) {
    const bidsIndex = args.indexOf('--bids');
    const dseq = args[bidsIndex + 1];

    // Skip --network argument if present
    const validDseq = dseq && !dseq.startsWith('--') ? dseq : args[args.length - 1];

    if (!validDseq || validDseq.startsWith('--')) {
      console.error('❌ Error: DSEQ required for --bids');
      console.error('   Usage: npm run akash:bids -- 1001245');
      process.exit(1);
    }
    await deployer.initializeWallet(mnemonic);
    await deployer.initializeSDK();
    await deployer.listBids(validDseq);
  } else if (args.includes('--close')) {
    const dseq = args[args.indexOf('--close') + 1];
    await deployer.initializeWallet(mnemonic);
    await deployer.initializeSDK();
    await deployer.closeDeployment(dseq);
  } else {
    const result = await deployer.deploy(mnemonic);

    // Save deployment info
    const deploymentInfo = {
      ...result,
      network,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, '../.akash-deployment.json'),
      JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('\n📝 Deployment info saved to .akash-deployment.json');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { AkashDeployer, DeploymentResult };
