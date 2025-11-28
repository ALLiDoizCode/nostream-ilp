import { ethers } from "hardhat";

/**
 * Deploy MockAKT and CronosPaymentChannel to Cronos Testnet
 *
 * This script:
 * 1. Deploys MockAKT token contract (6 decimals, for testing)
 * 2. Deploys CronosPaymentChannel with MockAKT address
 * 3. Mints test AKT to deployer for testing channel operations
 * 4. Logs all deployed addresses and transaction hashes
 *
 * Prerequisites:
 * - PRIVATE_KEY set in .env (deployer account)
 * - Deployer account funded with testnet CRO (get from https://cronos.org/faucet)
 * - CRONOSCAN_API_KEY set in .env (for verification)
 *
 * Usage:
 * npx hardhat run scripts/deploy-cronos-testnet.ts --network cronos-testnet
 *
 * After deployment, verify contracts:
 * npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>
 * npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
 */
async function main() {
  // Get deployer signer
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("==========================================");
  console.log("Cronos Testnet Deployment");
  console.log("==========================================");
  console.log("Deploying with account:", deployerAddress);

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("Network name:", network.name);
  console.log("Chain ID:", network.chainId.toString());

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log("Deployer balance:", ethers.formatEther(balance), "TCRO");

  if (balance === 0n) {
    throw new Error("Deployer account has zero balance. Get testnet CRO from https://cronos.org/faucet");
  }

  console.log("\n------------------------------------------");
  console.log("Step 1: Deploy MockAKT Token");
  console.log("------------------------------------------");

  // Deploy MockAKT
  const MockAKT = await ethers.getContractFactory("MockAKT");
  const aktToken = await MockAKT.deploy();
  await aktToken.waitForDeployment();

  const aktAddress = await aktToken.getAddress();
  console.log("✓ MockAKT deployed to:", aktAddress);
  console.log("  Transaction hash:", aktToken.deploymentTransaction()?.hash);

  console.log("\n------------------------------------------");
  console.log("Step 2: Deploy CronosPaymentChannel");
  console.log("------------------------------------------");

  // Deploy CronosPaymentChannel
  const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
  const channel = await PaymentChannel.deploy(aktAddress);
  await channel.waitForDeployment();

  const channelAddress = await channel.getAddress();
  console.log("✓ CronosPaymentChannel deployed to:", channelAddress);
  console.log("  Constructor args: [" + aktAddress + "]");
  console.log("  Transaction hash:", channel.deploymentTransaction()?.hash);

  console.log("\n------------------------------------------");
  console.log("Step 3: Mint Test AKT to Deployer");
  console.log("------------------------------------------");

  // Mint test AKT (10,000 AKT with 6 decimals)
  const mintAmount = ethers.parseUnits("10000", 6);
  console.log("Minting", ethers.formatUnits(mintAmount, 6), "AKT to", deployerAddress);

  const mintTx = await aktToken.mint(deployerAddress, mintAmount);
  await mintTx.wait();
  console.log("✓ Mint transaction confirmed");
  console.log("  Transaction hash:", mintTx.hash);

  // Verify balance
  const aktBalance = await aktToken.balanceOf(deployerAddress);
  console.log("✓ Deployer AKT balance:", ethers.formatUnits(aktBalance, 6), "AKT");

  console.log("\n==========================================");
  console.log("Deployment Summary");
  console.log("==========================================");
  console.log("Network:             Cronos Testnet");
  console.log("Chain ID:            338");
  console.log("Deployer:            " + deployerAddress);
  console.log("MockAKT:             " + aktAddress);
  console.log("CronosPaymentChannel:", channelAddress);
  console.log("\nNext Steps:");
  console.log("1. Save these addresses to your .env file:");
  console.log("   CRONOS_TESTNET_MOCK_AKT_ADDRESS=" + aktAddress);
  console.log("   CRONOS_TESTNET_CHANNEL_ADDRESS=" + channelAddress);
  console.log("\n2. Verify contracts on CronoScan:");
  console.log("   npx hardhat verify --network cronos-testnet " + aktAddress);
  console.log("   npx hardhat verify --network cronos-testnet " + channelAddress + " " + aktAddress);
  console.log("\n3. View on CronoScan:");
  console.log("   MockAKT:             https://testnet.cronoscan.com/address/" + aktAddress);
  console.log("   CronosPaymentChannel: https://testnet.cronoscan.com/address/" + channelAddress);
  console.log("==========================================\n");
}

// Execute deployment
main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
