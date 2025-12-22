"""
Event listener service for smart contract events.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from web3 import Web3
from eth_utils import keccak, to_bytes, text_if_str

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from .models import (
    Base,
    BillOfLading,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class EventListener:
    """Listens to smart contract events and stores them in the database."""
    
    def __init__(self, rpc_url: str, db_connection_string: str, deployments_file: str):
        self.rpc_url = rpc_url
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        # Database setup
        self.engine = create_engine(db_connection_string, poolclass=NullPool, echo=False)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        
        # Create tables (only creates if they don't exist)
        Base.metadata.create_all(bind=self.engine)
        
        # Load deployments
        self.deployments = self._load_deployments(deployments_file)
        self.factory_address = self.deployments.get("contracts", {}).get("BillOfLadingFactory")
        
        if not self.factory_address:
            raise ValueError("BillOfLadingFactory address not found in deployments.json")
        
        # Load contract ABIs
        self.factory_abi = self._load_abi("BillOfLadingFactory")
        self.bol_abi = self._load_abi("BillOfLading")
        
        # Get contract instances
        self.factory_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.factory_address),
            abi=self.factory_abi
        )
        
        # Track last processed block
        self.last_block: Optional[int] = None
        
    def _load_deployments(self, deployments_file: str) -> dict:
        """Load deployment addresses from JSON file."""
        deployments_path = Path(deployments_file)
        if not deployments_path.exists():
            return {}
        
        with open(deployments_path) as f:
            return json.load(f)
    
    def _load_abi(self, contract_name: str) -> list:
        """Load contract ABI from Hardhat artifacts."""
        # Always use Docker volume mount path since we always run in Docker
        abi_path = Path("/app/artifacts/contracts") / f"{contract_name}.sol" / f"{contract_name}.json"
        
        if abi_path.exists():
            with open(abi_path) as f:
                artifact = json.load(f)
                return artifact.get("abi", [])
        else:
            raise FileNotFoundError(f"ABI not found for {contract_name} at {abi_path}. Make sure artifacts are mounted in docker-compose.yaml")
    
    def _get_last_processed_block(self) -> int:
        """Get the last processed block number from the database."""
        # Start from current block - 200 to ensure we catch recent events
        # This is a safety margin to catch events that happened just before the listener started
        current_block = self.w3.eth.block_number
        start_block = max(0, current_block - 200)
        return start_block
    
    def _handle_created(self, event):
        """Handle Created event from BillOfLading and insert into bill_of_ladings table."""
        db = self.SessionLocal()
        try:
            # Get bolHash from the BillOfLading contract
            bol_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(event.address),
                abi=self.bol_abi
            )
            trade_state = bol_contract.functions.getTradeState().call()
            bol_hash = trade_state[0]  # First element is bolHash
            bol_hash_hex = Web3.to_hex(bol_hash)
            
            # Get blNumber from event args (Created event now includes blNumber as 4th parameter)
            bl_number = ""
            try:
                # The Created event signature is: Created(address indexed buyer, address indexed seller, uint256 declaredValue, string blNumber)
                if hasattr(event.args, 'blNumber'):
                    bl_number = event.args.blNumber
                elif hasattr(event.args, '__getitem__') and len(event.args) >= 4:
                    # Access by index if it's a tuple-like object
                    bl_number = str(event.args[3]) if event.args[3] else ""
            except (AttributeError, IndexError, TypeError):
                bl_number = ""
            
            # Check if bill_of_lading already exists
            existing = db.query(BillOfLading).filter_by(bol_hash=bol_hash_hex).first()
            
            if not existing:
                bill_of_lading = BillOfLading(
                    bol_hash=bol_hash_hex,
                    contract_address=event.address,
                    buyer=event.args.buyer,
                    seller=event.args.seller,
                    declared_value=str(event.args.declaredValue),
                    bl_number=bl_number
                )
                db.add(bill_of_lading)
                db.commit()
                
        except Exception as e:
            logger.error(f"Error handling Created event: {e}", exc_info=True)
            db.rollback()
        finally:
            db.close()
    
    def _handle_active(self, event):
        """Handle Active event from BillOfLading - set is_active to True."""
        db = self.SessionLocal()
        try:
            bol = db.query(BillOfLading).filter_by(contract_address=event.address).first()
            if bol:
                bol.is_active = True
                db.commit()
        except Exception as e:
            logger.error(f"Error handling Active: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_funded(self, event):
        """Handle Funded event from BillOfLading - update total_funded in bill_of_ladings table."""
        db = self.SessionLocal()
        try:
            bol = db.query(BillOfLading).filter_by(contract_address=event.address).first()
            if bol:
                # Add the funded amount to total_funded
                current_funded = int(bol.total_funded) if bol.total_funded else 0
                new_amount = int(event.args.amount)
                bol.total_funded = str(current_funded + new_amount)
                db.commit()
        except Exception as e:
            logger.error(f"Error handling Funded: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_full(self, event):
        """Handle Full event from BillOfLading - log that funding is complete.
        Note: is_full can be derived by checking if total_funded == declared_value."""
        pass
    
    def _handle_inactive(self, event):
        """Handle Inactive event from BillOfLading - set is_active to False."""
        db = self.SessionLocal()
        try:
            bol = db.query(BillOfLading).filter_by(contract_address=event.address).first()
            if bol:
                bol.is_active = False
                db.commit()
        except Exception as e:
            logger.error(f"Error handling Inactive: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_paid(self, event):
        """Handle Paid event from BillOfLading - update total_paid in bill_of_ladings table."""
        db = self.SessionLocal()
        try:
            bol = db.query(BillOfLading).filter_by(contract_address=event.address).first()
            if bol:
                # Add the paid amount to total_paid
                current_paid = int(bol.total_paid) if bol.total_paid else 0
                new_amount = int(event.args.amount)
                bol.total_paid = str(current_paid + new_amount)
                db.commit()
        except Exception as e:
            logger.error(f"Error handling Paid: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_claimed(self, event):
        """Handle Claimed event from BillOfLading - update total_claimed in bill_of_ladings table."""
        db = self.SessionLocal()
        try:
            bol = db.query(BillOfLading).filter_by(contract_address=event.address).first()
            if bol:
                # Add the claimed amount to total_claimed
                current_claimed = int(bol.total_claimed) if bol.total_claimed else 0
                new_amount = int(event.args.amount)
                bol.total_claimed = str(current_claimed + new_amount)
                db.commit()
        except Exception as e:
            logger.error(f"Error handling Claimed: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_settled(self, event):
        """Handle Settled event from BillOfLading - log that trade is settled.
        Note: is_settled can be derived by checking if total_claimed == total_paid."""
        pass
    
    def _get_all_bol_addresses(self) -> list:
        """Get all BillOfLading contract addresses from bill_of_ladings table."""
        db = self.SessionLocal()
        try:
            # Check if contract_address column exists by trying to query it
            # If it doesn't exist, return empty list (table might not be migrated yet)
            try:
                addresses = db.query(BillOfLading.contract_address).distinct().all()
                return [addr[0] for addr in addresses if addr[0]]
            except Exception:
                # Column doesn't exist or table is empty - return empty list
                return []
        finally:
            db.close()
    
    async def listen(self):
        """Main event listening loop."""
        # Get last processed block
        self.last_block = self._get_last_processed_block()
        
        while True:
            try:
                current_block = self.w3.eth.block_number
                
                if current_block > self.last_block:
                    # Process new blocks
                    from_block = self.last_block + 1
                    to_block = min(current_block, self.last_block + 100)  # Process in batches
                    
                    # Listen to all BillOfLading contract events
                    self._process_bol_events(from_block, to_block)
                    
                    self.last_block = to_block
                
                # Wait before next check
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"Error in event listener loop: {e}", exc_info=True)
                await asyncio.sleep(10)
    
    def _process_bol_events(self, from_block: int, to_block: int):
        """Process events from all BillOfLading contracts."""
        # First, scan for Created events to discover new contracts
        # This ensures we catch events from newly deployed contracts
        discovered_contracts = []
        try:
            # Scan for Created events across all contracts
            # In web3.py v7, use w3.eth.get_logs() with event signature filter
            event_contract = self.w3.eth.contract(abi=self.bol_abi)
            created_event = event_contract.events.Created
            
            # Get event signature hash (topic[0])
            # Event signature is keccak256 hash of "EventName(type1,type2,...)"
            event_abi = created_event._get_event_abi()
            event_signature_str = f"{event_abi['name']}({','.join([inp['type'] for inp in event_abi['inputs']])})"
            event_signature = keccak(text_if_str(to_bytes, event_signature_str))
            
            # Get logs using w3.eth.get_logs() with event signature filter
            logs = self.w3.eth.get_logs({
                'fromBlock': from_block,
                'toBlock': to_block,
                'topics': [event_signature]
            })
            
            # Decode the logs
            created_events = []
            for log in logs:
                try:
                    decoded = created_event().process_log(log)
                    created_events.append(decoded)
                except Exception:
                    pass
            
            # Process Created events immediately when discovered
            for event in created_events:
                event_address = event.address
                # Handle the Created event immediately
                self._handle_created(event)
                discovered_contracts.append(event_address)
        except Exception as e:
            logger.error(f"Error discovering new contracts: {e}", exc_info=True)
        
        # Get known contract addresses from database
        bol_addresses = self._get_all_bol_addresses()
        
        # Add newly discovered contracts
        for addr in discovered_contracts:
            if addr not in bol_addresses:
                bol_addresses.append(addr)
        
        # Remove duplicates
        bol_addresses = list(set(bol_addresses))
        
        # Process all other event types from known contracts
        for bol_address in bol_addresses:
            try:
                bol_contract = self.w3.eth.contract(
                    address=Web3.to_checksum_address(bol_address),
                    abi=self.bol_abi
                )
                
                # Process all event types (except Created, which we already processed)
                self._process_contract_events(bol_contract, from_block, to_block, skip_created=True)
            except Exception as e:
                logger.error(f"Error processing events for BOL {bol_address}: {e}", exc_info=True)
    
    def _process_contract_events(self, contract, from_block: int, to_block: int, skip_created: bool = False):
        """Process all events from a BillOfLading contract."""
        event_handlers = {
            "Created": self._handle_created,
            "Active": self._handle_active,
            "Funded": self._handle_funded,
            "Full": self._handle_full,
            "Inactive": self._handle_inactive,
            "Paid": self._handle_paid,
            "Claimed": self._handle_claimed,
            "Settled": self._handle_settled,
        }
        
        for event_name, handler in event_handlers.items():
            if skip_created and event_name == "Created":
                continue  # Skip Created events if already processed
                
            try:
                if hasattr(contract.events, event_name):
                    event_obj = getattr(contract.events, event_name)
                    # In web3.py v7, use w3.eth.get_logs() with event signature filter
                    # Get event signature hash (topic[0])
                    # Event signature is keccak256 hash of "EventName(type1,type2,...)"
                    event_abi = event_obj._get_event_abi()
                    event_signature_str = f"{event_abi['name']}({','.join([inp['type'] for inp in event_abi['inputs']])})"
                    event_signature = keccak(text_if_str(to_bytes, event_signature_str))
                    
                    # Build filter dict
                    filter_dict = {
                        'fromBlock': from_block,
                        'toBlock': to_block,
                        'topics': [event_signature]
                    }
                    
                    # Add address filter if contract is specified
                    if contract.address:
                        filter_dict['address'] = contract.address
                    
                    # Get logs using w3.eth.get_logs()
                    logs = self.w3.eth.get_logs(filter_dict)
                    
                    # Decode the logs
                    events = []
                    for log in logs:
                        try:
                            decoded = event_obj().process_log(log)
                            events.append(decoded)
                        except Exception:
                            pass
                    for event in events:
                        handler(event)
            except Exception as e:
                logger.error(f"Error processing {event_name} events: {e}")

