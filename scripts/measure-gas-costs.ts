import { ethers } from "hardhat";

async function main() {
  console.log("\n==========================================");
  console.log("Cronos Testnet Gas Cost Analysis");
  console.log("==========================================\n");

  const provider = ethers.provider;

  // Transaction hashes from deployment and testing
  const transactions = {
    "Deploy MockAKT": "0xec011d5cd195e9bf76ef68a7055369bef91d318e082cd8cc10b6175b13ad4aa3",
    "Deploy CronosPaymentChannel": "0x8129b6909571932199b95afa961c317e5fb69c234719c24f448712670e2013b6",
    "Mint AKT (testing only)": "0xac473c56357586fa30d83bb4753c1c66bc04b41bb986dbcaa2f7421d6b113103",
    "ERC-20 approve()": "0x5ced4bd544a13b95ba0856b4b09e094578aa77a61bece96ec4be13137b6b76e6",
    "openChannel()": "0x37b38cbf484b8e470469f9415ff56b9326ad52be414757b2fdf73eb4dd730614",
  };

  let totalGasUsed = 0n;
  let totalCostWei = 0n;

  console.log("Fetching transaction receipts...\n");

  for (const [operation, txHash] of Object.entries(transactions)) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      const tx = await provider.getTransaction(txHash);

      if (!receipt || !tx) {
        console.log(`⚠ ${operation}: Transaction not found`);
        continue;
      }

      const gasUsed = receipt.gasUsed;
      const gasPrice = tx.gasPrice || 0n;
      const costWei = gasUsed * gasPrice;
      const costCRO = ethers.formatEther(costWei);

      totalGasUsed += gasUsed;
      totalCostWei += costWei;

      console.log(`${operation}:`);
      console.log(`  Gas Used: ${gasUsed.toLocaleString()}`);
      console.log(`  Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
      console.log(`  Cost: ${costCRO} TCRO`);
      console.log("");
    } catch (error: any) {
      console.log(`⚠ ${operation}: Error fetching transaction - ${error.message}`);
      console.log("");
    }
  }

  console.log("==========================================");
  console.log("Summary");
  console.log("==========================================");
  console.log(`Total Gas Used: ${totalGasUsed.toLocaleString()}`);
  console.log(`Total Cost: ${ethers.formatEther(totalCostWei)} TCRO`);

  // Get current CRO price (placeholder - would need a price oracle in production)
  const croPrice = 0.12; // USD per CRO (approximate, update manually)
  const totalCostUSD = parseFloat(ethers.formatEther(totalCostWei)) * croPrice;
  console.log(`Estimated Cost in USD: $${totalCostUSD.toFixed(6)} (at $${croPrice}/CRO)`);

  console.log("\n==========================================");
  console.log("Deployment Lifecycle Cost");
  console.log("==========================================");
  console.log("Core deployment operations:");
  console.log("  - Deploy MockAKT");
  console.log("  - Deploy CronosPaymentChannel");
  console.log("  - approve() - ERC-20 token approval");
  console.log("  - openChannel() - Open payment channel");
  console.log("\nNote: Mint operation is for testing only and not");
  console.log("required in production (use real AKT tokens).");

  console.log("\n==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
