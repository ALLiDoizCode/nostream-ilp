import { ethers } from "hardhat";

/**
 * Deploy CronosPaymentChannel to Cronos Mainnet
 *
 * This script:
 * 1. Verifies deployer account has sufficient CRO for gas
 * 2. Deploys CronosPaymentChannel with mainnet AKT token address
 * 3. Logs deployed address and transaction hash
 *
 * Prerequisites:
 * - PRIVATE_KEY set in .env (deployer account with sufficient CRO)
 * - Deployer account funded with ~10 CRO for deployment + gas buffer
 * - CRONOSCAN_API_KEY set in .env (for verification)
 *
 * Security Notes:
 * - This deploys to MAINNET using real funds
 * - Ensure deployer account is secure (hardware wallet recommended)
 * - Verify network configuration before deployment
 * - Have 10+ CRO available for deployment gas costs
 *
 * Usage:
 * npx hardhat run scripts/deploy-cronos-mainnet.ts --network cronos-mainnet
 *
 * After deployment, verify contract:
 * npx hardhat verify --network cronos-mainnet <CHANNEL_ADDRESS> 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
 */

// Mainnet AKT token address (bridged from Akash via IBC)
const MAINNET_AKT_ADDRESS = "0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3";

// Minimum CRO balance required for deployment (10 CRO buffer)
const MIN_CRO_BALANCE = ethers.parseEther("10");

async function main() {
  // Get deployer signer
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("==========================================");
  console.log("⚠️  CRONOS MAINNET DEPLOYMENT");
  console.log("==========================================");
  console.log("Deploying with account:", deployerAddress);

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("Network name:", network.name);
  console.log("Chain ID:", network.chainId.toString());

  // Verify we're on mainnet
  if (network.chainId !== 25n) {
    throw new Error(`Wrong network! Expected Chain ID 25 (Cronos Mainnet), got ${network.chainId}`);
  }

  console.log("\n------------------------------------------");
  console.log("Pre-Deployment Checks");
  console.log("------------------------------------------");

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceInCRO = ethers.formatEther(balance);
  console.log("Deployer balance:", balanceInCRO, "CRO");

  if (balance < MIN_CRO_BALANCE) {
    throw new Error(
      `Insufficient CRO balance. Required: ${ethers.formatEther(MIN_CRO_BALANCE)} CRO, ` +
      `Available: ${balanceInCRO} CRO`
    );
  }

  console.log("✓ Sufficient CRO balance for deployment");

  // Estimate deployment gas cost
  const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
  const deploymentData = PaymentChannel.getDeployTransaction(MAINNET_AKT_ADDRESS);
  const gasEstimate = await ethers.provider.estimateGas({
    data: deploymentData.data,
    from: deployerAddress
  });

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("5000", "gwei"); // Fallback to 5000 gwei
  const estimatedCost = gasEstimate * gasPrice;
  const estimatedCostInCRO = ethers.formatEther(estimatedCost);

  console.log("Estimated deployment gas:", gasEstimate.toString());
  console.log("Current gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated deployment cost:", estimatedCostInCRO, "CRO");

  console.log("\n------------------------------------------");
  console.log("Deployment Configuration");
  console.log("------------------------------------------");
  console.log("Mainnet AKT Token Address:", MAINNET_AKT_ADDRESS);
  console.log("Contract: CronosPaymentChannel");

  console.log("\n⚠️  WARNING: This will deploy to MAINNET using real funds!");
  console.log("Estimated cost:", estimatedCostInCRO, "CRO");
  console.log("\n------------------------------------------");
  console.log("Deploying CronosPaymentChannel...");
  console.log("------------------------------------------");

  // Deploy CronosPaymentChannel
  const channel = await PaymentChannel.deploy(MAINNET_AKT_ADDRESS);
  await channel.waitForDeployment();

  const channelAddress = await channel.getAddress();
  console.log("✓ CronosPaymentChannel deployed to:", channelAddress);
  console.log("  Constructor args: [" + MAINNET_AKT_ADDRESS + "]");
  console.log("  Transaction hash:", channel.deploymentTransaction()?.hash);

  // Check final balance
  const finalBalance = await ethers.provider.getBalance(deployerAddress);
  const actualCost = balance - finalBalance;
  const actualCostInCRO = ethers.formatEther(actualCost);

  console.log("\n------------------------------------------");
  console.log("Deployment Cost");
  console.log("------------------------------------------");
  console.log("Actual deployment cost:", actualCostInCRO, "CRO");
  console.log("Remaining balance:     ", ethers.formatEther(finalBalance), "CRO");

  console.log("\n==========================================");
  console.log("Deployment Summary");
  console.log("==========================================");
  console.log("Network:             Cronos Mainnet");
  console.log("Chain ID:            25");
  console.log("Deployer:            " + deployerAddress);
  console.log("AKT Token (Mainnet): " + MAINNET_AKT_ADDRESS);
  console.log("CronosPaymentChannel:", channelAddress);
  console.log("Deployment Cost:     " + actualCostInCRO + " CRO");
  console.log("\nNext Steps:");
  console.log("1. Save contract address to your .env file:");
  console.log("   CRONOS_MAINNET_CHANNEL_ADDRESS=" + channelAddress);
  console.log("\n2. Verify contract on CronoScan:");
  console.log("   npx hardhat verify --network cronos-mainnet " + channelAddress + " " + MAINNET_AKT_ADDRESS);
  console.log("\n3. View on CronoScan:");
  console.log("   https://cronoscan.com/address/" + channelAddress);
  console.log("\n4. Security Recommendations:");
  console.log("   - Verify contract source code immediately");
  console.log("   - Check constructor args match AKT token address");
  console.log("   - Document deployment in project README");
  console.log("   - Consider rotating deployer key for security");
  console.log("==========================================\n");
}

// Execute deployment
main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
