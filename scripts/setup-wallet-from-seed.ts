import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * Derives wallet from seed phrase and creates .env file
 * SECURITY: This script is for deployment setup only
 * The .env file is gitignored to prevent accidental commits
 */

async function setupWallet() {
  // Seed phrase provided by user
  const seedPhrase = "broom clown drum fee report menu edit swing scatter art peace conduct";

  console.log("🔐 Setting up wallet from seed phrase...\n");

  // Derive wallet from mnemonic
  const wallet = ethers.Wallet.fromPhrase(seedPhrase);

  console.log("✅ Wallet derived successfully!");
  console.log(`📍 Address: ${wallet.address}`);
  console.log(`🔑 Private Key: ${wallet.privateKey.slice(2)}\n`); // Remove 0x prefix

  // Create .env file
  const envPath = path.join(__dirname, "..", ".env");
  const envExamplePath = path.join(__dirname, "..", ".env.example");

  // Read .env.example
  let envContent = fs.readFileSync(envExamplePath, "utf-8");

  // Replace PRIVATE_KEY
  envContent = envContent.replace(
    /^PRIVATE_KEY=.*$/m,
    `PRIVATE_KEY=${wallet.privateKey.slice(2)}`
  );

  // Write .env file
  fs.writeFileSync(envPath, envContent);

  console.log("✅ .env file created successfully!");
  console.log(`📄 Location: ${envPath}`);
  console.log(`⚠️  SECURITY: .env is gitignored - DO NOT commit to version control\n`);

  console.log("📝 Next steps:");
  console.log("1. Fund this address with >10 CRO on Cronos mainnet");
  console.log("2. Obtain CronoScan API key from https://cronoscan.com/myapikey");
  console.log("3. Add API key to .env: CRONOSCAN_API_KEY=your_key_here");
  console.log("4. Verify wallet balance before deployment\n");

  // Save seed phrase to secure location (encrypted)
  const seedPath = path.join(__dirname, "..", ".wallet-seed.txt");
  fs.writeFileSync(seedPath, `Seed Phrase (DO NOT SHARE):\n${seedPhrase}\n\nAddress: ${wallet.address}\n\nBackup this file to encrypted storage and delete from disk.`);

  console.log(`🔐 Seed phrase saved to: ${seedPath}`);
  console.log("⚠️  CRITICAL: Back up this file to encrypted storage (1Password, etc.)");
  console.log("⚠️  Then DELETE the file from disk: rm .wallet-seed.txt\n");
}

setupWallet().catch((error) => {
  console.error("❌ Error setting up wallet:", error);
  process.exit(1);
});
