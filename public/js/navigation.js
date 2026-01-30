/**
 * Standardized Navigation Manager for Solar Calculator
 * Handles history tracking and smart "Back" behavior.
 */
const NavManager = {
    STORAGE_KEY: 'atap_nav_history',

    /**
     * Initialize on page load: record current URL
     */
    init() {
        const currentUrl = window.location.pathname + window.location.search;
        let history = this.getHistory();

        // If history is empty, initialize with home
        if (history.length === 0 && currentUrl !== '/agent/home') {
            history.push('/agent/home');
        }

        // Avoid adding same page multiple times in a row
        const lastPage = history[history.length - 1];
        if (lastPage !== currentUrl) {
            // If we are navigating to a page that is already in history (but not the last one)
            // we might want to trim history to that point to avoid loops
            const existingIndex = history.indexOf(currentUrl);
            if (existingIndex !== -1) {
                // Trim history to this point (we've returned to a previous state)
                history = history.slice(0, existingIndex + 1);
            } else {
                history.push(currentUrl);
            }
        }

        // Limit history size
        if (history.length > 15) {
            history.shift();
        }

        this.saveHistory(history);
        console.log(`[NavManager] Path: ${currentUrl}. Depth: ${history.length}`);
    },

    getHistory() {
        try {
            const stored = sessionStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    },

    saveHistory(history) {
        try {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
        } catch (e) {}
    },

    /**
     * Standardized Go Back logic
     */
    goBack(fallback = '/agent/home') {
        let history = this.getHistory();
        const currentUrl = window.location.pathname + window.location.search;

        // Remove current page
        if (history.length > 0 && history[history.length - 1] === currentUrl) {
            history.pop();
        }

        if (history.length > 0) {
            const previousUrl = history.pop();
            this.saveHistory(history);
            window.location.href = previousUrl;
        } else {
            window.location.href = fallback;
        }
    },

    clear() {
        sessionStorage.removeItem(this.STORAGE_KEY);
    }
};

// Auto-init on script load
if (typeof window !== 'undefined') {
    NavManager.init();
}
