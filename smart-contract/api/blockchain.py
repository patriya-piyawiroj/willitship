"""
Blockchain interaction utilities.
"""
import json
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from web3 import Web3
from web3 import logs as web3_logs
from eth_account import Account

logger = logging.getLogger(__name__)

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

def get_account_private_key(role: str) -> str:
    """Get account private key from environment variable."""
    env_key = f"{role.upper()}_PRIVATE_KEY"
    private_key = os.getenv(env_key)
    if not private_key:
        raise ValueError(f"Environment variable {env_key} is not set. Please set it in .env file.")
    return private_key

def get_account_address_from_key(private_key: str) -> str:
    """Get account address from private key."""
    account = Account.from_key(private_key)
    return account.address


def get_web3(rpc_url: str = None) -> Web3:
    """Get Web3 instance connected to the node."""
    if rpc_url is None:
        # In Docker, always use host.docker.internal regardless of env var
        # This ensures we can reach the host machine's Ethereum node
        if os.path.exists("/.dockerenv"):
            rpc_url = "http://host.docker.internal:8545"
            logger.debug(f"Running in Docker, using: {rpc_url}")
        else:
            # Local development - use env var or default to localhost
        rpc_url = os.getenv("RPC_URL", "http://localhost:8545")
            logger.debug(f"Running locally, using: {rpc_url}")
    
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    
    if not w3.is_connected():
        raise ConnectionError(f"Could not connect to {rpc_url}")
    
    return w3


def get_account(role: str) -> Account:
    """Get account from role name."""
    private_key = get_account_private_key(role)
    return Account.from_key(private_key)


def get_account_address(role: str) -> str:
    """Get account address from role name."""
    private_key = get_account_private_key(role)
    return get_account_address_from_key(private_key)


def load_contract_abi(contract_name: str) -> list:
    """Load contract ABI from artifacts."""
    # Try multiple possible paths
    # __file__ is smart-contract/api/blockchain.py
    # So parent.parent.parent is willitship-eth/ (root)
    possible_paths = [
        Path("/app/artifacts/contracts") / f"{contract_name}.sol" / f"{contract_name}.json",  # Docker volume mount
        Path(__file__).parent.parent.parent / "ethereum" / "artifacts" / "contracts" / f"{contract_name}.sol" / f"{contract_name}.json",  # root/ethereum/artifacts
        Path(__file__).parent.parent / "artifacts" / "contracts" / f"{contract_name}.sol" / f"{contract_name}.json",  # smart-contract/artifacts (fallback)
    ]
    
    for abi_path in possible_paths:
        if abi_path.exists():
            with open(abi_path) as f:
                artifact = json.load(f)
                return artifact.get("abi", [])
    
    raise FileNotFoundError(f"ABI not found for {contract_name}. Tried: {[str(p) for p in possible_paths]}")


def load_deployments(deployments_file: str = None) -> dict:
    """Load deployment addresses from JSON file."""
    if deployments_file is None:
        # Try multiple possible paths
        # __file__ is smart-contract/api/blockchain.py
        # So parent.parent is smart-contract/
        possible_paths = [
            "/app/deployments.json",  # Docker volume mount
            Path(__file__).parent.parent / "deployments.json",  # smart-contract/deployments.json
            Path(__file__).parent.parent.parent / "smart-contract" / "deployments.json",  # root/smart-contract/deployments.json
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                deployments_file = str(path)
                break
        
        if not deployments_file:
            raise FileNotFoundError(f"deployments.json not found. Tried: {[str(p) for p in possible_paths]}")
    
    with open(deployments_file) as f:
        return json.load(f)


def hash_shipment_data(shipment_data: dict) -> bytes:
    """Hash all shipment data using keccak256."""
    # Clean the data - remove None values and empty strings for consistent hashing
    def clean_dict(d):
        if isinstance(d, dict):
            return {k: clean_dict(v) for k, v in d.items() if v is not None and v != ""}
        elif isinstance(d, list):
            return [clean_dict(item) for item in d if item is not None and item != ""]
        else:
            return d
    
    cleaned_data = clean_dict(shipment_data)
    
    # Convert the entire shipment data to a JSON string
    # Sort keys to ensure consistent hashing
    json_str = json.dumps(cleaned_data, sort_keys=True, separators=(',', ':'))
    
    # Hash using keccak256
    w3 = get_web3()
    return w3.keccak(text=json_str)


def create_bol(
    w3: Web3,
    account: Account,
    factory_address: str,
    bol_hash: bytes,
    declared_value: int,
    shipper_address: str,
    buyer_address: str,
    bl_number: str = ""
) -> dict:
    """Call createBoL on the factory contract."""
    # Load factory ABI
    factory_abi = load_contract_abi("BillOfLadingFactory")
    
    # Get factory contract
    factory_contract = w3.eth.contract(
        address=Web3.to_checksum_address(factory_address),
        abi=factory_abi
    )
    
    # Ensure bol_hash is exactly 32 bytes (bytes32)
    if len(bol_hash) != 32:
        raise ValueError(f"BoL hash must be 32 bytes, got {len(bol_hash)} bytes")
    
    # Build transaction
    tx = factory_contract.functions.createBoL(
        bol_hash,
        declared_value,
        Web3.to_checksum_address(shipper_address),
        Web3.to_checksum_address(buyer_address),
        bl_number
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 5000000,  # Large gas limit for contract deployment
        "gasPrice": w3.eth.gas_price,
    })
    
    # Sign transaction
    signed_txn = account.sign_transaction(tx)
    
    # Send transaction
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    
    # Wait for receipt
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    # Get the BillOfLading address from the transaction receipt
    # The contract is deployed in this transaction, so we can get it from the receipt
    bill_of_lading_address = None
    if receipt.status == 1:
        # Get the contract address from the receipt (contract deployment creates a new contract)
        # We need to find the contract creation in the receipt
        if receipt.contractAddress:
            # This is a direct contract deployment, but createBoL deploys a contract internally
            # So we need to get it from getBoLByHash instead
            pass
        
        # Get the address by calling getBoLByHash on the factory
        try:
            exists, bill_of_lading_address = factory_contract.functions.getBoLByHash(bol_hash).call()
            if not exists:
                raise ValueError("BillOfLading contract was not found after deployment")
        except Exception as e:
            logger.error(f"Could not get BillOfLading address: {e}")
            raise
        
        # Call mint() on the new BillOfLading contract to emit Created event
        # Note: mint() requires stablecoin to be set, which the factory does automatically
        # if defaultStablecoin is configured
        try:
            bol_abi = load_contract_abi("BillOfLading")
            bol_contract = w3.eth.contract(
                address=Web3.to_checksum_address(bill_of_lading_address),
                abi=bol_abi
            )
            
            # Build mint transaction using the values we already have
            mint_tx = bol_contract.functions.mint(
                buyer_address,
                shipper_address,
                declared_value
            ).build_transaction({
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "gas": 500000,
                "gasPrice": w3.eth.gas_price,
            })
            
            # Sign and send mint transaction
            signed_mint_txn = account.sign_transaction(mint_tx)
            mint_tx_hash = w3.eth.send_raw_transaction(signed_mint_txn.raw_transaction)
            mint_receipt = w3.eth.wait_for_transaction_receipt(mint_tx_hash)
            
            if mint_receipt.status == 1:
                logger.info(f"Successfully called mint() on BillOfLading: {bill_of_lading_address}")
            else:
                logger.warning(f"mint() transaction failed for BillOfLading: {bill_of_lading_address}. Stablecoin may not be set.")
        except Exception as e:
            logger.error(f"Error calling mint() on BillOfLading: {e}", exc_info=True)
            # Don't fail the whole operation if mint() fails
            # The event listener will still catch the Created event when mint() is called later
    
    return {
        "transaction_hash": tx_hash.hex(),
        "receipt": receipt,
        "bill_of_lading_address": bill_of_lading_address,
    }

