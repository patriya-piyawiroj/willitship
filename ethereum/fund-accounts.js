// Script to fund accounts on Hardhat node startup
// This is needed because Hardhat node doesn't use the accounts config from hardhat.config.js

const hre = require("hardhat");
const { ethers } = require("ethers");

async function fundAccounts() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    
    // Get the first account (Hardhat's default account with 10000 ETH)
    const [signer] = await provider.listAccounts();
    if (!signer) {
        console.log("⚠️  No accounts found, waiting for Hardhat node to start...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fundAccounts();
    }
    
    const funder = await provider.getSigner(signer);
    const fundAmount = ethers.parseEther("10000");
    
    // Accounts to fund
    const accounts = [
        process.env.DEPLOYER_PRIVATE_KEY,
        process.env.BUYER_PRIVATE_KEY,
        process.env.SELLER_PRIVATE_KEY,
        process.env.CARRIER_PRIVATE_KEY,
        process.env.INVESTOR_PRIVATE_KEY,
    ].filter(key => key).map(key => {
        const wallet = new ethers.Wallet(key, provider);
        return wallet.address;
    });
    
    console.log(`💰 Funding ${accounts.length} accounts...`);
    
    for (const address of accounts) {
        const balance = await provider.getBalance(address);
        if (balance === 0n) {
            const tx = await funder.sendTransaction({
                to: address,
                value: fundAmount,
            });
            await tx.wait();
            console.log(`✅ Funded ${address}: ${ethers.formatEther(fundAmount)} ETH`);
        } else {
            console.log(`⏭️  ${address} already has ${ethers.formatEther(balance)} ETH`);
        }
    }
    
    console.log("✅ All accounts funded!");
}

// Run after a short delay to ensure Hardhat node is ready
setTimeout(() => {
    fundAccounts().catch(console.error);
}, 3000);

