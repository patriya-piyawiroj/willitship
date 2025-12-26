"""
Wallets service - handles wallet-related endpoints.
"""
import logging
from fastapi import APIRouter, HTTPException

from .blockchain import get_web3

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
            from .blockchain import load_deployments
            deployments = load_deployments()
            stablecoin_address = deployments.get("contracts", {}).get("ERC20Stablecoin")
        except Exception as e:
            logger.warning(f"Could not load stablecoin address: {e}")

        # Define wallet configurations
        wallets = [
            {
                "id": "buyer",
                "label": "Buyer",
                "icon": "user",
                "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                "balance": 0,
                "stablecoin_balance": 0
            },
            {
                "id": "seller",
                "label": "Seller",
                "icon": "store",
                "address": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                "balance": 0,
                "stablecoin_balance": 0
            },
            {
                "id": "carrier",
                "label": "Carrier",
                "icon": "truck",
                "address": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
                "balance": 0,
                "stablecoin_balance": 0
            },
            {
                "id": "investor1",
                "label": "Investor 1",
                "icon": "currency-dollar",
                "address": "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
                "balance": 0,
                "stablecoin_balance": 0
            },
            {
                "id": "investor2",
                "label": "Investor 2",
                "icon": "currency-dollar",
                "address": "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
                "balance": 0,
                "stablecoin_balance": 0
            }
        ]

        # Get balances for each wallet
        for wallet in wallets:
            try:
                # Get ETH balance
                balance_wei = w3.eth.get_balance(wallet["address"])
                wallet["balance"] = w3.from_wei(balance_wei, 'ether')

                # Get stablecoin balance if contract is available
                if stablecoin_address:
                    from .blockchain import load_contract_abi
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
