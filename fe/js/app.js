/**
 * Main Application Entry Point
 */

import { state } from './state.js';
import { Router } from './router.js';
import { AccountDropdown } from './components/AccountDropdown.js';
import { ActivityLog } from './components/ActivityLog.js';
import { BlockchainService } from './services/blockchain.js';
import { formatAddress } from './utils.js';

class App {
    constructor() {
        this.router = null;
        this.accountDropdown = null;
        this.activityLog = null;
        this.blockchainService = new BlockchainService();
        this.init();
    }
    
    async init() {
        // Load wallets first (before initializing components that depend on them)
        await this.blockchainService.loadDeployments();
        
        // Load wallets from API (reads from .env, includes balances)
        const wallets = await this.blockchainService.loadWallets();
        if (wallets) {
            state.set('wallets', wallets);
            // Update balance display immediately since wallets now include balances
            this.fetchAccountBalance();
        }
        
        // Initialize components (after wallets are loaded)
        this.router = new Router('main-content');
        this.accountDropdown = new AccountDropdown('account-button', 'account-dropdown');
        this.activityLog = new ActivityLog('activity-log');
        
        // Setup account change handler
        state.subscribe('currentAccount', (accountType) => {
            this.handleAccountChange(accountType);
        });
        
        // Subscribe to wallets updates to refresh balances
        state.subscribe('wallets', () => {
            this.fetchAccountBalance();
        });
        
        // Setup activity log event listener
        window.addEventListener('activity', (e) => {
            if (this.activityLog) {
                this.activityLog.addEntry(e.detail.message, e.detail.details);
            }
        });
        
        // Periodic balance updates (refresh wallets to get latest balances)
        setInterval(async () => {
            const refreshedWallets = await this.blockchainService.loadWallets();
            if (refreshedWallets) {
                state.set('wallets', refreshedWallets);
            }
        }, 10000);
    }
    
    async handleAccountChange(accountType) {
        const wallets = state.get('wallets');
        
        if (!wallets) return;
        
        const wallet = wallets[accountType];
        if (!wallet) return;
        
        // Fetch balance for new account
        await this.fetchAccountBalance();
        
        // Add activity log entry
        if (this.activityLog) {
            this.activityLog.addEntry(
                `Switched to ${wallet.label}`,
                formatAddress(wallet.address)
            );
        }
        
        console.log(`Switched to ${wallet.label}:`, wallet.address);
    }
    
    async fetchAccountBalance() {
        const currentAccount = state.get('currentAccount');
        const wallets = state.get('wallets');
        const wallet = wallets[currentAccount];
        
        if (!wallet || !wallet.balance) {
            // If balance not available from wallet data, try to refresh wallets
            const refreshedWallets = await this.blockchainService.loadWallets();
            if (refreshedWallets) {
                state.set('wallets', refreshedWallets);
                const refreshedWallet = refreshedWallets[currentAccount];
                if (refreshedWallet && refreshedWallet.balance) {
                    this.updateBalanceDisplay(refreshedWallet.balance);
                }
            }
            return;
        }
        
        this.updateBalanceDisplay(wallet.balance);
    }
    
    updateBalanceDisplay(balance) {
        // Update ETH balance
        const ethElement = document.getElementById('eth-balance');
        if (ethElement && balance.eth !== undefined) {
            ethElement.textContent = `${balance.eth.toFixed(4)} ETH`;
        }
        
        // Update stablecoin balance
        const stablecoinElement = document.getElementById('stablecoin-balance');
        if (stablecoinElement && balance.stablecoin !== undefined) {
            stablecoinElement.textContent = `${balance.stablecoin.toFixed(2)}`;
        } else if (stablecoinElement) {
            stablecoinElement.textContent = '0.00';
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

