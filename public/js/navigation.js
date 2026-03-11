(() => {
    const STORAGE_KEY = 'atap_nav_history_v2';
    const PROFILE_CACHE_KEY = 'atap_nav_profile_cache_v1';
    const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
    const STYLESHEET_HREF = '/css/navigation-shell.css';
    const MAX_HISTORY_ITEMS = 40;
    const DEFAULT_HOME = '/agent/home';
    const TOOLS_ROOT_KEY = 'tools';

    const ROUTES = [
        {
            pageKey: 'agent-home',
            path: '/agent/home',
            title: 'Dashboard',
            rootTab: 'home',
            routeType: 'root',
            stack: 'home',
            showBack: false,
            mobileHideSelectors: ['header.md\\:hidden', 'nav.mobile-bottom-nav']
        },
        {
            pageKey: 'my-customers',
            path: '/my-customers',
            title: 'Customers',
            rootTab: 'leads',
            routeType: 'root',
            stack: 'customers',
            showBack: false,
            primaryAction: { kind: 'handler', handlerName: 'openModal', label: 'Add Customer', icon: 'plus' },
            mobileHideSelectors: ['body > nav']
        },
        {
            pageKey: 'my-invoice',
            path: '/my-invoice',
            title: 'Quotations',
            rootTab: 'invoices',
            routeType: 'root',
            stack: 'invoice',
            showBack: false,
            primaryAction: { kind: 'href', href: '/select-package', label: 'New Quote', icon: 'plus' },
            mobileHideSelectors: ['body > nav'],
            stickyOffsetSelectors: ['body > div.bg-white.border-b.border-slate-200.w-full.sticky'],
            floatingOffsetSelectors: ['body > div.fixed.bottom-0.left-0.right-0.z-50']
        },
        {
            pageKey: 'activity-report',
            path: '/activity-report',
            title: 'Activity Report',
            rootTab: 'activity',
            routeType: 'root',
            stack: 'activity',
            showBack: false,
            primaryAction: { kind: 'handler', handlerName: 'openSubmitModal', label: 'Submit Activity', icon: 'plus' },
            mobileHideSelectors: ['header.md\\:hidden', 'nav.mobile-bottom-nav']
        },
        {
            pageKey: 'my-seda',
            path: '/my-seda',
            title: 'SEDA Management',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'seda',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Workspace',
            toolLabel: 'SEDA',
            toolDescription: 'Registrations and checks',
            icon: 'stamp',
            mobileHideSelectors: ['body > nav.top-nav']
        },
        {
            pageKey: 'check-seda',
            path: '/check-seda',
            title: 'Check SEDA',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'child',
            stack: 'seda',
            showBack: true,
            parentPage: 'my-seda',
            mobileHideSelectors: ['body > nav.top-nav']
        },
        {
            pageKey: 'seda-register',
            path: '/seda-register',
            title: 'SEDA Register',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'child',
            stack: 'seda',
            showBack: true,
            parentPage: 'my-seda',
            mobileHideSelectors: ['body > nav.top-nav']
        },
        {
            pageKey: 'my-emails',
            path: '/my-emails',
            title: 'Official Email',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'email',
            showBack: true,
            parentPage: 'agent-home',
            primaryAction: { kind: 'handler', handlerName: 'showComposeModal', label: 'Compose', icon: 'compose' },
            toolGroup: 'Workspace',
            toolLabel: 'Official Email',
            toolDescription: 'Assigned mailboxes',
            icon: 'mail',
            mobileHideSelectors: ['body > main > header']
        },
        {
            pageKey: 'chat-dashboard',
            path: '/chat-dashboard',
            title: 'Chat',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'chat',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Workspace',
            toolLabel: 'Chat',
            toolDescription: 'Ongoing conversations',
            icon: 'chat',
            mobileHideSelectors: ['body > header']
        },
        {
            pageKey: 'chat-settings',
            path: '/chat-settings',
            title: 'Chat Settings',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'child',
            stack: 'chat',
            showBack: true,
            parentPage: 'chat-dashboard',
            mobileHideSelectors: ['body > header']
        },
        {
            pageKey: 'my-referal',
            path: '/my-referal',
            title: 'My Referrals',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'referral',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Workspace',
            toolLabel: 'Referrals',
            toolDescription: 'Referral tracking',
            icon: 'referral',
            mobileHideSelectors: ['body > div.bg-slate-900']
        },
        {
            pageKey: 'agent-profile',
            path: '/agent/profile',
            title: 'Profile',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'profile',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Personal',
            toolLabel: 'Profile',
            toolDescription: 'Account settings',
            icon: 'profile',
            mobileHideSelectors: ['body > div.bg-white.border-b']
        },
        {
            pageKey: 'help-new-user',
            path: '/help/new-user',
            title: 'New User Guide',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'help',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Personal',
            toolLabel: 'New User Guide',
            toolDescription: 'Onboarding instructions',
            icon: 'help'
        },
        {
            pageKey: 'health-center',
            path: '/health-center',
            title: 'Health',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'health',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Workspace',
            toolLabel: 'Health',
            toolDescription: 'Calculator and database checks',
            icon: 'health'
        },
        {
            pageKey: 'voucher-management',
            path: '/voucher-management',
            title: 'Voucher Management',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'voucher',
            showBack: true,
            parentPage: 'agent-home',
            primaryAction: { kind: 'handler', handlerName: 'openModal', label: 'Create Voucher', icon: 'plus' },
            toolGroup: 'Management',
            toolLabel: 'Vouchers',
            toolDescription: 'Discount management',
            icon: 'ticket',
            visibleIf: ({ roles }) => roles.includes('kc')
        },
        {
            pageKey: 'sales-team-management',
            path: '/sales-team-management',
            title: 'Team Management',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'team',
            showBack: true,
            parentPage: 'agent-home',
            primaryAction: { kind: 'handler', handlerName: 'showCreateModal', label: 'Create Team', icon: 'plus' },
            toolGroup: 'Management',
            toolLabel: 'Team Management',
            toolDescription: 'HR team setup',
            icon: 'team',
            visibleIf: ({ roles }) => roles.includes('hr')
        },
        {
            pageKey: 'activity-review',
            path: '/activity-review',
            title: 'Activity Review',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'management',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Management',
            toolLabel: 'Activity Review',
            toolDescription: 'Manager review board',
            icon: 'review',
            visibleIf: ({ roles }) => roles.includes('kc')
        },
        {
            pageKey: 'sales-kpi',
            path: '/sales-kpi',
            title: 'Sales KPI',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'tool',
            stack: 'management',
            showBack: true,
            parentPage: 'agent-home',
            toolGroup: 'Management',
            toolLabel: 'Sales KPI',
            toolDescription: 'Manager KPI overview',
            icon: 'kpi',
            visibleIf: ({ roles }) => roles.includes('kc')
        },
        {
            pageKey: 'select-package',
            path: '/select-package',
            title: 'Select Package',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'my-invoice'
        },
        {
            pageKey: 'create-invoice',
            path: '/create-invoice',
            title: 'Create Quote',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'my-invoice'
        },
        {
            pageKey: 'edit-invoice',
            path: '/edit-invoice',
            title: 'Edit Quote',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'my-invoice'
        },
        {
            pageKey: 'invoice-office',
            path: '/invoice-office',
            title: 'Invoice Office',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'my-invoice',
            mobileHideSelectors: ['body > header']
        },
        {
            pageKey: 'invoice-chat',
            path: '/invoice-chat',
            title: 'Invoice Chat',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'invoice-office',
            mobileHideSelectors: ['body > header']
        },
        {
            pageKey: 'submit-payment',
            path: '/submit-payment',
            title: 'Submit Payment',
            rootTab: 'invoices',
            routeType: 'child',
            stack: 'invoice',
            showBack: true,
            parentPage: 'invoice-office',
            mobileHideSelectors: ['body > div.max-w-3xl > div.mb-8']
        },
        {
            pageKey: 'external-solar-analysis',
            path: 'https://solar-analysis-app-production.up.railway.app/',
            title: 'Google Solar API',
            routeType: 'external',
            rootTab: TOOLS_ROOT_KEY,
            toolGroup: 'External',
            toolLabel: 'Google Solar API',
            toolDescription: 'External analysis tool',
            icon: 'external'
        },
        {
            pageKey: 'external-public-awareness',
            path: 'https://simulator.atap.solar',
            title: 'ATAP Public Awareness',
            routeType: 'external',
            rootTab: TOOLS_ROOT_KEY,
            toolGroup: 'External',
            toolLabel: 'ATAP Public Awareness',
            toolDescription: 'External public awareness site',
            icon: 'external'
        },
        {
            pageKey: 'external-ai-progress',
            path: 'https://ai2026-production.up.railway.app/',
            title: 'AI Progress',
            routeType: 'external',
            rootTab: TOOLS_ROOT_KEY,
            toolGroup: 'External',
            toolLabel: 'AI Progress',
            toolDescription: 'External development tracker',
            icon: 'external'
        }
    ];

    const TAB_ITEMS = [
        { key: 'home', label: 'Home', href: '/agent/home', icon: 'home' },
        { key: 'leads', label: 'Leads', href: '/my-customers', icon: 'users' },
        { key: 'invoices', label: 'Invoices', href: '/my-invoice', icon: 'file' },
        { key: 'activity', label: 'Activity', href: '/activity-report', icon: 'chart' },
        { key: TOOLS_ROOT_KEY, label: 'Tools', href: '#tools', icon: 'grid' }
    ];

    const ROUTE_BY_PATH = new Map(
        ROUTES.filter((route) => route.routeType !== 'external').map((route) => [route.path, route])
    );

    const ROUTE_BY_KEY = new Map(ROUTES.map((route) => [route.pageKey, route]));

    const ICONS = {
        home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4.5V14h-6v7H4.5A1.5 1.5 0 0 1 3 19.5z"></path>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="3"></circle><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16.5 4.13a3 3 0 1 1 0 5.74"></path>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z"></path><path d="M14 2v6h6"></path>',
        chart: '<path d="M3 3v18h18"></path><path d="m7 13 3-3 3 2 5-6"></path>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect>',
        stamp: '<path d="M7 21h10"></path><path d="M8 17h8"></path><path d="M9 17v-1a3 3 0 0 1 3-3 3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v3a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1"></path>',
        mail: '<path d="M4 5h16v14H4z"></path><path d="m4 7 8 6 8-6"></path>',
        chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
        referral: '<path d="M16 6a3 3 0 1 0-3-3"></path><path d="M8 18a3 3 0 1 0 3 3"></path><path d="m13 5-6 14"></path>',
        profile: '<circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>',
        help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path>',
        health: '<path d="M12 21c4.8-2.2 8-6.3 8-11V5l-8-2-8 2v5c0 4.7 3.2 8.8 8 11Z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path>',
        ticket: '<path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 0 0 6v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-6z"></path><path d="M13 5v14"></path>',
        team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
        review: '<path d="m9 11 3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
        kpi: '<path d="M4 19h16"></path><path d="M6 15V9"></path><path d="M12 15V5"></path><path d="M18 15v-3"></path>',
        external: '<path d="M14 3h7v7"></path><path d="M10 14 21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>',
        plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
        compose: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
        back: '<path d="m15 18-6-6 6-6"></path>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path>'
    };

    function ensureStylesheet() {
        if (document.querySelector(`link[data-agent-shell="true"][href="${STYLESHEET_HREF}"]`)) {
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = STYLESHEET_HREF;
        link.dataset.agentShell = 'true';
        document.head.appendChild(link);
    }

    function iconMarkup(name, className = 'agent-shell-icon') {
        const body = ICONS[name] || ICONS.grid;
        return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    }

    function normalizeRoles(profile) {
        const accessLevels = Array.isArray(profile?.access_level) ? profile.access_level : [];
        return accessLevels.map((role) => String(role).trim().toLowerCase());
    }

    function normalizeProfile(profile = {}) {
        const roles = normalizeRoles(profile);
        return {
            ...profile,
            roles,
            name: profile.name || 'Agent',
            avatar: profile.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'Agent')}&background=0f172a&color=fff&bold=true`
        };
    }

    function loadCachedProfile() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null');
            if (!parsed || !parsed.profile) {
                return null;
            }
            const maxAge = 5 * 60 * 1000;
            if (Date.now() - parsed.cachedAt > maxAge) {
                return null;
            }
            return normalizeProfile(parsed.profile);
        } catch (error) {
            return null;
        }
    }

    function cacheProfile(profile) {
        try {
            sessionStorage.setItem(
                PROFILE_CACHE_KEY,
                JSON.stringify({ cachedAt: Date.now(), profile })
            );
        } catch (error) {
            // Ignore storage errors.
        }
    }

    async function fetchProfile() {
        const cached = loadCachedProfile();
        if (cached) {
            return cached;
        }

        try {
            const response = await fetch('/api/agent/me', { credentials: 'same-origin' });
            if (!response.ok) {
                return normalizeProfile();
            }
            const profile = normalizeProfile(await response.json());
            cacheProfile(profile);
            return profile;
        } catch (error) {
            return normalizeProfile();
        }
    }

    function loadHistory() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveHistory(entries) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_HISTORY_ITEMS)));
        } catch (error) {
            // Ignore storage errors.
        }
    }

    function isMobile() {
        return typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
    }

    function resolveRoute(pathname = window.location.pathname) {
        return ROUTE_BY_PATH.get(pathname) || null;
    }

    function resolveConfig() {
        const pathname = window.location.pathname;
        const route = resolveRoute(pathname);
        const override = window.AGENT_NAV_PAGE || {};
        const merged = {
            pageKey: pathname.replace(/[\/]/g, '-') || 'unknown',
            title: document.title || 'ETERNALGY OS',
            rootTab: TOOLS_ROOT_KEY,
            routeType: 'child',
            stack: 'misc',
            showBack: true,
            mobileHideSelectors: [],
            stickyOffsetSelectors: [],
            floatingOffsetSelectors: [],
            ...route,
            ...override
        };

        if (!merged.path) {
            merged.path = pathname;
        }

        if (merged.routeType === 'root') {
            merged.showBack = false;
        }

        if (!merged.parentPage && merged.routeType === 'tool') {
            merged.parentPage = 'agent-home';
        }

        return merged;
    }

    function toHistoryEntry(config) {
        return {
            pageKey: config.pageKey,
            url: window.location.pathname + window.location.search,
            pathname: window.location.pathname,
            rootTab: config.rootTab,
            stack: config.stack || null,
            routeType: config.routeType,
            parentPage: config.parentPage || null,
            timestamp: Date.now()
        };
    }

    function recordCurrentPage(config) {
        const currentEntry = toHistoryEntry(config);
        const history = loadHistory();
        const lastEntry = history[history.length - 1];

        if (!lastEntry || lastEntry.url !== currentEntry.url) {
            history.push(currentEntry);
        } else {
            history[history.length - 1] = currentEntry;
        }

        saveHistory(history);
    }

    function pageKeyToPath(pageKey) {
        const route = ROUTE_BY_KEY.get(pageKey);
        return route?.path || DEFAULT_HOME;
    }

    function navigate(url, options = {}) {
        if (!url) {
            return;
        }
        if (options.external) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (options.replace) {
            window.location.replace(url);
            return;
        }
        window.location.href = url;
    }

    function findPreviousStackEntry(config, history) {
        if (!config.stack) {
            return null;
        }

        const currentUrl = window.location.pathname + window.location.search;
        for (let index = history.length - 1; index >= 0; index -= 1) {
            const entry = history[index];
            if (entry.url === currentUrl) {
                continue;
            }
            if (entry.stack === config.stack) {
                return { entry, index };
            }
        }
        return null;
    }

    function setDesktopActiveState(config) {
        document.querySelectorAll('a[href]').forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('/')) {
                return;
            }

            const isExactMatch = href === window.location.pathname;
            const route = resolveRoute(href);
            const isTabMatch = route && route.rootTab === config.rootTab && link.classList.contains('nav-link');

            link.classList.toggle('active', Boolean(isExactMatch || isTabMatch));
            if (isExactMatch) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function hideLegacyMobileChrome(config) {
        if (!isMobile()) {
            return;
        }

        const selectors = config.mobileHideSelectors || [];
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
                element.classList.add('agent-shell-mobile-hidden');
            });
        });

        (config.stickyOffsetSelectors || []).forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
                element.style.top = 'var(--agent-shell-top-space)';
            });
        });

        (config.floatingOffsetSelectors || []).forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
                element.classList.add('agent-shell-floating-offset');
            });
        });
    }

    function filterVisibleTools(profile) {
        return ROUTES.filter((route) => route.toolLabel).filter((route) => {
            if (typeof route.visibleIf === 'function') {
                return route.visibleIf(profile);
            }
            return true;
        });
    }

    function groupTools(routes) {
        return routes.reduce((groups, route) => {
            const group = route.toolGroup || 'Workspace';
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(route);
            return groups;
        }, {});
    }

    function createTopShell(config, profile) {
        const header = document.createElement('header');
        header.id = 'agent-mobile-shell-top';
        header.innerHTML = `
            <div class="agent-shell-topbar">
                <div class="agent-shell-topbar__left">
                    ${config.showBack ? `<button class="agent-shell-icon-button" type="button" data-agent-nav-back aria-label="Go back">${iconMarkup('back')}</button>` : '<div class="agent-shell-brandmark">AT</div>'}
                    <div class="agent-shell-title-wrap">
                        <p class="agent-shell-eyebrow">${config.rootTab === TOOLS_ROOT_KEY ? 'Tools' : 'Agent Workspace'}</p>
                        <h1 class="agent-shell-title">${config.title}</h1>
                    </div>
                </div>
                <button class="agent-shell-avatar-button" type="button" data-agent-nav-tools aria-label="Open tools">
                    <img src="${profile.avatar}" alt="${profile.name}" class="agent-shell-avatar-image" />
                </button>
            </div>
        `;
        return header;
    }

    function createBottomTabs(config) {
        const nav = document.createElement('nav');
        nav.id = 'agent-mobile-shell-bottom';
        nav.setAttribute('aria-label', 'Primary navigation');
        nav.innerHTML = TAB_ITEMS.map((item) => {
            const isActive = config.rootTab === item.key;
            const attrs = item.key === TOOLS_ROOT_KEY
                ? 'data-agent-nav-tools'
                : `data-agent-nav-target="${item.href}"`;
            return `
                <button class="agent-shell-tab ${isActive ? 'is-active' : ''}" type="button" ${attrs}>
                    ${iconMarkup(item.icon)}
                    <span>${item.label}</span>
                </button>
            `;
        }).join('');
        return nav;
    }

    function createPrimaryAction(config) {
        const action = config.primaryAction;
        if (!action) {
            return null;
        }

        if (action.kind === 'handler' && typeof window[action.handlerName] !== 'function') {
            return null;
        }

        const button = document.createElement('button');
        button.id = 'agent-mobile-shell-action';
        button.type = 'button';
        button.className = 'agent-shell-fab';
        button.innerHTML = `${iconMarkup(action.icon || 'plus', 'agent-shell-fab__icon')}<span>${action.label}</span>`;
        button.addEventListener('click', () => {
            if (action.kind === 'href') {
                navigate(action.href);
                return;
            }
            if (action.kind === 'handler' && typeof window[action.handlerName] === 'function') {
                window[action.handlerName]();
            }
        });
        return button;
    }

    function createToolsSheet(config, profile) {
        const overlay = document.createElement('div');
        overlay.id = 'agent-mobile-tools-sheet';
        overlay.innerHTML = `
            <div class="agent-shell-sheet-backdrop" data-agent-nav-close></div>
            <section class="agent-shell-sheet" aria-label="Tools">
                <div class="agent-shell-sheet__handle"></div>
                <div class="agent-shell-sheet__header">
                    <div class="agent-shell-sheet__profile">
                        <div class="agent-shell-sheet__avatar">
                            <img src="${profile.avatar}" alt="${profile.name}" class="agent-shell-sheet__avatar-image" />
                        </div>
                        <div>
                            <p class="agent-shell-sheet__name">${profile.name}</p>
                            <p class="agent-shell-sheet__roles">${profile.roles.length ? profile.roles.join(' • ').toUpperCase() : 'AGENT'}</p>
                        </div>
                    </div>
                    <button type="button" class="agent-shell-icon-button" data-agent-nav-close aria-label="Close tools">✕</button>
                </div>
                <div class="agent-shell-sheet__content"></div>
                <div class="agent-shell-sheet__footer">
                    <button class="agent-shell-logout" type="button" data-agent-nav-logout>
                        ${iconMarkup('logout')}
                        <span>Logout</span>
                    </button>
                </div>
            </section>
        `;

        const content = overlay.querySelector('.agent-shell-sheet__content');
        const groups = groupTools(filterVisibleTools(profile));
        const groupOrder = ['Workspace', 'Management', 'Personal', 'External'];

        groupOrder.filter((groupName) => groups[groupName]?.length).forEach((groupName) => {
            const section = document.createElement('section');
            section.className = 'agent-shell-tool-group';
            section.innerHTML = `<h2>${groupName}</h2>`;

            const list = document.createElement('div');
            list.className = 'agent-shell-tool-list';
            groups[groupName].forEach((route) => {
                const item = document.createElement(route.routeType === 'external' ? 'a' : 'button');
                item.className = `agent-shell-tool-item ${config.pageKey === route.pageKey ? 'is-active' : ''}`;
                item.innerHTML = `
                    <div class="agent-shell-tool-item__icon">${iconMarkup(route.icon || 'grid')}</div>
                    <div class="agent-shell-tool-item__copy">
                        <strong>${route.toolLabel}</strong>
                        <span>${route.toolDescription || route.title}</span>
                    </div>
                    <span class="agent-shell-tool-item__chevron">›</span>
                `;

                if (route.routeType === 'external') {
                    item.href = route.path;
                    item.target = '_blank';
                    item.rel = 'noopener noreferrer';
                } else {
                    item.type = 'button';
                    item.addEventListener('click', () => navigate(route.path));
                }
                list.appendChild(item);
            });

            section.appendChild(list);
            content.appendChild(section);
        });

        return overlay;
    }

    function wireShellEvents(shell) {
        shell.querySelectorAll('[data-agent-nav-target]').forEach((element) => {
            element.addEventListener('click', () => {
                const target = element.getAttribute('data-agent-nav-target');
                navigate(target);
            });
        });

        shell.querySelectorAll('[data-agent-nav-tools]').forEach((element) => {
            element.addEventListener('click', () => {
                document.body.classList.add('agent-shell-tools-open');
            });
        });

        shell.querySelectorAll('[data-agent-nav-close]').forEach((element) => {
            element.addEventListener('click', () => {
                document.body.classList.remove('agent-shell-tools-open');
            });
        });

        shell.querySelectorAll('[data-agent-nav-logout]').forEach((element) => {
            element.addEventListener('click', () => {
                NavManager.logout();
            });
        });

        shell.querySelectorAll('[data-agent-nav-back]').forEach((element) => {
            element.addEventListener('click', () => {
                NavManager.goBack();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                document.body.classList.remove('agent-shell-tools-open');
            }
        });
    }

    function renderMobileShell(config, profile) {
        if (!isMobile()) {
            return;
        }

        if (document.getElementById('agent-mobile-shell-top')) {
            return;
        }

        document.body.classList.add('nav-shell-mobile-active');
        document.body.dataset.agentPageKey = config.pageKey;

        const fragment = document.createDocumentFragment();
        const topShell = createTopShell(config, profile);
        const bottomTabs = createBottomTabs(config);
        const toolsSheet = createToolsSheet(config, profile);
        const primaryAction = createPrimaryAction(config);

        fragment.appendChild(topShell);
        if (primaryAction) {
            fragment.appendChild(primaryAction);
        }
        fragment.appendChild(bottomTabs);
        fragment.appendChild(toolsSheet);
        document.body.appendChild(fragment);

        wireShellEvents(document.body);
    }

    const NavManager = {
        async init() {
            ensureStylesheet();
            this.currentConfig = resolveConfig();
            recordCurrentPage(this.currentConfig);
            setDesktopActiveState(this.currentConfig);
            hideLegacyMobileChrome(this.currentConfig);
            this.profile = await fetchProfile();
            renderMobileShell(this.currentConfig, this.profile);
            window.logout = this.logout.bind(this);
        },

        getHistory() {
            return loadHistory();
        },

        saveHistory(entries) {
            saveHistory(entries);
        },

        getCurrentConfig() {
            return this.currentConfig || resolveConfig();
        },

        goTo(url, options = {}) {
            navigate(url, options);
        },

        goHome() {
            navigate(DEFAULT_HOME);
        },

        goBack(fallbackUrl) {
            const config = this.getCurrentConfig();
            const history = loadHistory();
            const currentUrl = window.location.pathname + window.location.search;

            while (history.length && history[history.length - 1].url === currentUrl) {
                history.pop();
            }

            const previousStackEntry = findPreviousStackEntry(config, history);
            if (previousStackEntry) {
                saveHistory(history.slice(0, previousStackEntry.index + 1));
                navigate(previousStackEntry.entry.url);
                return;
            }

            const fallback = fallbackUrl || (config.parentPage ? pageKeyToPath(config.parentPage) : DEFAULT_HOME);
            saveHistory(history);
            navigate(fallback);
        },

        async logout() {
            if (!window.confirm('This will end your session. Proceed?')) {
                return;
            }

            try {
                await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (error) {
                // Ignore network errors and continue with client cleanup.
            } finally {
                this.clear();
                document.cookie = 'auth_token=; Max-Age=0; path=/;';
                window.location.href = '/domestic';
            }
        },

        clear() {
            try {
                sessionStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem(PROFILE_CACHE_KEY);
            } catch (error) {
                // Ignore storage errors.
            }
        }
    };

    window.NavManager = NavManager;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            NavManager.init();
        });
    } else {
        NavManager.init();
    }
})();
