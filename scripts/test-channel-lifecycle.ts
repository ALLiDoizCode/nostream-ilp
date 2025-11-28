import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("\n==========================================");
  console.log("Cronos Testnet Channel Lifecycle Test");
  console.log("==========================================\n");

  // Get the deployer signer
  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Get contract addresses from environment
  const mockAktAddress = process.env.CRONOS_TESTNET_MOCK_AKT_ADDRESS;
  const channelAddress = process.env.CRONOS_TESTNET_CHANNEL_ADDRESS;

  if (!mockAktAddress || !channelAddress) {
    throw new Error("Contract addresses not found in .env file");
  }

  console.log("MockAKT address:", mockAktAddress);
  console.log("CronosPaymentChannel address:", channelAddress);

  // Get contract instances
  const MockAKT = await ethers.getContractFactory("MockAKT");
  const mockAkt = MockAKT.attach(mockAktAddress);

  const CronosPaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
  const channel = CronosPaymentChannel.attach(channelAddress);

  // Test parameters
  const channelAmount = ethers.parseUnits("1", 6); // 1 AKT with 6 decimals
  const recipient = deployer.address; // Using same address as recipient for simplicity
  const currentTime = Math.floor(Date.now() / 1000);
  const expiration = currentTime + 300; // 5 minutes from now

  console.log("\n------------------------------------------");
  console.log("Initial State");
  console.log("------------------------------------------");

  const initialBalance = await mockAkt.balanceOf(deployer.address);
  console.log("Deployer AKT balance:", ethers.formatUnits(initialBalance, 6), "AKT");

  // Step 1: Approve channel contract
  console.log("\n------------------------------------------");
  console.log("Step 1: Approve Channel Contract");
  console.log("------------------------------------------");
  console.log("Approving", ethers.formatUnits(channelAmount, 6), "AKT...");

  const approveTx = await mockAkt.approve(channelAddress, channelAmount);
  console.log("Approval transaction hash:", approveTx.hash);
  await approveTx.wait();
  console.log("✓ Approval confirmed");

  const allowance = await mockAkt.allowance(deployer.address, channelAddress);
  console.log("Allowance:", ethers.formatUnits(allowance, 6), "AKT");

  // Step 2: Open channel
  console.log("\n------------------------------------------");
  console.log("Step 2: Open Payment Channel");
  console.log("------------------------------------------");
  console.log("Opening channel with:");
  console.log("  Recipient:", recipient);
  console.log("  Amount:", ethers.formatUnits(channelAmount, 6), "AKT");
  console.log("  Expiration:", new Date(expiration * 1000).toISOString());

  const openTx = await channel.openChannel(recipient, expiration, channelAmount);
  console.log("Open channel transaction hash:", openTx.hash);
  const openReceipt = await openTx.wait();
  console.log("✓ Channel opened");

  // Extract channelId from events
  const openEvent = openReceipt?.logs
    .map(log => {
      try {
        return channel.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
      } catch {
        return null;
      }
    })
    .find(event => event?.name === "ChannelOpened");

  if (!openEvent) {
    throw new Error("ChannelOpened event not found");
  }

  const channelId = openEvent.args.channelId;
  console.log("Channel ID:", channelId);

  // Step 3: Verify channel state
  console.log("\n------------------------------------------");
  console.log("Step 3: Verify Channel State");
  console.log("------------------------------------------");

  const channelData = await channel.getChannel(channelId);
  console.log("Channel details:");
  console.log("  Sender:", channelData.sender);
  console.log("  Recipient:", channelData.recipient);
  console.log("  Balance:", ethers.formatUnits(channelData.balance, 6), "AKT");
  console.log("  Expiration:", new Date(Number(channelData.expiration) * 1000).toISOString());
  console.log("  Highest Nonce:", channelData.highestNonce.toString());

  const balanceAfterOpen = await mockAkt.balanceOf(deployer.address);
  console.log("Deployer AKT balance after open:", ethers.formatUnits(balanceAfterOpen, 6), "AKT");

  // Step 4: Wait and expire channel
  console.log("\n------------------------------------------");
  console.log("Step 4: Wait for Expiration");
  console.log("------------------------------------------");
  console.log("Waiting 5 minutes for channel to expire...");
  console.log("(In production, you would wait. For testing, we'll try to expire immediately.)");
  console.log("\nNote: If expiration fails, wait 5 minutes and run:");
  console.log(`  npx hardhat run scripts/expire-channel.ts --network cronosTestnet`);
  console.log(`  Channel ID: ${channelId}`);

  // Try to expire (will fail if not expired yet, which is expected)
  try {
    const expireTx = await channel.expireChannel(channelId);
    console.log("\nExpire channel transaction hash:", expireTx.hash);
    await expireTx.wait();
    console.log("✓ Channel expired");

    // Step 5: Verify final balances
    console.log("\n------------------------------------------");
    console.log("Step 5: Verify Final Balances");
    console.log("------------------------------------------");

    const finalBalance = await mockAkt.balanceOf(deployer.address);
    console.log("Deployer AKT balance after expiration:", ethers.formatUnits(finalBalance, 6), "AKT");
    console.log("Expected:", ethers.formatUnits(initialBalance, 6), "AKT (full refund)");

    const difference = finalBalance - initialBalance;
    if (difference === 0n) {
      console.log("✓ Full refund received");
    } else {
      console.log("⚠ Balance difference:", ethers.formatUnits(difference, 6), "AKT");
    }
  } catch (error: any) {
    console.log("\n⚠ Channel not yet expired (this is expected)");
    console.log("Error:", error.message);
    console.log("\nChannel is active. To complete the test:");
    console.log("1. Wait 5 minutes");
    console.log("2. Run the expire script:");
    console.log(`   npx hardhat run scripts/expire-channel.ts --network cronosTestnet`);
    console.log(`3. Use Channel ID: ${channelId}`);
  }

  console.log("\n==========================================");
  console.log("Channel Lifecycle Test Complete");
  console.log("==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
