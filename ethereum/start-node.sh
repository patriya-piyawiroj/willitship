#!/bin/sh
# Start Hardhat node and fund custom accounts

# Start Hardhat node in background
npx hardhat node --hostname 0.0.0.0 &

# Wait for node to be ready
sleep 5

# Load .env and fund accounts using Node.js script
if [ -f /app/.env ]; then
    node -e "
    require('dotenv').config({ path: '/app/.env' });
    const { ethers } = require('ethers');
    
    (async () => {
        const provider = new ethers.JsonRpcProvider('http://localhost:8545');
        const accounts = await provider.listAccounts();
        if (accounts.length === 0) {
            console.log('⚠️  No accounts found');
            process.exit(1);
        }
        
        const funder = await provider.getSigner(accounts[0]);
        const fundAmount = ethers.parseEther('10000');
        
        const privateKeys = [
            process.env.DEPLOYER_PRIVATE_KEY,
            process.env.BUYER_PRIVATE_KEY,
            process.env.SELLER_PRIVATE_KEY,
            process.env.CARRIER_PRIVATE_KEY,
            process.env.INVESTOR_PRIVATE_KEY,
        ].filter(k => k);
        
        const addresses = privateKeys.map(k => new ethers.Wallet(k, provider).address);
        
        console.log('💰 Funding', addresses.length, 'accounts...');
        for (const addr of addresses) {
            const balance = await provider.getBalance(addr);
            if (balance === 0n) {
                const tx = await funder.sendTransaction({ to: addr, value: fundAmount });
                await tx.wait();
                console.log('✅ Funded', addr);
            }
        }
        console.log('✅ All accounts funded!');
    })().catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
    "
fi

# Keep the Hardhat node running
wait

