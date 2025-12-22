/**
 * Simple state management
 */

class State {
    constructor() {
        this.state = {
            currentAccount: 'buyer',
            currentRoute: 'home',
            deployments: null,
            wallets: null // Will be loaded from API
        };
        this.listeners = new Map();
    }
    
    get(key) {
        return this.state[key];
    }
    
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notify(key, value, oldValue);
    }
    
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }
    
    notify(key, newValue, oldValue) {
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => {
                callback(newValue, oldValue);
            });
        }
    }
}

export const state = new State();

