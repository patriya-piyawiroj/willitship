/**
 * Home Page Component
 */

import { state } from '../state.js';
import { createElement } from '../utils.js';

export class HomePage {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.carrierContent = null;
        this.otherContent = null;
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        this.render();
        this.setupEventListeners();
        
        // Subscribe to account changes
        state.subscribe('currentAccount', () => {
            this.updateContent();
        });
    }
    
    render() {
        this.container.innerHTML = `
            <div id="home-content">
                <!-- Carrier specific content -->
                <div id="carrier-content" style="display: none;">
                    <div class="action-section">
                        <button class="create-shipment-btn" id="create-shipment-btn">
                            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            <div class="btn-content">
                                <div class="btn-title">Create Shipment</div>
                                <div class="btn-subtitle">Upload eBL</div>
                            </div>
                        </button>
                    </div>
                    
                    <div class="shipments-list">
                        <h3 class="list-title">Current Shipments</h3>
                        <div class="shipment-item">
                            <div class="shipment-placeholder">Shipment 1</div>
                        </div>
                        <div class="shipment-item">
                            <div class="shipment-placeholder">Shipment 2</div>
                        </div>
                    </div>
                </div>
                
                <!-- Other roles - empty for now -->
                <div id="other-content" style="display: none;">
                    <p class="empty-state">Content for other roles coming soon...</p>
                </div>
            </div>
        `;
        
        // Get content sections
        this.carrierContent = document.getElementById('carrier-content');
        this.otherContent = document.getElementById('other-content');
        
        // Update content based on current account
        this.updateContent();
    }
    
    updateContent() {
        const currentAccount = state.get('currentAccount');
        
        if (currentAccount === 'carrier') {
            if (this.carrierContent) this.carrierContent.style.display = 'block';
            if (this.otherContent) this.otherContent.style.display = 'none';
        } else {
            if (this.carrierContent) this.carrierContent.style.display = 'none';
            if (this.otherContent) this.otherContent.style.display = 'block';
        }
    }
    
    setupEventListeners() {
        // Use event delegation for dynamically loaded content
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#create-shipment-btn')) {
                state.set('currentRoute', 'upload');
            }
        });
    }
    
    destroy() {
        // Cleanup if needed
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
