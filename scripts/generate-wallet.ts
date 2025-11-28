import { ethers } from "hardhat";

async function main() {
  const wallet = ethers.Wallet.createRandom();

  console.log("\n===========================================");
  console.log("NEW TESTNET WALLET GENERATED");
  console.log("===========================================");
  console.log("Private Key (without 0x):", wallet.privateKey.slice(2));
  console.log("Public Address:", wallet.address);
  console.log("===========================================");
  console.log("\nFund this address with testnet CRO:");
  console.log("1. Visit: https://cronos.org/faucet");
  console.log("2. Enter address:", wallet.address);
  console.log("3. Request testnet CRO");
  console.log("\nAdd the private key to .env file:");
  console.log("PRIVATE_KEY=" + wallet.privateKey.slice(2));
  console.log("===========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
