/**
 * Standardized Navigation Manager for Solar Calculator
 * Handles history tracking and smart "Back" behavior.
 */
const NavManager = {
    MAX_HISTORY: 10,
    STORAGE_KEY: 'atap_nav_history',

    /**
     * Initialize on page load: record current URL
     */
    init() {
        const currentUrl = window.location.href;
        let history = this.getHistory();

        // 1. Detect if we are just refreshing the current page
        if (history.length > 0 && history[history.length - 1] === currentUrl) {
            return;
        }

        // 2. Add current page to stack
        history.push(currentUrl);

        // 3. Keep only last N steps
        if (history.length > this.MAX_HISTORY) {
            history.shift();
        }

        this.saveHistory(history);
        console.log(`[NavManager] Tracked: ${currentUrl.split('/').pop() || 'index'}. History depth: ${history.length}`);
    },

    /**
     * Get history array from storage
     */
    getHistory() {
        try {
            const stored = sessionStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('[NavManager] Storage error:', e);
            return [];
        }
    },

    /**
     * Save history array to storage
     */
    saveHistory(history) {
        try {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('[NavManager] Save error:', e);
        }
    },

    /**
     * Standardized Go Back logic
     * @param {string} fallback - URL to use if history is empty
     */
    goBack(fallback = '/my-invoice') {
        let history = this.getHistory();
        
        // The current page is the last item in the stack
        // Remove it first
        history.pop();
        
        if (history.length > 0) {
            // Get the actual previous page
            const previousUrl = history.pop();
            
            // Save the state before navigating
            // (The page we navigate to will add itself back to history on load)
            this.saveHistory(history);
            
            console.log(`[NavManager] Navigating back to: ${previousUrl}`);
            window.location.href = previousUrl;
        } else {
            console.log(`[NavManager] History empty, using fallback: ${fallback}`);
            window.location.href = fallback;
        }
    },

    /**
     * Clear history (e.g. on logout)
     */
    clear() {
        sessionStorage.removeItem(this.STORAGE_KEY);
    }
};

// Auto-init on script load
if (typeof window !== 'undefined') {
    NavManager.init();
}
