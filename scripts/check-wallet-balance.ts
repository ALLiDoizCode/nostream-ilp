import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function checkBalance() {
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error("❌ PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;

  console.log("📍 Wallet Address:", address);
  console.log("🌐 Checking balance on Cronos Mainnet...\n");

  // Connect to Cronos mainnet
  const provider = new ethers.JsonRpcProvider("https://evm.cronos.org");
  const walletWithProvider = wallet.connect(provider);

  try {
    const balance = await provider.getBalance(address);
    const balanceCRO = ethers.formatEther(balance);
    const balanceNum = parseFloat(balanceCRO);

    console.log(`💰 Balance: ${balanceCRO} CRO`);

    if (balanceNum >= 10) {
      console.log("✅ Sufficient balance for deployment (≥10 CRO)");
    } else if (balanceNum > 0) {
      console.log(`⚠️  Insufficient balance: Need ${(10 - balanceNum).toFixed(4)} more CRO`);
    } else {
      console.log("❌ No balance - wallet needs to be funded");
    }

    console.log("\n📝 Funding Instructions:");
    console.log("1. Send CRO to:", address);
    console.log("2. Minimum: 10 CRO (recommended: 15 CRO for buffer)");
    console.log("3. Network: Cronos Mainnet (ChainID: 25)");
    console.log("4. Check tx: https://cronoscan.com/address/" + address);
  } catch (error) {
    console.error("❌ Error checking balance:", error);
    process.exit(1);
  }
}

checkBalance();
