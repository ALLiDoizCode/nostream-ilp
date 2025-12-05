import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  console.log("Deploying MultiTokenPaymentChannelFactory to Base Mainnet...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.005")) {
    throw new Error("Insufficient balance. Need at least 0.005 ETH for deployment.");
  }

  // Deploy factory (no constructor arguments for MultiTokenPaymentChannelFactory)
  console.log("\nDeploying contract...");
  const MultiTokenFactory = await ethers.getContractFactory("MultiTokenPaymentChannelFactory");
  const factory = await MultiTokenFactory.deploy();

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("\n✅ MultiTokenPaymentChannelFactory deployed to:", factoryAddress);
  console.log("Transaction hash:", factory.deploymentTransaction()?.hash);

  // Get gas cost information
  const deployTx = factory.deploymentTransaction();
  if (deployTx) {
    const receipt = await deployTx.wait();
    if (receipt) {
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("Gas price:", ethers.formatUnits(receipt.gasPrice || 0n, "gwei"), "gwei");
      const gasCost = receipt.gasUsed * (receipt.gasPrice || 0n);
      console.log("Total cost:", ethers.formatEther(gasCost), "ETH");
    }
  }

  // Save deployment info
  const deployment = {
    network: "base-mainnet",
    chainId: 8453,
    contractAddress: factoryAddress,
    txHash: factory.deploymentTransaction()?.hash,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
  };

  console.log("\n📋 Deployment Info:", JSON.stringify(deployment, null, 2));

  // Save to file
  const deploymentsDir = "./deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  fs.writeFileSync(
    `${deploymentsDir}/base-mainnet.json`,
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n📝 Next steps:");
  console.log(`1. Verify contract: npx hardhat verify --network base ${factoryAddress}`);
  console.log(`2. Update .env: BASE_MAINNET_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`3. View on BaseScan: https://basescan.org/address/${factoryAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
