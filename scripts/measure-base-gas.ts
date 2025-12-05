import { ethers } from "hardhat";

async function main() {
  console.log("📊 Base Mainnet Gas Cost Measurement\n");

  const factoryAddress = "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F";
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const [sender] = await ethers.getSigners();
  // Create a deterministic test recipient address
  const recipient = ethers.Wallet.createRandom();
  console.log("Test accounts:");
  console.log("  Sender:", sender.address);
  console.log("  Recipient:", recipient.address);

  // Get factory contract
  const factory = await ethers.getContractAt("MultiTokenPaymentChannelFactory", factoryAddress);

  // Fetch current gas price
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  console.log("\nCurrent gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");

  // ETH price assumption for USD calculation
  const ethPriceUSD = 3000;
  console.log("ETH price assumption: $", ethPriceUSD);

  const measurements: Array<{ operation: string; gasUsed: bigint; ethCost: string; usdCost: string }> = [];

  console.log("\n" + "=".repeat(80));
  console.log("ETH CHANNEL OPERATIONS");
  console.log("=".repeat(80));

  // 1. Open ETH channel
  console.log("\n1️⃣  Opening ETH channel...");
  const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const ethAmount = ethers.parseEther("0.0001"); // Use smaller amount for gas testing

  const openEthTx = await factory.openChannel(
    ethers.ZeroAddress,  // tokenAddress (ETH)
    recipient.address,   // recipient
    ethAmount,          // amount
    expiration,         // expiration
    { value: ethAmount }
  );
  const openEthReceipt = await openEthTx.wait();
  const openEthGas = openEthReceipt!.gasUsed;
  const openEthCost = openEthGas * gasPrice;
  measurements.push({
    operation: "openChannel (ETH)",
    gasUsed: openEthGas,
    ethCost: ethers.formatEther(openEthCost),
    usdCost: (parseFloat(ethers.formatEther(openEthCost)) * ethPriceUSD).toFixed(6),
  });
  console.log("   Gas used:", openEthGas.toString());
  console.log("   Cost:", ethers.formatEther(openEthCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

  // Get channel ID from event
  const openEthEvent = openEthReceipt!.logs.find((log) => {
    try {
      return factory.interface.parseLog(log as any)?.name === "ChannelOpened";
    } catch {
      return false;
    }
  });
  const ethChannelId = factory.interface.parseLog(openEthEvent as any)?.args.channelId;
  console.log("   Channel ID:", ethChannelId);

  // 2. Top-up ETH channel
  console.log("\n2️⃣  Topping up ETH channel...");
  const topUpAmount = ethers.parseEther("0.00005");
  const topUpTx = await factory.topUpChannel(ethChannelId, topUpAmount, { value: topUpAmount });
  const topUpReceipt = await topUpTx.wait();
  const topUpGas = topUpReceipt!.gasUsed;
  const topUpCost = topUpGas * gasPrice;
  measurements.push({
    operation: "topUpChannel (ETH)",
    gasUsed: topUpGas,
    ethCost: ethers.formatEther(topUpCost),
    usdCost: (parseFloat(ethers.formatEther(topUpCost)) * ethPriceUSD).toFixed(6),
  });
  console.log("   Gas used:", topUpGas.toString());
  console.log("   Cost:", ethers.formatEther(topUpCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

  // 3. Close ETH channel
  console.log("\n3️⃣  Closing ETH channel...");
  const claimAmount = ethers.parseEther("0.00005"); // Claim half
  const nonce = 1;

  // Create signature (channelId, claimAmount, nonce)
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256"],
    [ethChannelId, claimAmount, nonce]
  );
  const signature = await sender.signMessage(ethers.getBytes(messageHash));

  const closeEthTx = await factory.closeChannel(ethChannelId, claimAmount, nonce, signature);
  const closeEthReceipt = await closeEthTx.wait();
  const closeEthGas = closeEthReceipt!.gasUsed;
  const closeEthCost = closeEthGas * gasPrice;
  measurements.push({
    operation: "closeChannel (ETH)",
    gasUsed: closeEthGas,
    ethCost: ethers.formatEther(closeEthCost),
    usdCost: (parseFloat(ethers.formatEther(closeEthCost)) * ethPriceUSD).toFixed(6),
  });
  console.log("   Gas used:", closeEthGas.toString());
  console.log("   Cost:", ethers.formatEther(closeEthCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

  console.log("\n" + "=".repeat(80));
  console.log("USDC CHANNEL OPERATIONS");
  console.log("=".repeat(80));

  // Get USDC contract
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  const usdcAmount = 5_000000n; // 5 USDC (6 decimals)

  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(sender.address);
  console.log("\n💰 Sender USDC balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

  if (usdcBalance < usdcAmount) {
    console.log("⚠️  WARNING: Insufficient USDC balance for test");
    console.log("   Required:", ethers.formatUnits(usdcAmount, 6), "USDC");
    console.log("   Available:", ethers.formatUnits(usdcBalance, 6), "USDC");
    console.log("\n⏭️  Skipping USDC tests");
  } else {
    // 4. Approve USDC
    console.log("\n4️⃣  Approving USDC...");
    const approveTx = await usdc.approve(factoryAddress, usdcAmount * 2n); // Approve 10 USDC
    const approveReceipt = await approveTx.wait();
    const approveGas = approveReceipt!.gasUsed;
    const approveCost = approveGas * gasPrice;
    measurements.push({
      operation: "approve (USDC)",
      gasUsed: approveGas,
      ethCost: ethers.formatEther(approveCost),
      usdCost: (parseFloat(ethers.formatEther(approveCost)) * ethPriceUSD).toFixed(6),
    });
    console.log("   Gas used:", approveGas.toString());
    console.log("   Cost:", ethers.formatEther(approveCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

    // 5. Open USDC channel
    console.log("\n5️⃣  Opening USDC channel...");
    const openUsdcTx = await factory.openChannel(usdcAddress, recipient.address, usdcAmount, expiration);
    const openUsdcReceipt = await openUsdcTx.wait();
    const openUsdcGas = openUsdcReceipt!.gasUsed;
    const openUsdcCost = openUsdcGas * gasPrice;
    measurements.push({
      operation: "openChannel (USDC)",
      gasUsed: openUsdcGas,
      ethCost: ethers.formatEther(openUsdcCost),
      usdCost: (parseFloat(ethers.formatEther(openUsdcCost)) * ethPriceUSD).toFixed(6),
    });
    console.log("   Gas used:", openUsdcGas.toString());
    console.log("   Cost:", ethers.formatEther(openUsdcCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

    const openUsdcEvent = openUsdcReceipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog(log as any)?.name === "ChannelOpened";
      } catch {
        return false;
      }
    });
    const usdcChannelId = factory.interface.parseLog(openUsdcEvent as any)?.args.channelId;
    console.log("   Channel ID:", usdcChannelId);

    // 6. Top-up USDC channel
    console.log("\n6️⃣  Topping up USDC channel...");
    const topUpUsdcAmount = 2_500000n; // 2.5 USDC
    const topUpUsdcTx = await factory.topUpChannel(usdcChannelId, topUpUsdcAmount);
    const topUpUsdcReceipt = await topUpUsdcTx.wait();
    const topUpUsdcGas = topUpUsdcReceipt!.gasUsed;
    const topUpUsdcCost = topUpUsdcGas * gasPrice;
    measurements.push({
      operation: "topUpChannel (USDC)",
      gasUsed: topUpUsdcGas,
      ethCost: ethers.formatEther(topUpUsdcCost),
      usdCost: (parseFloat(ethers.formatEther(topUpUsdcCost)) * ethPriceUSD).toFixed(6),
    });
    console.log("   Gas used:", topUpUsdcGas.toString());
    console.log("   Cost:", ethers.formatEther(topUpUsdcCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");

    // 7. Close USDC channel
    console.log("\n7️⃣  Closing USDC channel...");
    const usdcClaimAmount = 3_500000n; // 3.5 USDC
    const usdcNonce = 1;

    const usdcMessageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint256", "uint256"],
      [usdcChannelId, usdcClaimAmount, usdcNonce]
    );
    const usdcSignature = await sender.signMessage(ethers.getBytes(usdcMessageHash));

    const closeUsdcTx = await factory.closeChannel(usdcChannelId, usdcClaimAmount, usdcNonce, usdcSignature);
    const closeUsdcReceipt = await closeUsdcTx.wait();
    const closeUsdcGas = closeUsdcReceipt!.gasUsed;
    const closeUsdcCost = closeUsdcGas * gasPrice;
    measurements.push({
      operation: "closeChannel (USDC)",
      gasUsed: closeUsdcGas,
      ethCost: ethers.formatEther(closeUsdcCost),
      usdCost: (parseFloat(ethers.formatEther(closeUsdcCost)) * ethPriceUSD).toFixed(6),
    });
    console.log("   Gas used:", closeUsdcGas.toString());
    console.log("   Cost:", ethers.formatEther(closeUsdcCost), "ETH ($" + measurements[measurements.length - 1].usdCost + ")");
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");
  console.log("Operation                    | Gas Used  | ETH Cost          | USD Cost");
  console.log("-".repeat(80));
  measurements.forEach((m) => {
    const op = m.operation.padEnd(28);
    const gas = m.gasUsed.toString().padStart(9);
    const eth = m.ethCost.padStart(17);
    const usd = ("$" + m.usdCost).padStart(8);
    console.log(`${op} | ${gas} | ${eth} | ${usd}`);
  });

  // Calculate lifecycle costs
  console.log("\n" + "=".repeat(80));
  console.log("CHANNEL LIFECYCLE COSTS");
  console.log("=".repeat(80) + "\n");

  const ethLifecycle = measurements
    .filter((m) => m.operation.includes("ETH"))
    .reduce((sum, m) => sum + parseFloat(m.usdCost), 0);
  console.log("ETH Channel (open + top-up + close):", "$" + ethLifecycle.toFixed(6));

  const usdcLifecycle = measurements
    .filter((m) => m.operation.includes("USDC"))
    .reduce((sum, m) => sum + parseFloat(m.usdCost), 0);
  if (usdcLifecycle > 0) {
    console.log("USDC Channel (approve + open + top-up + close):", "$" + usdcLifecycle.toFixed(6));
  }

  // AC validation
  console.log("\n" + "=".repeat(80));
  console.log("AC 3 VALIDATION: Gas costs <$0.01 per channel lifecycle");
  console.log("=".repeat(80) + "\n");

  const ethOpenClose = measurements
    .filter((m) => m.operation === "openChannel (ETH)" || m.operation === "closeChannel (ETH)")
    .reduce((sum, m) => sum + parseFloat(m.usdCost), 0);
  console.log("ETH (open + close):", "$" + ethOpenClose.toFixed(6), ethOpenClose < 0.01 ? "✅ PASS" : "❌ FAIL");

  if (usdcLifecycle > 0) {
    const usdcOpenClose = measurements
      .filter((m) => m.operation === "openChannel (USDC)" || m.operation === "closeChannel (USDC)")
      .reduce((sum, m) => sum + parseFloat(m.usdCost), 0);
    console.log("USDC (open + close):", "$" + usdcOpenClose.toFixed(6), usdcOpenClose < 0.01 ? "✅ PASS" : "❌ FAIL");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
