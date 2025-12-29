"""
Wallets service - handles wallet-related endpoints.
"""
import logging
from fastapi import APIRouter, HTTPException

from ..core.blockchain import get_web3, load_deployments, load_contract_abi

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
def get_wallets():
    """
    Get wallet addresses from environment variables with balances.
    Returns wallet configuration with addresses, labels, icons, and balances.
    """
    try:
        w3 = get_web3()

        # Load stablecoin address from deployments
        stablecoin_address = None
        try:
            deployments = load_deployments()
            stablecoin_address = deployments.get("contracts", {}).get("ERC20Stablecoin")
        except Exception as e:
            logger.warning(f"Could not load stablecoin address: {e}")

        # Define wallet configurations - derive addresses from environment private keys
        from eth_account import Account
        import os

        wallet_configs = [
            {
                "id": "buyer",
                "label": "Buyer",
                "icon": "user",
                "private_key_env": "BUYER_PRIVATE_KEY"
            },
            {
                "id": "seller",
                "label": "Seller",
                "icon": "store",
                "private_key_env": "SELLER_PRIVATE_KEY"
            },
            {
                "id": "carrier",
                "label": "Carrier",
                "icon": "truck",
                "private_key_env": "CARRIER_PRIVATE_KEY"
            },
            {
                "id": "investor",
                "label": "Investor",
                "icon": "currency-dollar",
                "private_key_env": "INVESTOR_PRIVATE_KEY"
            }
        ]

        wallets = []
        for config in wallet_configs:
            private_key = os.getenv(config["private_key_env"])
            if private_key:
                account = Account.from_key(private_key)
                wallets.append({
                    "id": config["id"],
                    "label": config["label"],
                    "icon": config["icon"],
                    "address": account.address,
                    "balance": 0,
                    "stablecoin_balance": 0
                })
            else:
                logger.warning(f"No private key found for {config['id']} ({config['private_key_env']})")
                # Fallback to hardcoded addresses for backward compatibility
                fallback_addresses = {
                    "buyer": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                    "seller": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                    "carrier": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
                    "investor": "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
                }
                wallets.append({
                    "id": config["id"],
                    "label": config["label"],
                    "icon": config["icon"],
                    "address": fallback_addresses.get(config["id"], "0x0000000000000000000000000000000000000000"),
                    "balance": 0,
                    "stablecoin_balance": 0
                })

        # Get balances for each wallet
        for wallet in wallets:
            try:
                # Get ETH balance
                balance_wei = w3.eth.get_balance(wallet["address"])
                wallet["balance"] = w3.from_wei(balance_wei, 'ether')

                # Get stablecoin balance if contract is available
                if stablecoin_address:
                    stablecoin_abi = load_contract_abi("ERC20Stablecoin")
                    stablecoin_contract = w3.eth.contract(
                        address=w3.to_checksum_address(stablecoin_address),
                        abi=stablecoin_abi
                    )

                    balance_stablecoin = stablecoin_contract.functions.balanceOf(wallet["address"]).call()
                    wallet["stablecoin_balance"] = w3.from_wei(balance_stablecoin, 'ether')
                else:
                    wallet["stablecoin_balance"] = 0

            except Exception as e:
                logger.warning(f"Could not get balance for {wallet['id']}: {e}")
                wallet["balance"] = 0
                wallet["stablecoin_balance"] = 0

        return wallets

    except Exception as e:
        logger.error(f"Error getting wallets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve wallets: {str(e)}"
        )
