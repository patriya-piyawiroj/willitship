/**
 * Blockchain Service
 */

import { CONFIG } from '../config.js';
import { state } from '../state.js';

export class BlockchainService {
    constructor() {
        this.rpcUrl = CONFIG.RPC_URL;
    }
    
    async fetchBlockNumber() {
        try {
            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1
                })
            });
            
            const data = await response.json();
            if (data.result) {
                return parseInt(data.result, 16);
            }
        } catch (error) {
            console.error('Error fetching block number:', error);
        }
        return null;
    }
    
    async fetchAccountBalance(address) {
        try {
            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1
                })
            });
            
            const data = await response.json();
            if (data.result) {
                return parseInt(data.result, 16) / 1e18;
            }
        } catch (error) {
            console.error('Error fetching account balance:', error);
        }
        return null;
    }
    
    async loadDeployments() {
        try {
            const response = await fetch('/deployments.json');
            const deployments = await response.json();
            state.set('deployments', deployments);
            return deployments;
        } catch (error) {
            console.error('Error loading deployments:', error);
            // Try alternative path
            try {
                const response = await fetch('../smart-contract/deployments.json');
                const deployments = await response.json();
                state.set('deployments', deployments);
                return deployments;
            } catch (e) {
                console.error('Could not load deployments.json');
            }
        }
        return null;
    }
    
    async loadWallets() {
        try {
            const response = await fetch(`${this.apiUrl}/wallets`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const wallets = await response.json();
            return wallets;
        } catch (error) {
            console.error('Error loading wallets from API:', error);
            // Fallback: try to get from deployments.json
            try {
                const deployments = await this.loadDeployments();
                if (deployments && deployments.accounts) {
                    // Convert deployments accounts format to wallet format
                    const wallets = {};
                    const iconMap = {
                        'buyer': 'user',
                        'seller': 'store',
                        'carrier': 'truck',
                        'investor': 'currency-dollar'
                    };
                    const labelMap = {
                        'buyer': 'Buyer',
                        'seller': 'Seller',
                        'carrier': 'Carrier',
                        'investor': 'Investor'
                    };
                    
                    for (const [key, address] of Object.entries(deployments.accounts)) {
                        if (key !== 'deployer' && iconMap[key]) {
                            wallets[key] = {
                                address: address,
                                label: labelMap[key],
                                icon: iconMap[key]
                            };
                        }
                    }
                    return wallets;
                }
            } catch (e) {
                console.error('Could not load wallets from deployments.json:', e);
            }
            return null;
        }
    }
    
}

