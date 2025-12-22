/**
 * Router Component
 */

import { state } from './state.js';
import { HomePage } from './pages/HomePage.js';
import { UploadPage } from './pages/UploadPage.js';
import { FormPage } from './pages/FormPage.js';

export class Router {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentPage = null;
        this.pages = {
            home: HomePage,
            upload: UploadPage,
            form: FormPage
        };
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            const route = e.state?.route || 'home';
            state.set('currentRoute', route);
        });
        
        // Subscribe to route changes
        state.subscribe('currentRoute', (route) => {
            this.navigate(route);
        });
        
        // Initial route
        const initialRoute = window.location.hash.slice(1) || 'home';
        state.set('currentRoute', initialRoute);
    }
    
    navigate(route) {
        if (!this.container) return;
        
        // Update URL
        window.history.pushState({ route }, '', `#${route}`);
        
        // Clean up current page
        if (this.currentPage && typeof this.currentPage.destroy === 'function') {
            this.currentPage.destroy();
        }
        
        // Load new page
        const PageClass = this.pages[route];
        if (PageClass) {
            this.currentPage = new PageClass('main-content');
        } else {
            this.container.innerHTML = '<p>Page not found</p>';
        }
    }
}

