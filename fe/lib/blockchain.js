import { ethers } from 'ethers';
import { CONFIG } from './config';

// Cache for contract ABIs and instances
const abiCache = {};
const contractCache = {};

/**
 * Get the RPC provider
 */
export function getProvider() {
  return new ethers.JsonRpcProvider(CONFIG.RPC_URL);
}

/**
 * Get a wallet from private key
 * @param {string} privateKey - Private key (without 0x prefix is fine)
 */
export function getWallet(privateKey) {
  const provider = getProvider();
  // Ensure private key has 0x prefix
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  return new ethers.Wallet(key, provider);
}

/**
 * Load contract ABI from public directory
 * @param {string} contractName - Name of the contract (e.g., 'BillOfLading')
 */
export async function loadContractABI(contractName) {
  if (abiCache[contractName]) {
    return abiCache[contractName];
  }

  try {
    // Try to load from public directory
    const response = await fetch(`/artifacts/contracts/${contractName}.sol/${contractName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ABI for ${contractName}`);
    }
    const artifact = await response.json();
    abiCache[contractName] = artifact.abi;
    return artifact.abi;
  } catch (error) {
    console.error(`Error loading ABI for ${contractName}:`, error);
    throw error;
  }
}

/**
 * Get contract instance
 * @param {string} contractAddress - Contract address
 * @param {string} contractName - Contract name for ABI loading
 * @param {ethers.Wallet} wallet - Wallet to use for signing
 */
export async function getContract(contractAddress, contractName, wallet) {
  const cacheKey = `${contractAddress}-${contractName}`;
  if (contractCache[cacheKey]) {
    return contractCache[cacheKey].connect(wallet);
  }

  const abi = await loadContractABI(contractName);
  const contract = new ethers.Contract(contractAddress, abi, wallet);
  contractCache[cacheKey] = contract;
  return contract;
}

/**
 * Get deployments.json
 */
export async function getDeployments() {
  try {
    const response = await fetch('/deployments.json');
    if (!response.ok) {
      throw new Error('Failed to load deployments.json');
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading deployments:', error);
    throw error;
  }
}

/**
 * Hash shipment data using keccak256 (matches backend implementation)
 * @param {Object} shipmentData - Shipment data object
 * @returns {string} - Hex string of the hash
 */
export function hashShipmentData(shipmentData) {
  // Clean the data - remove None values and empty strings for consistent hashing
  function cleanObject(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj === 'string') return obj.trim() || undefined;
    if (typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = cleanObject(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
    return obj;
  }

  const cleanedData = cleanObject(shipmentData);

  // Convert the entire shipment data to a JSON string
  // Sort keys to ensure consistent hashing
  const jsonStr = JSON.stringify(cleanedData, Object.keys(cleanedData).sort());

  // Hash using keccak256
  return ethers.keccak256(ethers.toUtf8Bytes(jsonStr));
}

/**
 * Create a new Bill of Lading contract
 * @param {Object} params - Parameters for contract creation
 * @param {Object} params.shipmentData - The shipment data object
 * @param {string} params.declaredValue - Declared value as string (e.g., "100")
 * @param {string} params.blNumber - Bill of lading number
 * @param {string} params.carrierPrivateKey - Carrier's private key
 * @returns {Object} - Result with bolHash, contractAddress, transactionHash
 */
export async function createBoL({
  shipmentData,
  declaredValue,
  blNumber,
  carrierPrivateKey
}) {
  try {
    console.log('🚀 Creating BoL contract...');

    // Get deployments and addresses
    const deployments = await getDeployments();
    const factoryAddress = deployments.contracts?.BillOfLadingFactory || deployments.contracts?.TradeFactory;

    if (!factoryAddress) {
      throw new Error('BillOfLadingFactory address not found in deployments');
    }

    // Get wallet addresses
    const buyerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // buyer
    const sellerAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // seller

    // Hash the shipment data
    const bolHash = hashShipmentData(shipmentData);
    console.log('📋 Generated BoL hash:', bolHash);

    // Convert declared value to wei (18 decimals)
    const declaredValueWei = ethers.parseEther(declaredValue);
    console.log('💰 Declared value (wei):', declaredValueWei.toString());

    // Get carrier wallet
    const carrierWallet = getWallet(carrierPrivateKey);

    // Load factory contract ABI and create contract instance
    const factoryAbi = await loadContractABI('BillOfLadingFactory');
    const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, carrierWallet);

    // Call createBoL function
    console.log('📝 Calling createBoL on factory contract...');
    const tx = await factoryContract.createBoL(
      bolHash,
      declaredValueWei,
      sellerAddress, // shipper
      buyerAddress,  // buyer
      blNumber || ''
    );

    console.log('⏳ Transaction submitted:', tx.hash);

    // Wait for confirmation
    const receipt = await waitForTransaction(tx);
    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);

    // Extract the deployed contract address from the transaction receipt
    // The factory contract creates the BoL contract, so we need to find the address
    let bolContractAddress = null;

    // Check logs for contract creation event
    if (receipt.logs && receipt.logs.length > 0) {
      // Try to decode logs to find the created contract address
      // The factory might emit an event with the new contract address
      for (const log of receipt.logs) {
        try {
          // Check if this log is from our factory contract
          if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
            // This is a simple approach - in a real implementation,
            // you'd decode the specific event that contains the contract address
            // For now, we'll use the receipt.contractAddress if available
            if (receipt.contractAddress) {
              bolContractAddress = receipt.contractAddress;
              break;
            }
          }
        } catch (e) {
          // Ignore decoding errors
        }
      }
    }

    // Fallback: If we can't find the address in logs, try to call a getter function
    if (!bolContractAddress) {
      try {
        // Try to get the address from the factory contract
        const deployedAddress = await factoryContract.getBoLByHash(bolHash);
        if (deployedAddress && deployedAddress !== '0x0000000000000000000000000000000000000000') {
          bolContractAddress = deployedAddress;
        }
      } catch (e) {
        console.warn('Could not get contract address from factory:', e);
      }
    }

    if (!bolContractAddress) {
      throw new Error('Could not determine deployed BoL contract address');
    }

    console.log('🏠 Deployed BoL contract at:', bolContractAddress);

    return {
      bolHash,
      contractAddress: bolContractAddress,
      transactionHash: receipt.hash
    };

  } catch (error) {
    console.error('❌ Error creating BoL:', error);
    throw error;
  }
}

/**
 * Wait for transaction confirmation
 * @param {ethers.TransactionResponse} tx - Transaction response
 * @param {number} confirmations - Number of confirmations to wait for
 */
export async function waitForTransaction(tx, confirmations = 1) {
  return await tx.wait(confirmations);
}

/**
 * Hardcoded private keys for local development
 * TODO: Replace with MetaMask in production
 * 
 * These are the default Hardhat dev accounts.
 * In production, use MetaMask or other wallet providers.
 */
// Private keys from .env (Hardhat default accounts)
// These match the accounts that are automatically funded by Hardhat node
const DEV_PRIVATE_KEYS = {
  buyer: process.env.NEXT_PUBLIC_BUYER_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  seller: process.env.NEXT_PUBLIC_SELLER_PRIVATE_KEY || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  carrier: process.env.NEXT_PUBLIC_CARRIER_PRIVATE_KEY || '0x7c852118294e51e653712a81e05800f518141dc2efc8b2b4f8e58e5c1836a5c7', // Account #3: 0x57E0bd037745C84D4174Efa8def4cF42791c0DBF
  investor: process.env.NEXT_PUBLIC_INVESTOR_PRIVATE_KEY || '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f873d9ba39ab8305a1cd6', // Account #4: 0x73BEb597F639091c98db0f66AE10A3e8b5B1Cbd0
};

/**
 * Get private key for current account
 * LOCAL DEV: Returns hardcoded key
 * PRODUCTION: Will use MetaMask (to be implemented)
 * 
 * @param {string} accountRole - Role name (buyer, seller, investor, carrier)
 * @returns {string} Private key
 */
export function getPrivateKey(accountRole) {
  // TODO: In production, check for MetaMask and use that instead
  // if (typeof window !== 'undefined' && window.ethereum) {
  //   // Use MetaMask - return signer instead of private key
  //   const provider = new ethers.BrowserProvider(window.ethereum);
  //   return provider.getSigner();
  // }
  
  const role = accountRole.toLowerCase();
  const privateKey = DEV_PRIVATE_KEYS[role];
  
  if (!privateKey) {
    throw new Error(`Private key not found for role: ${accountRole}. Available roles: ${Object.keys(DEV_PRIVATE_KEYS).join(', ')}`);
  }
  
  return privateKey;
}

/**
 * Parse blockchain error messages to extract readable error text
 * @param {string|Error} error - The error message or Error object
 * @returns {string} - A readable error message
 */
export function parseBlockchainError(error) {
  const errorMessage = error?.message || error?.toString() || String(error);
  const errorCode = error?.code || error?.info?.error?.code;
  
  // Check for nonce errors (NONCE_EXPIRED or nonce too low)
  if (errorCode === 'NONCE_EXPIRED' || 
      errorMessage.includes('nonce has already been used') ||
      errorMessage.includes('Nonce too low') ||
      errorMessage.includes('nonce too low')) {
    return 'Transaction was sent too quickly. Please wait a moment and try again.';
  }
  
  // Check for "BoL hash already exists" error
  if (errorMessage.includes('BoL hash already exists')) {
    return 'This BoL hash already exists. Please use different shipment data.';
  }
  
  // Check for "stablecoin not set" error
  if (errorMessage.includes('stablecoin not set')) {
    return 'Stablecoin is not configured. Please contact support.';
  }
  
  // Check for SafeERC20 errors (common in redeem operations)
  if (errorMessage.includes('SafeERC20FailedOperation') || 
      errorMessage.includes('ERC20InsufficientBalance')) {
    return 'Insufficient balance in contract. This may occur if all tokens have been redeemed or the contract balance is insufficient.';
  }
  
  // Try to extract the reason string from VM Exception errors
  const reasonMatch = errorMessage.match(/reverted with reason string '([^']+)'/);
  if (reasonMatch) {
    const reason = reasonMatch[1];
    // Remove contract name prefix if present (e.g., "BillOfLadingFactory: ")
    const cleanReason = reason.replace(/^[^:]+:\s*/, '');
    return cleanReason;
  }
  
  // Try to decode custom errors from error data
  // Custom errors show as "execution reverted (unknown custom error)" with data field
  if (errorMessage.includes('execution reverted (unknown custom error)')) {
    // Check if we can extract more info from error object
    const errorData = error?.data || error?.info?.error?.data || error?.error?.data;
    if (errorData) {
      // Convert to string if it's not already
      const errorDataStr = typeof errorData === 'string' ? errorData : String(errorData);
      
      // Common custom errors we know about
      // SafeERC20FailedOperation(address,uint256) selector: 0xe450d38c
      if (errorDataStr.includes('SafeERC20FailedOperation') || errorDataStr.includes('0xe450d38c') || errorDataStr.toLowerCase().includes('e450d38c')) {
        return 'Token transfer failed. The investor may not have approved the contract or has insufficient balance.';
      }
      // ERC20InsufficientAllowance(address,uint256,uint256) selector: 0x13365965
      if (errorDataStr.includes('0x13365965') || errorDataStr.toLowerCase().includes('13365965') || errorDataStr.toLowerCase().includes('insufficientallowance')) {
        return 'The investor has not approved enough stablecoins for this offer. Please ask the investor to approve the contract.';
      }
      // ERC20InsufficientBalance(address,uint256,uint256) selector: 0xf4d678b8
      if (errorDataStr.includes('0xf4d678b8') || errorDataStr.toLowerCase().includes('f4d678b8') || errorDataStr.toLowerCase().includes('insufficientbalance')) {
        return 'The investor does not have enough stablecoins to fulfill this offer.';
      }
      // Error selector 0xfb8f41b2 - appears to be SafeERC20FailedOperation or similar
      // This error typically means the transfer failed due to insufficient allowance or balance
      if (errorDataStr.includes('0xfb8f41b2') || errorDataStr.toLowerCase().includes('fb8f41b2')) {
        return 'Token transfer failed. The investor may not have approved the contract to spend stablecoins, or the investor has insufficient balance. Please ensure the investor has approved the contract and has enough balance.';
      }
    }
    // Check for specific error messages in the error string
    if (errorMessage.includes('only seller can accept')) {
      return 'Only the seller can accept offers.';
    }
    if (errorMessage.includes('funding not enabled')) {
      return 'Funding is not enabled for this shipment.';
    }
    if (errorMessage.includes('offer does not exist')) {
      return 'This offer does not exist or has been removed.';
    }
    if (errorMessage.includes('offer already accepted')) {
      return 'This offer has already been accepted.';
    }
    if (errorMessage.includes('would exceed declared value')) {
      return 'Accepting this offer would exceed the declared value of the shipment.';
    }
    if (errorMessage.includes('trade is settled')) {
      return 'This trade has already been settled.';
    }
    return 'Transaction reverted. Please check that the offer is valid and the investor has approved the contract.';
  }
  
  // Try to extract from "Failed to" prefix
  const failedMatch = errorMessage.match(/Failed to[^:]+:\s*(.+)/);
  if (failedMatch) {
    return parseBlockchainError(failedMatch[1]);
  }
  
  // Return original message if no pattern matches
  return errorMessage;
}

