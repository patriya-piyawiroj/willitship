require("@nomicfoundation/hardhat-toolbox");
const path = require("path");

// Load .env from root directory
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

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
      accounts: [
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
      ].filter(acc => acc.privateKey), // Only include accounts with private keys set
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

