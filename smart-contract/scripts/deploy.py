#!/usr/bin/env python3
"""
Deploy smart contracts to the local Ethereum network.
"""
import json
import os
import sys
from pathlib import Path
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configuration
RPC_URL = os.getenv("RPC_URL", "http://localhost:8545")
DEPLOYMENTS_FILE = Path(__file__).parent.parent / "deployments.json"
EXPLORER_DEPLOYMENTS_FILE = Path(__file__).parent.parent.parent / "ethereum" / "explorer" / "deployments.json"

def get_account_private_key(role: str) -> str:
    """Get account private key from environment variable."""
    env_key = f"{role.upper()}_PRIVATE_KEY"
    private_key = os.getenv(env_key)
    if not private_key:
        raise ValueError(f"Environment variable {env_key} is not set. Please set it in .env file.")
    return private_key

def get_account_address(private_key: str) -> str:
    """Get address from private key."""
    account = Account.from_key(private_key)
    return account.address

def load_contract_abi(contract_name: str) -> dict:
    """Load contract ABI from artifacts."""
    # Artifacts are in the ethereum folder
    artifacts_dir = Path(__file__).parent.parent.parent / "ethereum" / "artifacts" / "contracts"
    contract_file = artifacts_dir / f"{contract_name}.sol" / f"{contract_name}.json"
    
    if not contract_file.exists():
        raise FileNotFoundError(f"Contract ABI not found: {contract_file}")
    
    with open(contract_file) as f:
        artifact = json.load(f)
        return artifact["abi"]

def get_contract_bytecode(contract_name: str) -> str:
    """Get contract bytecode from artifacts."""
    # Artifacts are in the ethereum folder
    artifacts_dir = Path(__file__).parent.parent.parent / "ethereum" / "artifacts" / "contracts"
    contract_file = artifacts_dir / f"{contract_name}.sol" / f"{contract_name}.json"
    
    if not contract_file.exists():
        raise FileNotFoundError(f"Contract ABI not found: {contract_file}")
    
    with open(contract_file) as f:
        artifact = json.load(f)
        return artifact["bytecode"]

def deploy_contract(w3: Web3, account: Account, contract_name: str, *args):
    """Deploy a contract."""
    print(f"\nDeploying {contract_name}...")
    
    abi = load_contract_abi(contract_name)
    bytecode = get_contract_bytecode(contract_name)
    
    # Create contract instance
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    
    # Build transaction
    transaction = contract.constructor(*args).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 5000000,  # Increased gas limit for larger contracts
        "gasPrice": w3.eth.gas_price,
    })
    
    # Sign transaction
    signed_txn = account.sign_transaction(transaction)
    
    # Send transaction
    # SignedTransaction object has 'raw_transaction' attribute (snake_case)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    
    # Wait for receipt
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    contract_address = tx_receipt.contractAddress
    print(f"{contract_name} deployed to: {contract_address}")
    
    return contract_address, abi

def main():
    """Main deployment function."""
    # Connect to local node
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
    if not w3.is_connected():
        print(f"Error: Could not connect to {RPC_URL}")
        sys.exit(1)
    
    # Get deployer account
    deployer_key = get_account_private_key("deployer")
    deployer = Account.from_key(deployer_key)
    
    print(f"Deploying contracts with account: {deployer.address}")
    balance = w3.eth.get_balance(deployer.address)
    print(f"Account balance: {w3.from_wei(balance, 'ether')} ETH")
    
    # Get account addresses
    accounts = {
        "deployer": deployer.address,
        "buyer": get_account_address(get_account_private_key("buyer")),
        "seller": get_account_address(get_account_private_key("seller")),
        "carrier": get_account_address(get_account_private_key("carrier")),
        "investor": get_account_address(get_account_private_key("investor")),
    }
    
    print("\nPre-configured accounts:")
    for name, address in accounts.items():
        print(f"{name.capitalize()}: {address}")
    
    # Deploy ERC20Stablecoin
    stablecoin_address, stablecoin_abi = deploy_contract(w3, deployer, "ERC20Stablecoin")
    
    # Mint stablecoins to accounts
    print("\nMinting stablecoins to accounts...")
    mint_amount = w3.to_wei(100000, "ether")  # 100k tokens
    
    stablecoin_contract = w3.eth.contract(address=stablecoin_address, abi=stablecoin_abi)
    
    for name, address in accounts.items():
        if name != "deployer":
            tx = stablecoin_contract.functions.mint(address, mint_amount).build_transaction({
                "from": deployer.address,
                "nonce": w3.eth.get_transaction_count(deployer.address),
                "gas": 100000,
                "gasPrice": w3.eth.gas_price,
            })
            signed_tx = deployer.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            w3.eth.wait_for_transaction_receipt(tx_hash)
    
    print(f"Minted {w3.from_wei(mint_amount, 'ether')} tokens to each account")
    
    # Deploy BillOfLadingFactory
    factory_address, factory_abi = deploy_contract(w3, deployer, "BillOfLadingFactory")
    
    # Set default stablecoin on factory
    print("\nSetting default stablecoin on factory...")
    factory_contract = w3.eth.contract(address=factory_address, abi=factory_abi)
    set_stablecoin_tx = factory_contract.functions.setDefaultStablecoin(stablecoin_address).build_transaction({
        "from": deployer.address,
        "nonce": w3.eth.get_transaction_count(deployer.address),
        "gas": 100000,
        "gasPrice": w3.eth.gas_price,
    })
    signed_set_tx = deployer.sign_transaction(set_stablecoin_tx)
    set_tx_hash = w3.eth.send_raw_transaction(signed_set_tx.raw_transaction)
    w3.eth.wait_for_transaction_receipt(set_tx_hash)
    print(f"Default stablecoin set to: {stablecoin_address}")
    
    # Get network info
    network_name = "localhost"
    chain_id = w3.eth.chain_id
    
    # Save deployment info
    deployment_info = {
        "network": network_name,
        "chainId": chain_id,
        "contracts": {
            "BillOfLadingFactory": factory_address,
            "ERC20Stablecoin": stablecoin_address,
        },
        "accounts": accounts,
        "rpcUrl": RPC_URL,
    }
    
    # Write to deployments.json
    with open(DEPLOYMENTS_FILE, "w") as f:
        json.dump(deployment_info, f, indent=2)
    print(f"\nDeployment info saved to: {DEPLOYMENTS_FILE}")
    
    # Write to explorer directory
    EXPLORER_DEPLOYMENTS_FILE.parent.mkdir(exist_ok=True)
    with open(EXPLORER_DEPLOYMENTS_FILE, "w") as f:
        json.dump(deployment_info, f, indent=2)
    print(f"Deployment info copied to explorer: {EXPLORER_DEPLOYMENTS_FILE}")
    
    # Print summary
    print("\n=== Deployment Summary ===")
    print(f"RPC URL: {RPC_URL}")
    print(f"Chain ID: {chain_id}")
    print("\nContracts:")
    print(f"  BillOfLadingFactory: {factory_address}")
    print(f"  ERC20Stablecoin: {stablecoin_address}")
    print("\nAccounts:")
    for name, address in accounts.items():
        print(f"  {name.capitalize()}: {address}")
    print("\n✅ Deployment complete!")

if __name__ == "__main__":
    main()

