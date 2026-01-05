/**
 * Activity Log Component
 */

import { getCurrentTime, formatAddress } from '../utils.js';
import { state } from '../state.js';

export class ActivityLog {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.maxEntries = 20;
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        // Show initial empty state
        this.addEntry('No activity yet', '', true);
    }
    
    addEntry(message, details = '', isPlaceholder = false) {
        if (!this.container) return;
        
        // Remove placeholder if exists
        if (isPlaceholder) {
            const placeholder = this.container.querySelector('.activity-placeholder');
            if (placeholder) {
                placeholder.remove();
            }
        } else {
            // Remove placeholder on first real entry
            const placeholder = this.container.querySelector('.activity-placeholder');
            if (placeholder) {
                placeholder.remove();
            }
        }
        
        const timeStr = getCurrentTime();
        
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        if (isPlaceholder) {
            activityItem.className += ' activity-placeholder';
        }
        
        activityItem.innerHTML = `
            <div class="activity-time">${timeStr}</div>
            <div class="activity-message">${message}${details ? ` - ${details}` : ''}</div>
        `;
        
        // Add to top of log
        this.container.insertBefore(activityItem, this.container.firstChild);
        
        // Keep only last N entries
        while (this.container.children.length > this.maxEntries) {
            this.container.removeChild(this.container.lastChild);
        }
    }
}

