import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Derives wallet from seed phrase and creates .env file
 * SECURITY: This script is for deployment setup only
 * The .env file is gitignored to prevent accidental commits
 *
 * USAGE:
 *   Option 1: Environment variable
 *     WALLET_SEED_PHRASE="your seed phrase here" npx ts-node scripts/setup-wallet-from-seed.ts
 *
 *   Option 2: Interactive prompt (most secure - seed never written to bash history)
 *     npx ts-node scripts/setup-wallet-from-seed.ts
 *
 *   Option 3: Read from gitignored file
 *     echo "your seed phrase" > .wallet-seed.txt
 *     npx ts-node scripts/setup-wallet-from-seed.ts --from-file
 */

/**
 * Prompt user for seed phrase securely via stdin
 * This method ensures seed phrase is never saved to bash history
 */
async function promptForSeedPhrase(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("🔐 Enter your 12-word seed phrase: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Get seed phrase from various secure sources
 */
async function getSeedPhrase(): Promise<string> {
  // Option 1: From environment variable
  if (process.env.WALLET_SEED_PHRASE) {
    console.log("✅ Using seed phrase from WALLET_SEED_PHRASE environment variable\n");
    return process.env.WALLET_SEED_PHRASE;
  }

  // Option 2: From gitignored file (if --from-file flag provided)
  if (process.argv.includes("--from-file")) {
    const seedPath = path.join(__dirname, "..", ".wallet-seed.txt");
    if (!fs.existsSync(seedPath)) {
      throw new Error(
        `Seed file not found: ${seedPath}\n` +
        `Create it with: echo "your seed phrase" > .wallet-seed.txt`
      );
    }
    console.log("✅ Reading seed phrase from .wallet-seed.txt\n");
    const content = fs.readFileSync(seedPath, "utf-8");
    // Extract seed phrase (handle format: "Seed Phrase: ...\n..." or just the phrase)
    const match = content.match(/Seed Phrase[:\s]*([^\n]+)/i);
    if (match) {
      return match[1].trim();
    }
    return content.trim();
  }

  // Option 3: Interactive prompt (most secure)
  console.log("🔐 No seed phrase provided via environment or file.\n");
  console.log("⚠️  SECURITY: Interactive mode is most secure (no bash history).\n");
  return await promptForSeedPhrase();
}

async function setupWallet() {
  console.log("🔐 Setting up wallet from seed phrase...\n");

  // Get seed phrase securely
  const seedPhrase = await getSeedPhrase();

  // Validate seed phrase format (basic check)
  const wordCount = seedPhrase.trim().split(/\s+/).length;
  if (wordCount !== 12 && wordCount !== 24) {
    throw new Error(
      `Invalid seed phrase: expected 12 or 24 words, got ${wordCount}\n` +
      `Please check your seed phrase and try again.`
    );
  }

  // Derive wallet from mnemonic
  let wallet: ethers.Wallet;
  try {
    wallet = ethers.Wallet.fromPhrase(seedPhrase);
  } catch (error) {
    throw new Error(
      `Failed to derive wallet from seed phrase.\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n` +
      `Please verify your seed phrase is correct.`
    );
  }

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
