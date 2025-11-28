import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@cronos-labs/hardhat-cronoscan";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",  // Lock to specific version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    cronosTestnet: {
      url: "https://evm-t3.cronos.org/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 338,
    },
    cronos: {
      url: "https://evm.cronos.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 25,
    }
  },
  etherscan: {
    apiKey: {
      cronosTestnet: process.env.CRONOSCAN_API_KEY || "dummy-key-not-required",
      cronos: process.env.CRONOSCAN_API_KEY || "",
    }
  }
};

export default config;
