#!/usr/bin/env python3
"""
Utility functions for interacting with the blockchain using Python.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from web3 import Web3
from eth_account import Account

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

RPC_URL = os.getenv("RPC_URL", "http://localhost:8545")

def get_web3() -> Web3:
    """Get Web3 instance connected to the local node."""
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError(f"Could not connect to {RPC_URL}")
    return w3

def get_account(private_key: str) -> Account:
    """Get account from private key."""
    return Account.from_key(private_key)

def get_contract(w3: Web3, address: str, abi: list) -> object:
    """Get contract instance."""
    return w3.eth.contract(address=address, abi=abi)

def load_contract_abi(contract_name: str) -> dict:
    """Load contract ABI from Hardhat artifacts."""
    from pathlib import Path
    
    # Artifacts are in the ethereum folder
    artifacts_dir = Path(__file__).parent.parent.parent / "ethereum" / "artifacts" / "contracts"
    contract_file = artifacts_dir / f"{contract_name}.sol" / f"{contract_name}.json"
    
    if not contract_file.exists():
        raise FileNotFoundError(f"Contract ABI not found: {contract_file}")
    
    import json
    with open(contract_file) as f:
        artifact = json.load(f)
        return artifact["abi"]

def get_contract_bytecode(contract_name: str) -> str:
    """Get contract bytecode from Hardhat artifacts."""
    from pathlib import Path
    
    # Artifacts are in the ethereum folder
    artifacts_dir = Path(__file__).parent.parent.parent / "ethereum" / "artifacts" / "contracts"
    contract_file = artifacts_dir / f"{contract_name}.sol" / f"{contract_name}.json"
    
    if not contract_file.exists():
        raise FileNotFoundError(f"Contract bytecode not found: {contract_file}")
    
    import json
    with open(contract_file) as f:
        artifact = json.load(f)
        return artifact["bytecode"]

