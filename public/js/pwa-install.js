(() => {
    const APP_NAME = 'Eternalgy Agent OS';
    const MANIFEST_PATH = '/manifest.json';
    const APPLE_ICON_PATH = '/icons/eternalgy-agent-os-180.png';
    const DISMISS_KEY = 'eternalgy_agent_os_install_dismissed_until_v1';
    const DISMISS_MS = 24 * 60 * 60 * 1000;
    const SCRIPT_STATE = {
        initialized: false,
        deferredPrompt: null,
        scenario: 'unsupported'
    };

    function upsertMeta(selector, createTag, attributes = {}, property = 'content', value = '') {
        let node = document.head.querySelector(selector);
        if (!node) {
            node = document.createElement(createTag);
            Object.entries(attributes).forEach(([key, attrValue]) => node.setAttribute(key, attrValue));
            document.head.appendChild(node);
        }
        if (value !== undefined) {
            node.setAttribute(property, value);
        }
        return node;
    }

    function ensureHeadTags() {
        upsertMeta('link[rel="manifest"]', 'link', { rel: 'manifest' }, 'href', MANIFEST_PATH);
        upsertMeta('meta[name="theme-color"]', 'meta', { name: 'theme-color' }, 'content', '#0f172a');
        upsertMeta('meta[name="mobile-web-app-capable"]', 'meta', { name: 'mobile-web-app-capable' }, 'content', 'yes');
        upsertMeta('meta[name="apple-mobile-web-app-capable"]', 'meta', { name: 'apple-mobile-web-app-capable' }, 'content', 'yes');
        upsertMeta('meta[name="apple-mobile-web-app-status-bar-style"]', 'meta', { name: 'apple-mobile-web-app-status-bar-style' }, 'content', 'default');
        upsertMeta('meta[name="apple-mobile-web-app-title"]', 'meta', { name: 'apple-mobile-web-app-title' }, 'content', APP_NAME);
        upsertMeta('link[rel="apple-touch-icon"]', 'link', { rel: 'apple-touch-icon' }, 'href', APPLE_ICON_PATH);
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
            console.error('[PWA] Service worker registration failed:', error);
        });
    }

    function isStandaloneMode() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function isIos() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    function isSafari() {
        const ua = navigator.userAgent;
        return /Safari/i.test(ua) && !/CriOS|Chrome|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
    }

    function isInAppBrowser() {
        const ua = navigator.userAgent || '';
        return /FBAN|FBAV|Instagram|Line|MicroMessenger|WhatsApp|wv\)|; wv\)|TikTok/i.test(ua);
    }

    function getDismissedUntil() {
        try {
            return parseInt(localStorage.getItem(DISMISS_KEY), 10) || 0;
        } catch (error) {
            return 0;
        }
    }

    function dismissForToday() {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
        } catch (error) {
            // Ignore storage failures.
        }
        updateUi();
    }

    function clearDismissed() {
        try {
            localStorage.removeItem(DISMISS_KEY);
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function getScenario() {
        if (isStandaloneMode()) return 'installed';
        if (SCRIPT_STATE.deferredPrompt) return 'prompt';
        if (isIos() && isSafari()) return 'ios-safari';
        if (isIos()) return 'ios-open-safari';
        if (isAndroid() && isInAppBrowser()) return 'android-open-browser';
        if (isAndroid()) return 'android-manual';
        return 'unsupported';
    }

    function getScenarioCopy(scenario) {
        switch (scenario) {
            case 'prompt':
                return {
                    button: 'Install App',
                    title: `Install ${APP_NAME}`,
                    subtitle: 'Use the browser install prompt to add the app to your Home Screen.',
                    steps: [
                        'Tap the install button below.',
                        'Approve the browser install prompt.',
                        'Launch the app from your Home Screen.'
                    ],
                    note: 'Android browsers that support install will open the native prompt from this screen.',
                    primaryAction: 'Install now'
                };
            case 'ios-safari':
                return {
                    button: 'Add to Home Screen',
                    title: `Install ${APP_NAME} on iPhone`,
                    subtitle: 'Safari requires a manual Add to Home Screen flow.',
                    steps: [
                        'Tap the Share button in Safari.',
                        'Choose "Add to Home Screen".',
                        'Turn on "Open as Web App", then tap "Add".'
                    ],
                    note: 'Once added, the install button will disappear automatically when you open from the Home Screen.',
                    primaryAction: 'Got it'
                };
            case 'ios-open-safari':
                return {
                    button: 'Install Help',
                    title: `Open in Safari to install ${APP_NAME}`,
                    subtitle: 'This browser does not allow iPhone Home Screen installation directly.',
                    steps: [
                        'Open this page in Safari.',
                        'Tap the Share button.',
                        'Choose "Add to Home Screen".'
                    ],
                    note: 'If you are inside WhatsApp, Instagram, or Facebook, use the browser menu and choose "Open in Safari".',
                    primaryAction: 'Understood'
                };
            case 'android-open-browser':
                return {
                    button: 'Install Help',
                    title: `Open in Chrome to install ${APP_NAME}`,
                    subtitle: 'This in-app browser blocks the standard install flow.',
                    steps: [
                        'Open this page in Chrome or your main Android browser.',
                        'Return to this screen.',
                        'Use the install prompt or browser menu to install the app.'
                    ],
                    note: 'Browsers inside social or chat apps often do not expose the Android install prompt.',
                    primaryAction: 'Understood'
                };
            case 'android-manual':
                return {
                    button: 'Install Help',
                    title: `Install ${APP_NAME} on Android`,
                    subtitle: 'If the browser prompt is not available yet, the browser menu still works.',
                    steps: [
                        'Open the browser menu.',
                        'Choose "Install app" or "Add to Home screen".',
                        'Confirm the install.'
                    ],
                    note: 'The automatic prompt may appear later after more engagement with the app.',
                    primaryAction: 'Got it'
                };
            default:
                return null;
        }
    }

    function createUi() {
        if (document.getElementById('agentPwaInstallRoot')) return;

        const root = document.createElement('div');
        root.id = 'agentPwaInstallRoot';
        root.className = 'agent-pwa-install hidden';
        root.innerHTML = `
            <button type="button" class="agent-pwa-install__button" data-agent-pwa-open>
                <span class="agent-pwa-install__icon">
                    <img src="${APPLE_ICON_PATH}" alt="" class="agent-pwa-install__icon-image" />
                </span>
                <span class="agent-pwa-install__copy">
                    <span class="agent-pwa-install__eyebrow">Agent App</span>
                    <span class="agent-pwa-install__label">Install App</span>
                </span>
            </button>
            <button type="button" class="agent-pwa-install__close" data-agent-pwa-dismiss aria-label="Dismiss install prompt">×</button>
        `;

        const modal = document.createElement('div');
        modal.id = 'agentPwaInstallModal';
        modal.className = 'agent-pwa-modal';
        modal.innerHTML = `
            <div class="agent-pwa-modal__panel" role="dialog" aria-modal="true" aria-labelledby="agentPwaModalTitle">
                <div class="agent-pwa-modal__header">
                    <img src="${APPLE_ICON_PATH}" alt="${APP_NAME}" class="agent-pwa-modal__logo" />
                    <div>
                        <h2 id="agentPwaModalTitle" class="agent-pwa-modal__title"></h2>
                        <p class="agent-pwa-modal__subtitle" data-agent-pwa-subtitle></p>
                    </div>
                </div>
                <ol class="agent-pwa-modal__steps" data-agent-pwa-steps></ol>
                <p class="agent-pwa-modal__note" data-agent-pwa-note></p>
                <div class="agent-pwa-modal__actions">
                    <button type="button" class="agent-pwa-modal__button agent-pwa-modal__button--secondary" data-agent-pwa-later>Not now</button>
                    <button type="button" class="agent-pwa-modal__button agent-pwa-modal__button--primary" data-agent-pwa-primary>OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(root);
        document.body.appendChild(modal);

        root.querySelector('[data-agent-pwa-open]').addEventListener('click', handleInstallClick);
        root.querySelector('[data-agent-pwa-dismiss]').addEventListener('click', dismissForToday);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });
        modal.querySelector('[data-agent-pwa-later]').addEventListener('click', () => {
            closeModal();
            dismissForToday();
        });
        modal.querySelector('[data-agent-pwa-primary]').addEventListener('click', () => {
            closeModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        });
    }

    function openModal(copy) {
        const modal = document.getElementById('agentPwaInstallModal');
        if (!modal || !copy) return;

        modal.querySelector('#agentPwaModalTitle').textContent = copy.title;
        modal.querySelector('[data-agent-pwa-subtitle]').textContent = copy.subtitle;
        modal.querySelector('[data-agent-pwa-note]').textContent = copy.note;
        modal.querySelector('[data-agent-pwa-primary]').textContent = copy.primaryAction;
        modal.querySelector('[data-agent-pwa-steps]').innerHTML = copy.steps.map((step) => `<li>${step}</li>`).join('');
        modal.classList.add('is-open');
    }

    function closeModal() {
        document.getElementById('agentPwaInstallModal')?.classList.remove('is-open');
    }

    async function handleInstallClick() {
        const scenario = getScenario();
        if (scenario === 'prompt' && SCRIPT_STATE.deferredPrompt) {
            try {
                clearDismissed();
                SCRIPT_STATE.deferredPrompt.prompt();
                const choice = await SCRIPT_STATE.deferredPrompt.userChoice;
                if (choice?.outcome !== 'accepted') {
                    dismissForToday();
                }
            } catch (error) {
                console.error('[PWA] Install prompt failed:', error);
                openModal(getScenarioCopy('android-manual'));
            } finally {
                SCRIPT_STATE.deferredPrompt = null;
                window.deferredPrompt = null;
                window.deferredInstallPrompt = null;
                updateUi();
            }
            return;
        }

        openModal(getScenarioCopy(scenario));
    }

    function updateUi() {
        createUi();

        const root = document.getElementById('agentPwaInstallRoot');
        if (!root) return;

        SCRIPT_STATE.scenario = getScenario();
        const dismissedUntil = getDismissedUntil();
        const shouldHide = SCRIPT_STATE.scenario === 'installed'
            || SCRIPT_STATE.scenario === 'unsupported'
            || dismissedUntil > Date.now();

        if (shouldHide) {
            root.classList.add('hidden');
            closeModal();
            return;
        }

        const copy = getScenarioCopy(SCRIPT_STATE.scenario);
        if (!copy) {
            root.classList.add('hidden');
            closeModal();
            return;
        }

        root.querySelector('.agent-pwa-install__label').textContent = copy.button;
        root.classList.remove('hidden');
    }

    function bindInstallEvents() {
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            SCRIPT_STATE.deferredPrompt = event;
            window.deferredPrompt = event;
            window.deferredInstallPrompt = event;
            updateUi();
        });

        window.addEventListener('appinstalled', () => {
            SCRIPT_STATE.deferredPrompt = null;
            window.deferredPrompt = null;
            window.deferredInstallPrompt = null;
            clearDismissed();
            updateUi();
        });
    }

    function init() {
        if (SCRIPT_STATE.initialized) {
            updateUi();
            return;
        }

        SCRIPT_STATE.initialized = true;
        ensureHeadTags();
        registerServiceWorker();
        bindInstallEvents();
        updateUi();
    }

    window.AgentOsInstallManager = {
        init,
        updateUi,
        dismissForToday
    };
})();
