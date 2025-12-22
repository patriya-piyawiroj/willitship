export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

export function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = obj;
    
    for (const part of parts) {
        if (!current[part]) {
            current[part] = {};
        }
        current = current[part];
    }
    
    current[lastPart] = value;
}

/**
 * Parse blockchain error messages to extract readable error text
 * @param {string|Error} error - The error message or Error object
 * @returns {string} - A readable error message
 */
export function parseBlockchainError(error) {
    const errorMessage = error?.message || error?.toString() || String(error);
    
    // Check for "BoL hash already exists" error
    if (errorMessage.includes('BoL hash already exists') || 
        errorMessage.includes('BoL hash already exists')) {
        return 'This BoL hash already exists. Please use different shipment data.';
    }
    
    // Check for "stablecoin not set" error
    if (errorMessage.includes('stablecoin not set')) {
        return 'Stablecoin is not configured. Please contact support.';
    }
    
    // Try to extract the reason string from VM Exception errors
    const reasonMatch = errorMessage.match(/reverted with reason string '([^']+)'/);
    if (reasonMatch) {
        const reason = reasonMatch[1];
        // Remove contract name prefix if present (e.g., "BillOfLadingFactory: ")
        const cleanReason = reason.replace(/^[^:]+:\s*/, '');
        return cleanReason;
    }
    
    // Try to extract from "Failed to create shipment:" prefix
    const failedMatch = errorMessage.match(/Failed to create shipment:\s*(.+)/);
    if (failedMatch) {
        return parseBlockchainError(failedMatch[1]);
    }
    
    // Return original message if no pattern matches
    return errorMessage;
}

