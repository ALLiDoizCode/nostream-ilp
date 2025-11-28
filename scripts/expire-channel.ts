import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Channel ID from the test - update this when running
  const channelId = process.argv[2] || "0x3ebb2d353af165d13f5ad47265b2d7ecb057df0a64b6b6579e6559e902674436";

  console.log("\n==========================================");
  console.log("Expire Channel on Cronos Testnet");
  console.log("==========================================\n");

  const [deployer] = await ethers.getSigners();
  console.log("Expiring with account:", deployer.address);
  console.log("Channel ID:", channelId);

  const channelAddress = process.env.CRONOS_TESTNET_CHANNEL_ADDRESS;
  const mockAktAddress = process.env.CRONOS_TESTNET_MOCK_AKT_ADDRESS;

  if (!channelAddress || !mockAktAddress) {
    throw new Error("Contract addresses not found in .env file");
  }

  const CronosPaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
  const channel = CronosPaymentChannel.attach(channelAddress);

  const MockAKT = await ethers.getContractFactory("MockAKT");
  const mockAkt = MockAKT.attach(mockAktAddress);

  // Check channel state before expiration
  const channelData = await channel.getChannel(channelId);
  console.log("\nChannel state:");
  console.log("  Balance:", ethers.formatUnits(channelData.balance, 6), "AKT");
  console.log("  Expiration:", new Date(Number(channelData.expiration) * 1000).toISOString());
  console.log("  Is Closed:", channelData.isClosed);

  const currentTime = Math.floor(Date.now() / 1000);
  console.log("\nCurrent time:", new Date(currentTime * 1000).toISOString());

  if (currentTime <= Number(channelData.expiration)) {
    const waitTime = Number(channelData.expiration) - currentTime;
    console.log(`\n⚠ Channel not yet expired. Wait ${waitTime} seconds (${Math.ceil(waitTime / 60)} minutes)`);
    return;
  }

  // Get balance before expiration
  const balanceBefore = await mockAkt.balanceOf(deployer.address);
  console.log("\nDeployer AKT balance before expiration:", ethers.formatUnits(balanceBefore, 6), "AKT");

  // Expire the channel
  console.log("\nExpiring channel...");
  const expireTx = await channel.expireChannel(channelId);
  console.log("Transaction hash:", expireTx.hash);
  const receipt = await expireTx.wait();
  console.log("✓ Channel expired");
  console.log("Gas used:", receipt?.gasUsed.toString());

  // Get balance after expiration
  const balanceAfter = await mockAkt.balanceOf(deployer.address);
  console.log("\nDeployer AKT balance after expiration:", ethers.formatUnits(balanceAfter, 6), "AKT");

  const refund = balanceAfter - balanceBefore;
  console.log("Refunded amount:", ethers.formatUnits(refund, 6), "AKT");

  if (refund === channelData.balance) {
    console.log("✓ Full refund received");
  } else {
    console.log("⚠ Unexpected refund amount");
  }

  console.log("\n==========================================");
  console.log("Channel Expiration Complete");
  console.log("==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
