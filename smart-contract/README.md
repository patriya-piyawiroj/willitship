# Smart Contracts & API

Complete smart contract system with blockchain API service for the Trade Finance platform.

## Overview

This directory contains:
- **Solidity Contracts**: On-chain trade finance contracts
- **Deployment Scripts**: Python scripts for deploying contracts
- **API Service**: FastAPI service for blockchain interactions and event listening

## Quick Start

### 1. Deploy Contracts & Start API

```bash
./cmd/run-smart-contract.sh
```

This will:
- Compile contracts (using Hardhat from `../ethereum/`)
- Deploy contracts to the blockchain
- Start the API service on port 8004

### 2. Run API Only

```bash
./cmd/run-api.sh
# Or locally:
cd smart-contract && ./run.sh
```

### 3. Using Docker

The API service is included in `docker-compose.yaml` as `smart-contract` service.

## Contracts

### BillOfLadingFactory
- Enforces global uniqueness for each BoL hash
- Deploys `BillOfLading` contracts via `createBoL()` function
- Maintains registry: `mapping(bytes32 => address) public bolRegistry`

**Functions:**
- `createBoL(bytes32 bolHash, uint256 declaredValue, address shipper, address buyer)` - Creates a new Bill of Lading
- `getBoLByHash(bytes32 bolHash)` - Returns BillOfLading contract address for a hash
- `setDefaultStablecoin(address stablecoin)` - Sets default stablecoin for new contracts

### BillOfLading
- Manages individual trade finance transactions
- Implements ERC721 for BoL NFT (minted to contract, burned on settlement)
- Deploys `ClaimToken` contract for fractional ownership

**Functions:**
- `mint(address buyer, address seller, uint256 declaredValue)` - Mints BoL NFT, emits "Created"
- `issueClaims()` - Enables funding, emits "Active"
- `fund(uint256 amount)` - Investor funds trade, receives claim tokens, emits "Funded" and "Full" when complete
- `surrender()` - Disables funding, emits "Inactive"
- `pay(uint256 amount)` - Buyer pays stablecoin to escrow, emits "Paid"
- `redeem()` - Claim holders redeem their share, emits "Claimed"
- `_settle()` - Internal function called when all claims redeemed, burns NFT, emits "Settled"

**Events:**
- `Created` - BoL NFT minted
- `Active` - Claims issued, funding enabled
- `Funded` - Investor funded trade
- `Full` - Trade fully funded
- `Inactive` - Funding disabled
- `Paid` - Buyer made payment
- `Claimed` - Claim tokens redeemed
- `Settled` - Trade fully settled

### ERC20Stablecoin
- ERC20 token for testing and development
- Pre-minted supply for testing purposes

## Deployment

### Prerequisites

1. Ethereum node must be running (see `../ethereum/`)
2. Contracts must be compiled (run `npm run compile` in `../ethereum/`)

### Manual Deployment

```bash
# Create virtual environment (first time only)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Deploy
python3 scripts/deploy.py
```

The script will:
- Connect to Hardhat node at `http://localhost:8545`
- Deploy `ERC20Stablecoin` contract
- Deploy `BillOfLadingFactory` contract
- Mint stablecoins to all accounts (100k tokens each)
- Save deployment info to `deployments.json`


## Usage Flow

1. **Create Trade**: Factory creates new BillOfLading contract for unique BoL hash
2. **Mint NFT**: Call `mint()` on BillOfLading contract
3. **Issue Claims**: Call `issueClaims()` to enable funding
4. **Fund**: Investors call `fund()` to fund trade, receive claim tokens 1:1 with stablecoin
5. **Pay**: Buyer calls `pay()` to send stablecoin to escrow
6. **Redeem**: Claim holders call `redeem()` to get their proportional share
7. **Settle**: Automatically when all claim tokens are burned, NFT is burned and trade marked settled

## Key Features

1. **BoL Uniqueness**: Factory ensures each BoL hash can only be used once
2. **Fractional Ownership**: Claim tokens represent fractional ownership of trade
3. **Pull-based Redemption**: Claim holders pull their share when ready
4. **Automatic Settlement**: Trade settles when all claims are redeemed
5. **NFT Management**: BoL NFT stays in contract until settlement, then burned
6. **Event Indexing**: All events automatically stored in PostgreSQL for querying

## Development

### Compile Contracts

Contracts are compiled using Hardhat in the `../ethereum/` folder:

```bash
cd ../ethereum
npm install
npm run compile
```
