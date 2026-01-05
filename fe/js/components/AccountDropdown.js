/**
 * Account Dropdown Component
 */

import { state } from '../state.js';
import { ICONS } from '../config.js';
import { formatAddress } from '../utils.js';

export class AccountDropdown {
    constructor(buttonId, dropdownId) {
        this.button = document.getElementById(buttonId);
        this.dropdown = document.getElementById(dropdownId);
        this.init();
    }
    
    init() {
        if (!this.button || !this.dropdown) return;
        
        this.setupEventListeners();
        this.populateDropdown();
        this.updateDisplay();
        
        // Subscribe to account changes
        state.subscribe('currentAccount', () => {
            this.updateDisplay();
        });
        
        // Subscribe to wallets loading
        state.subscribe('wallets', () => {
            this.populateDropdown();
            this.updateDisplay();
        });
    }
    
    setupEventListeners() {
        // Toggle dropdown on button click
        this.button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Use event delegation for option selection (works even if options are updated)
        this.dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.account-option');
            if (option) {
                e.stopPropagation();
                const accountType = option.getAttribute('data-account');
                console.log('AccountDropdown: option clicked', accountType);
                this.selectAccount(accountType);
                this.close();
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.dropdown.contains(e.target) && !this.button.contains(e.target)) {
                this.close();
            }
        });
    }
    
    populateDropdown() {
        const options = this.dropdown.querySelectorAll('.account-option');
        const wallets = state.get('wallets');
        
        if (!wallets) {
            // Wallets not loaded yet, will be populated when they load
            return;
        }
        
        options.forEach(option => {
            const accountType = option.getAttribute('data-account');
            const wallet = wallets[accountType];
            
            if (wallet) {
                // Update address
                const addressElement = option.querySelector('.option-address');
                if (addressElement) {
                    addressElement.textContent = formatAddress(wallet.address);
                }
                
                // Update icon
                const iconElement = option.querySelector('.option-icon');
                if (iconElement) {
                    const iconPath = ICONS[wallet.icon] || ICONS.user;
                    iconElement.innerHTML = iconPath;
                }
            }
        });
    }
    
    updateDisplay() {
        const currentAccount = state.get('currentAccount');
        const wallets = state.get('wallets');
        
        console.log('AccountDropdown.updateDisplay() called', { currentAccount, wallets: !!wallets });
        
        if (!wallets) {
            console.log('Wallets not loaded yet, skipping display update');
            return;
        }
        
        const wallet = wallets[currentAccount];
        if (!wallet) {
            console.log(`Wallet not found for account: ${currentAccount}`);
            return;
        }
        
        console.log('Updating display for wallet:', wallet);
        
        // Update button icon
        const iconElement = this.button.querySelector('#current-account-icon');
        if (iconElement) {
            const iconPath = ICONS[wallet.icon] || ICONS.user;
            iconElement.innerHTML = iconPath;
            console.log('Updated icon to:', wallet.icon);
        } else {
            console.warn('Could not find current-account-icon element in button:', this.button);
        }
        
        // Update button label
        const labelElement = this.button.querySelector('#current-account-label');
        if (labelElement) {
            labelElement.textContent = wallet.label;
            console.log('Updated label to:', wallet.label);
        } else {
            console.warn('Could not find current-account-label element in button:', this.button);
        }
        
        // Update active option
        this.updateActiveOption();
    }
    
    updateActiveOption() {
        const currentAccount = state.get('currentAccount');
        const options = this.dropdown.querySelectorAll('.account-option');
        
        options.forEach(option => {
            const accountType = option.getAttribute('data-account');
            if (accountType === currentAccount) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }
    
    selectAccount(accountType) {
        console.log('AccountDropdown.selectAccount() called with:', accountType);
        const oldAccount = state.get('currentAccount');
        state.set('currentAccount', accountType);
        console.log('Account changed from', oldAccount, 'to', accountType);
    }
    
    toggle() {
        this.dropdown.classList.toggle('show');
        this.button.classList.toggle('active');
    }
    
    close() {
        this.dropdown.classList.remove('show');
        this.button.classList.remove('active');
    }
}

