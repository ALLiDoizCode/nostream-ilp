import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Checking balance for deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const minRequired = ethers.parseEther("0.005");
  if (balance < minRequired) {
    console.log("\n⚠️  WARNING: Insufficient balance for deployment");
    console.log("   Required: 0.005 ETH");
    console.log("   Current:", ethers.formatEther(balance), "ETH");
    console.log("   Deficit:", ethers.formatEther(minRequired - balance), "ETH");
    console.log("\n💡 Bridge ETH to Base via: https://bridge.base.org");
    process.exit(1);
  } else {
    console.log("✅ Sufficient balance for deployment");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
