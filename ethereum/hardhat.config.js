require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const fs = require("fs");

// Load .env from root directory
// In Docker, .env is mounted at /app/.env, so check both paths
const envPath = path.resolve(__dirname, "..", ".env");
const dockerEnvPath = "/app/.env";
if (fs.existsSync(dockerEnvPath)) {
  require("dotenv").config({ path: dockerEnvPath });
} else {
  require("dotenv").config({ path: envPath });
}

// Debug: Log if private keys are loaded (only for primary tasks)
const primaryTasks = ["compile", "node", "run", "test", "deploy"];
const currentTask = process.argv.find((arg) => primaryTasks.includes(arg));
if (currentTask && !global.HARDHAT_LOGGED) {
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    console.log("✅ Private keys loaded from .env");
  } else {
    console.log("⚠️  Private keys NOT loaded from .env");
  }
  global.HARDHAT_LOGGED = true;
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: (() => {
        const accounts = [
          {
            privateKey: process.env.DEPLOYER_PRIVATE_KEY,
            balance: "10000000000000000000000", // 10000 ETH
          },
          {
            privateKey: process.env.BUYER_PRIVATE_KEY,
            balance: "10000000000000000000000", // 10000 ETH
          },
          {
            privateKey: process.env.SELLER_PRIVATE_KEY,
            balance: "10000000000000000000000",
          },
          {
            privateKey: process.env.CARRIER_PRIVATE_KEY,
            balance: "10000000000000000000000",
          },
          {
            privateKey: process.env.INVESTOR_PRIVATE_KEY,
            balance: "10000000000000000000000",
          },
        ].filter(acc => acc.privateKey); // Only include accounts with private keys set

        if (currentTask && !global.HARDHAT_ACCOUNTS_LOGGED) {
          console.log(`📝 Configured ${accounts.length} accounts in Hardhat network`);
          global.HARDHAT_ACCOUNTS_LOGGED = true;
        }
        return accounts;
      })(),
    },
    localhost: {
      url: "http://localhost:8545",
      chainId: 1337,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

