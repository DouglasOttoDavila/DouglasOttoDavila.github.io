class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        // Static header links only (content pages may add route links dynamically).
        this.navLinks = Array.from(document.querySelectorAll('header [data-route]'));
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            'prompt-explained': 'content/prompt-explained.html',
            'user-story-analyzer': 'content/user-story-analyzer.html',
            'login': 'content/login.html',
            'privacy': 'content/privacy.html'
        };
        this.currentPage = '';
        this.navContainer = document.getElementById('primaryNav');
        this.promptEscapeHandler = null;

        this.protectedPagesConfigUrl = 'content/protected-pages.json';
        this.authConfigUrl = 'content/auth.config.json';
        this.authRuntimeUrl = 'content/auth.runtime.json';

        this.protectedPagesConfig = {
            version: 1,
            defaults: { redirectRoute: 'login' },
            pages: []
        };
        this.protectedPagesIndex = new Map();

        this.authConfig = null;
        this.supabase = null;
        this.authState = {
            initialized: false,
            isAuthenticated: false,
            isAllowed: false,
            email: null,
            avatarUrl: null
        };

        this.authControls = {
            loginLink: document.getElementById('nav-login'),
            userMenu: document.getElementById('nav-user-menu'),
            userMenuBtn: document.getElementById('nav-user-menu-btn'),
            userEmail: document.getElementById('nav-user-email'),
            logoutBtn: document.getElementById('nav-logout'),
            loginAvatar: document.getElementById('nav-login-avatar'),
            userAvatar: document.getElementById('nav-user-avatar')
        };
    }

    normalizeRouteId(value) {
        // Support both "#route" and "#/route" style hashes, plus accidental trailing slashes/query strings.
        return String(value || '')
            .replace(/^#/, '')
            .replace(/^\/+/, '')
            .replace(/\/+$/, '')
            .split('?')[0]
            .trim();
    }

    async start() {
        // Global route handling via event delegation so dynamic content links work.
        document.addEventListener('click', (event) => {
            const target = event.target?.closest?.('[data-route]');
            if (!target) return;
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            event.preventDefault();
            const targetPage = target.dataset.route || 'home';
            this.navigate(targetPage, 'push');
        });

        window.addEventListener('popstate', (event) => {
            const page = event.state?.page || (this.normalizeRouteId(window.location.hash) || 'home');
            this.navigate(page, 'none');
        });

        // Hash-only navigation (e.g. user types a URL with #prompt-explained).
        // Without this, the SPA won't react until a full refresh because `hashchange` does not fire `popstate`.
        window.addEventListener('hashchange', () => {
            const page = this.normalizeRouteId(window.location.hash) || 'home';
            // Ensure back/forward has consistent state even for hash-only navigation.
            history.replaceState({ page }, '', `#${page}`);
            this.navigate(page, 'none');
        });

        this.bindAuthControls();

        await this.loadProtectedPagesConfig();
        await this.loadAuthConfig();
        await this.loadAuthRuntimeConfig();
        await this.initSupabaseAuth();

        this.updateAuthUI();
        this.applyNavVisibilityRules();

        const initialPage = this.normalizeRouteId(window.location.hash) || 'home';
        this.navigate(initialPage, 'none');
    }

    async navigate(page, historyMode = 'push') {
        const normalized = this.normalizeRouteId(page);
        const requestedPage = normalized;

        page = normalized;
        if (!this.routes[page]) {
            page = 'home';
            if (historyMode === 'none') {
                historyMode = 'replace';
            }
        }

        if (this.currentPage === page) {
            this.closeMobileNav();
            return;
        }

        try {
            const guard = this.guardRoute(page);
            if (guard?.redirectTo && guard.redirectTo !== page) {
                if (guard.storeRedirectFrom) {
                    sessionStorage.setItem('post_login_redirect', requestedPage);
                }
                if (guard.reason) {
                    sessionStorage.setItem('auth_denied_reason', guard.reason);
                } else {
                    sessionStorage.removeItem('auth_denied_reason');
                }
                await this.navigate(guard.redirectTo, 'replace');
                return;
            }

            if (historyMode === 'push') {
                history.pushState({ page }, '', `#${page}`);
            } else if (historyMode === 'replace') {
                history.replaceState({ page }, '', `#${page}`);
            }

            this.setPageChrome(page);
            this.setActiveLink(page);
            await this.loadContent(page);
            this.currentPage = page;
            this.updatePageTitle(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.closeMobileNav();
        } catch (error) {
            console.error('Navigation error:', error);
            this.showError('Sorry, something went wrong while loading this section.');
        }
    }

    setPageChrome(page) {
        document.body.classList.toggle('page-login', page === 'login');
        document.body.classList.toggle('page-home', page === 'home');
    }

    async loadContent(page) {
        this.resetPromptEscapeHandler();

        const route = this.routes[page];
        const response = await fetch(route, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${route}: ${response.status}`);
        }

        const markup = await response.text();
        this.contentArea.innerHTML = markup;
        this.initializePageScripts(page);
    }

    async loadProtectedPagesConfig() {
        const fallback = {
            version: 1,
            defaults: { redirectRoute: 'login' },
            pages: []
        };

        try {
            const response = await fetch(this.protectedPagesConfigUrl, { cache: 'no-store' });
            if (!response.ok) {
                console.warn(`[auth] Unable to load ${this.protectedPagesConfigUrl} (${response.status}). Falling back to no protected pages.`);
                this.setProtectedPagesConfig(fallback);
                return;
            }

            const parsed = await response.json();
            if (!parsed || !Array.isArray(parsed.pages)) {
                console.warn(`[auth] Invalid protected pages config. Falling back to no protected pages.`);
                this.setProtectedPagesConfig(fallback);
                return;
            }

            this.setProtectedPagesConfig(parsed);
        } catch (error) {
            console.warn(`[auth] Error loading protected pages config. Falling back to no protected pages.`, error);
            this.setProtectedPagesConfig(fallback);
        }
    }

    setProtectedPagesConfig(config) {
        this.protectedPagesConfig = {
            version: config.version || 1,
            defaults: {
                redirectRoute: config.defaults?.redirectRoute || 'login'
            },
            pages: Array.isArray(config.pages) ? config.pages : []
        };

        this.protectedPagesIndex = new Map();
        this.protectedPagesConfig.pages.forEach(entry => {
            if (!entry || typeof entry.routeId !== 'string') return;
            this.protectedPagesIndex.set(entry.routeId, entry);
        });
    }

    async loadAuthConfig() {
        try {
            const response = await fetch(this.authConfigUrl, { cache: 'no-store' });
            if (!response.ok) {
                console.warn(`[auth] Unable to load ${this.authConfigUrl} (${response.status}). Auth disabled.`);
                this.authConfig = null;
                return;
            }

            const parsed = await response.json();
            if (!parsed || parsed.provider !== 'supabase') {
                console.warn(`[auth] Unsupported or missing auth provider in ${this.authConfigUrl}. Auth disabled.`);
                this.authConfig = null;
                return;
            }

            this.authConfig = parsed;
        } catch (error) {
            console.warn(`[auth] Error loading auth config. Auth disabled.`, error);
            this.authConfig = null;
        }
    }

    async loadAuthRuntimeConfig() {
        // Optional (and gitignored) runtime config generated from local .env.
        try {
            const response = await fetch(this.authRuntimeUrl, { cache: 'no-store' });
            if (!response.ok) {
                return;
            }

            const parsed = await response.json();
            if (!parsed) {
                return;
            }

            if (!this.authConfig) {
                // Don't enable auth via runtime file alone; the base config defines provider and UX settings.
                return;
            }

            const runtimeUrl = parsed.supabase?.url;
            const runtimeAnonKey = parsed.supabase?.anonKey;
            const runtimeAllowedEmails = parsed.accessControl?.allowedEmails;

            if (runtimeUrl && !this.authConfig.supabase.url) {
                this.authConfig.supabase.url = runtimeUrl;
            }

            if (runtimeAnonKey && !this.authConfig.supabase.anonKey) {
                this.authConfig.supabase.anonKey = runtimeAnonKey;
            }

            if (runtimeAllowedEmails) {
                let allowlist = [];
                if (Array.isArray(runtimeAllowedEmails)) {
                    allowlist = runtimeAllowedEmails;
                } else if (typeof runtimeAllowedEmails === 'string') {
                    allowlist = runtimeAllowedEmails.split(',').map(v => v.trim()).filter(Boolean);
                }

                if (allowlist.length > 0) {
                    this.authConfig.accessControl = this.authConfig.accessControl || {};
                    this.authConfig.accessControl.allowedEmails = allowlist;
                }
            }
        } catch {
            // Treat parse/network failures as "no runtime config".
        }
    }

    isAuthConfigured() {
        const url = this.authConfig?.supabase?.url || '';
        const anonKey = this.authConfig?.supabase?.anonKey || '';
        if (!url || !anonKey) return false;
        if (url.includes('YOUR_PROJECT_REF') || anonKey.includes('YOUR_SUPABASE_ANON_KEY')) return false;
        return true;
    }

    getAllowedEmails() {
        const list = this.authConfig?.accessControl?.allowedEmails;
        if (!Array.isArray(list)) return [];
        return list
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean);
    }

    isEmailAllowed(email) {
        const allowed = this.getAllowedEmails();
        if (allowed.length === 0) return true;
        if (!email) return false;
        return allowed.includes(String(email).trim().toLowerCase());
    }

    async initSupabaseAuth() {
        this.authState.initialized = true;

        if (!this.authConfig) {
            this.setAuthSession(null);
            return;
        }

        if (!this.isAuthConfigured()) {
            console.warn('[auth] Supabase config placeholders detected. Auth UI will show a configuration warning.');
            this.setAuthSession(null);
            return;
        }

        const createClient = window.supabase?.createClient;
        if (typeof createClient !== 'function') {
            console.warn('[auth] Supabase library not available on window.supabase. Auth disabled.');
            this.setAuthSession(null);
            return;
        }

        try {
            this.supabase = createClient(this.authConfig.supabase.url, this.authConfig.supabase.anonKey, {
                auth: {
                    flowType: 'pkce',
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });

            const { data, error } = await this.supabase.auth.getSession();
            if (error) {
                console.warn('[auth] getSession() failed.', error);
                this.setAuthSession(null);
            } else {
                this.setAuthSession(data?.session || null);
            }

            this.supabase.auth.onAuthStateChange((event, session) => {
                this.setAuthSession(session || null);
                this.updateAuthUI();
                this.applyNavVisibilityRules();

                // If the user is currently on the login page, refresh its UI (hide SSO, update dot, etc.).
                if (this.currentPage === 'login') {
                    this.setupLoginPage();
                }

                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                    this.maybeRedirectAfterLogin();
                }

                if (event === 'SIGNED_OUT') {
                    sessionStorage.removeItem('post_login_redirect');
                    sessionStorage.removeItem('auth_denied_reason');

                    // On sign out, always return to the login route (and avoid leaving the UI on a protected screen).
                    if ((this.currentPage || '') !== 'login') {
                        this.navigate('login', 'replace');
                    }
                }
            });
        } catch (error) {
            console.warn('[auth] Supabase initialization failed. Auth disabled.', error);
            this.setAuthSession(null);
        }
    }

    setAuthSession(session) {
        const email = session?.user?.email || null;
        const meta = session?.user?.user_metadata || {};
        const avatarUrl = meta.avatar_url || meta.picture || meta.avatarUrl || null;
        const isAuthenticated = Boolean(session?.user);
        const isAllowed = isAuthenticated && this.isEmailAllowed(email);

        this.authState.isAuthenticated = isAuthenticated;
        this.authState.isAllowed = isAllowed;
        this.authState.email = email;
        this.authState.avatarUrl = avatarUrl;

        if (isAuthenticated && !isAllowed) {
            sessionStorage.setItem('auth_denied_reason', 'Your account is signed in, but not authorized to access protected pages.');
        }
    }

    isAuthedForProtectedPages() {
        return this.authState.isAuthenticated && this.authState.isAllowed;
    }

    guardRoute(page) {
        const entry = this.protectedPagesIndex.get(page);
        if (!entry || !entry.requireAuth) return null;

        if (page === (this.protectedPagesConfig.defaults?.redirectRoute || 'login')) return null;

        if (!this.isAuthedForProtectedPages()) {
            return {
                redirectTo: this.protectedPagesConfig.defaults?.redirectRoute || 'login',
                storeRedirectFrom: true,
                reason: sessionStorage.getItem('auth_denied_reason') || null
            };
        }

        return null;
    }

    maybeRedirectAfterLogin() {
        if (!this.isAuthedForProtectedPages()) return;

        const requested = sessionStorage.getItem('post_login_redirect');
        if (!requested) return;
        sessionStorage.removeItem('post_login_redirect');
        sessionStorage.removeItem('auth_denied_reason');

        const target = this.routes[requested] ? requested : 'home';
        if (this.currentPage === target) return;
        this.navigate(target, 'replace');
    }

    bindAuthControls() {
        const logoutBtn = this.authControls.logoutBtn;
        if (logoutBtn && !logoutBtn.dataset.bound) {
            logoutBtn.addEventListener('click', async () => {
                if (!this.supabase) {
                    this.navigate('login', 'push');
                    return;
                }
                try {
                    await this.supabase.auth.signOut();
                } catch (error) {
                    console.error('[auth] signOut failed', error);
                }
            });
            logoutBtn.dataset.bound = 'true';
        }

        // Focus management for the dropdown (Bootstrap emits events on the `.dropdown` container).
        const userMenu = this.authControls.userMenu;
        const userMenuBtn = this.authControls.userMenuBtn;
        if (userMenu && !userMenu.dataset.boundFocus) {
            userMenu.addEventListener('shown.bs.dropdown', () => {
                const first = userMenu.querySelector('[role="menuitem"]');
                if (first && typeof first.focus === 'function') {
                    first.focus({ preventScroll: true });
                }
            });
            userMenu.addEventListener('hidden.bs.dropdown', () => {
                if (userMenuBtn && typeof userMenuBtn.focus === 'function') {
                    userMenuBtn.focus({ preventScroll: true });
                }
            });
            userMenu.dataset.boundFocus = 'true';
        }
    }

    updateAuthUI() {
        const loginLink = this.authControls.loginLink;
        const userMenu = this.authControls.userMenu;
        const userEmail = this.authControls.userEmail;
        const loginAvatar = this.authControls.loginAvatar;
        const userAvatar = this.authControls.userAvatar;

        const showLoggedIn = this.authState.isAuthenticated;
        const fallbackAvatar = 'assets/user-default.svg';

        if (loginLink) {
            loginLink.classList.toggle('d-none', showLoggedIn);
            // Also set the `hidden` attribute to avoid any utility class ordering issues.
            loginLink.hidden = showLoggedIn;
            loginLink.setAttribute('aria-hidden', String(showLoggedIn));
            if (showLoggedIn) {
                loginLink.setAttribute('tabindex', '-1');
            } else {
                loginLink.removeAttribute('tabindex');
            }
            loginLink.removeAttribute('aria-disabled');
            loginLink.classList.remove('disabled');
        }

        if (userMenu) {
            userMenu.classList.toggle('d-none', !showLoggedIn);
            userMenu.hidden = !showLoggedIn;
        }

        if (userEmail) {
            userEmail.textContent = this.authState.email ? this.authState.email : '';
        }

        if (loginAvatar) {
            loginAvatar.src = fallbackAvatar;
        }

        if (userAvatar) {
            userAvatar.src = this.authState.avatarUrl ? this.authState.avatarUrl : fallbackAvatar;
        }
    }

    applyNavVisibilityRules() {
        const canAccessProtected = this.isAuthedForProtectedPages();

        const routeLinks = Array.from(document.querySelectorAll('a[data-route]'));
        routeLinks.forEach(link => {
            const routeId = link.dataset.route;
            if (!routeId) return;

            const entry = this.protectedPagesIndex.get(routeId);
            const shouldHide = Boolean(entry?.hideWhenLoggedOut) && Boolean(entry?.requireAuth) && !canAccessProtected;

            const container = link.closest('li') || link;
            container.classList.toggle('d-none', shouldHide);
            link.setAttribute('aria-hidden', String(shouldHide));
            if (shouldHide) {
                link.setAttribute('tabindex', '-1');
            } else {
                link.removeAttribute('tabindex');
            }
        });

        // Hide empty submenus / dropdowns to avoid dead panels.
        const submenus = Array.from(document.querySelectorAll('.dropdown-submenu'));
        submenus.forEach(submenu => {
            const links = Array.from(submenu.querySelectorAll('a[data-route]'));
            const hasVisible = links.some(a => {
                const li = a.closest('li') || a;
                return !li.classList.contains('d-none') && !a.classList.contains('d-none');
            });
            submenu.classList.toggle('d-none', !hasVisible);
        });

        const dropdownNavItems = Array.from(document.querySelectorAll('.navbar .nav-item.dropdown'));
        dropdownNavItems.forEach(item => {
            const links = Array.from(item.querySelectorAll('a[data-route]'));
            const hasVisible = links.some(a => {
                const li = a.closest('li') || a;
                return !li.classList.contains('d-none') && !a.classList.contains('d-none');
            });
            item.classList.toggle('d-none', !hasVisible);
        });
    }

    setActiveLink(page) {
        this.navLinks.forEach(link => {
            const linkPage = link.dataset.route || 'home';
            const isBrandLink = link.classList.contains('navbar-brand');
            link.classList.toggle('active', !isBrandLink && linkPage === page);
        });

        const dropdownToggles = document.querySelectorAll('.navbar .dropdown-toggle');
        dropdownToggles.forEach(toggle => toggle.classList.remove('active', 'is-open'));

        const activeLink = this.navLinks.find(link => (link.dataset.route || 'home') === page);
        if (!activeLink) {
            return;
        }

        const rootToggle = activeLink.closest('.dropdown-menu')?.previousElementSibling;
        if (rootToggle && rootToggle.matches('.dropdown-toggle')) {
            rootToggle.classList.add('active');
        }

        this.expandParentSubmenus(activeLink);
    }

    expandParentSubmenus(activeLink) {
        if (!activeLink) {
            return;
        }

        const Collapse = window.bootstrap?.Collapse;
        let currentSubmenu = activeLink.closest('.dropdown-submenu');

        while (currentSubmenu) {
            const children = Array.from(currentSubmenu.children);
            const toggle = children.find(child => child.matches('[data-submenu-toggle]')) || null;
            const submenu = children.find(child => child.matches('.submenu.collapse')) || null;

            if (toggle) {
                toggle.classList.add('active', 'is-open');
            }

            if (submenu) {
                if (Collapse) {
                    const instance = Collapse.getOrCreateInstance(submenu, { toggle: false });
                    if (!submenu.classList.contains('show')) {
                        instance.show();
                    }
                } else {
                    submenu.classList.add('show');
                }
            }

            currentSubmenu = currentSubmenu.parentElement?.closest('.dropdown-submenu');
        }
    }

    updatePageTitle(page) {
        const titles = {
            'home': "Douglas D'Avila | QA Automation Engineer & SDET",
            'about': "About Douglas D'Avila | QA Automation Engineer & SDET",
            'prompt-explained': 'Automation Prompt Analysis | Douglas D\'Avila',
            'user-story-analyzer': 'User Story Quality Analyzer | Douglas D\'Avila',
            'login': 'Sign in | Douglas D\'Avila',
            'privacy': 'Privacy | Douglas D\'Avila'
        };
        document.title = titles[page] || titles.home;
    }

    initializePageScripts(page) {
        if (page === 'prompt-explained') {
            setTimeout(() => {
                if (window.hljs?.highlightAll) {
                    window.hljs.highlightAll();
                }
            }, 10);
            this.setupPromptInteractions();
        }

        if (page === 'home') {
            this.setupHomeCarousel();
        }

        if (page === 'user-story-analyzer') {
            this.setupUserStoryAnalyzer();
        }

        if (page === 'login') {
            this.setupLoginPage();
        }
    }

    setupLoginPage() {
        const configWarning = document.getElementById('login-config-warning');
        const errorBox = document.getElementById('login-error');
        const statusBox = document.getElementById('login-status');
        const emailEl = document.getElementById('login-email');
        const statusDot = document.getElementById('login-status-dot');
        const ssoContainer = document.getElementById('login-sso');
        const logoutBtn = document.getElementById('login-logout');
        const githubBtn = document.getElementById('login-github');
        const googleBtn = document.getElementById('login-google');

        const configured = Boolean(this.authConfig) && this.isAuthConfigured() && Boolean(this.supabase);
        if (configWarning) {
            configWarning.classList.toggle('d-none', configured);
        }

        const deniedReason = sessionStorage.getItem('auth_denied_reason');
        if (errorBox) {
            if (deniedReason) {
                errorBox.textContent = deniedReason;
                errorBox.classList.remove('d-none');
            } else {
                errorBox.classList.add('d-none');
                errorBox.textContent = '';
            }
        }

        if (emailEl) {
            emailEl.textContent = this.authState.email || 'Not signed in';
        }

        if (statusDot) {
            const authed = Boolean(this.authState.isAuthenticated);
            statusDot.classList.toggle('is-ok', authed);
            statusDot.classList.toggle('is-warn', !authed);
        }

        const showLogout = this.authState.isAuthenticated;
        if (logoutBtn) {
            logoutBtn.classList.toggle('d-none', !showLogout);
            if (!logoutBtn.dataset.bound) {
                logoutBtn.addEventListener('click', async () => {
                    if (!this.supabase) return;
                    try {
                        await this.supabase.auth.signOut();
                    } catch (error) {
                        console.error('[auth] signOut failed', error);
                    }
                });
                logoutBtn.dataset.bound = 'true';
            }
        }

        if (ssoContainer) {
            ssoContainer.classList.toggle('d-none', showLogout);
        }

        const providers = Array.isArray(this.authConfig?.supabase?.oauthProviders) ? this.authConfig.supabase.oauthProviders : ['github'];
        const allowGithub = providers.includes('github');
        const allowGoogle = providers.includes('google');

        if (githubBtn) githubBtn.classList.toggle('d-none', !allowGithub);
        if (googleBtn) googleBtn.classList.toggle('d-none', !allowGoogle);

        const bindOAuth = (btn, provider) => {
            if (!btn || btn.dataset.bound) return;
            btn.addEventListener('click', async () => {
                if (!configured) {
                    if (statusBox) {
                        statusBox.textContent = 'Auth is not configured yet.';
                        statusBox.classList.remove('d-none');
                    }
                    return;
                }

                try {
                    if (statusBox) {
                        statusBox.textContent = `Redirecting to ${provider}...`;
                        statusBox.classList.remove('d-none');
                    }

                    const redirectTo = `${window.location.origin}${window.location.pathname}`;
                    await this.supabase.auth.signInWithOAuth({
                        provider,
                        options: { redirectTo }
                    });
                } catch (error) {
                    console.error('[auth] signInWithOAuth failed', error);
                    if (errorBox) {
                        errorBox.textContent = 'Unable to start login right now. Please try again.';
                        errorBox.classList.remove('d-none');
                    }
                }
            });
            btn.dataset.bound = 'true';
        };

        bindOAuth(githubBtn, 'github');
        bindOAuth(googleBtn, 'google');

        // If already signed in and allowed, bounce to requested page quickly.
        if (this.isAuthedForProtectedPages()) {
            this.maybeRedirectAfterLogin();
        }
    }

    setupPromptInteractions() {
        this.setupModals();
        this.setupDownloadButton();
    }

    setupModals() {
        const highlightPairs = [
            ['qa-role', 'modal-qa-role'],
            ['task-objective', 'modal-task-objective'],
            ['test-environment', 'modal-test-environment'],
            ['workflow', 'modal-workflow'],
            ['selector-priorities', 'modal-selector-priorities'],
            ['file-location', 'modal-file-location'],
            ['code-structure', 'modal-code-structure'],
            ['test-structure', 'modal-test-structure'],
            ['common-patterns', 'modal-common-patterns'],
            ['locale-iteration', 'modal-locale-iteration'],
            ['file-organization', 'modal-file-organization'],
            ['required-format', 'modal-required-format'],
            ['do-not', 'modal-do-not'],
            ['goal', 'modal-goal']
        ];

        const modals = [];

        highlightPairs.forEach(([triggerId, modalId]) => {
            const trigger = document.getElementById(triggerId);
            const modal = document.getElementById(modalId);
            if (!trigger || !modal) return;

            trigger.setAttribute('role', 'button');
            trigger.setAttribute('tabindex', '0');

            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-hidden', 'true');
            modal.setAttribute('tabindex', '-1');

            const modalContent = modal.querySelector('.modal-content');
            if (modalContent && !modal.querySelector('.modal-close')) {
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'btn btn-sm btn-outline-secondary mt-3 modal-close';
                closeBtn.textContent = 'Close';
                modalContent.appendChild(closeBtn);
            }

            const openModal = () => {
                modal.classList.add('show');
                modal.setAttribute('aria-hidden', 'false');
                modal.focus({ preventScroll: true });
            };

            const closeModal = () => {
                modal.classList.remove('show');
                modal.setAttribute('aria-hidden', 'true');
                trigger.focus({ preventScroll: true });
            };

            const closeButton = modal.querySelector('.modal-close');
            if (closeButton && !closeButton.dataset.bound) {
                closeButton.addEventListener('click', closeModal);
                closeButton.dataset.bound = 'true';
            }

            trigger.addEventListener('click', openModal);
            trigger.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openModal();
                }
            });

            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeModal();
                }
            });

            modals.push({ modal, closeModal });
        });

        this.resetPromptEscapeHandler();
        this.promptEscapeHandler = (event) => {
            if (event.key !== 'Escape') return;
            modals.forEach(({ modal, closeModal }) => {
                if (modal.classList.contains('show')) {
                    closeModal();
                }
            });
        };
        document.addEventListener('keydown', this.promptEscapeHandler);
    }

    setupDownloadButton() {
        const downloadBtn = document.getElementById('download-md');
        if (!downloadBtn) return;

        downloadBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> Download Markdown';
        downloadBtn.setAttribute('title', 'Download prompt as Markdown');

        downloadBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('prompt_explained.md', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to retrieve markdown: ${response.status}`);
                }

                const blob = new Blob([await response.text()], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'automation-prompt-analysis.md';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Download error:', error);
                alert('Unable to download the markdown file right now. Please try again later.');
            }
        });
    }

    setupHomeCarousel() {
        const carouselElement = this.contentArea.querySelector('#linkedinCarousel');
        if (!carouselElement || !window.bootstrap?.Carousel) return;

        const instance = window.bootstrap.Carousel.getInstance(carouselElement);
        if (!instance) {
            new window.bootstrap.Carousel(carouselElement, {
                interval: 6000,
                ride: false,
                pause: 'hover',
                touch: true
            });
        }
    }

    setupUserStoryAnalyzer() {
        const form = document.getElementById('story-analyzer-form');
        const analyzeBtn = document.getElementById('analyze-btn');
        const clearBtn = document.getElementById('clear-btn');
        const loadingSpinner = document.getElementById('loading-spinner');
        const errorMessage = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        const resultsContainer = document.getElementById('results-container');
        const storyContent = document.getElementById('story-content');

        if (!form) return;

        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const story = storyContent.value.trim();
            if (!story) {
                this.showAnalyzerError('Please enter a user story to analyze.');
                return;
            }

            // Show loading state
            analyzeBtn.disabled = true;
            loadingSpinner.classList.remove('d-none');
            errorMessage.classList.add('d-none');
            resultsContainer.classList.add('d-none');

            try {
                // Make API request
                const response = await fetch('https://douglasdavila.duckdns.org/webhook/analyze_user_story', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa('admin:aqEp%U-815*y')
                    },
                    body: JSON.stringify({ story_content: story })
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }

                const data = await response.json();
                
                // Render results
                this.renderAnalysisResults(data);
                
                // Show results and clear button
                resultsContainer.classList.remove('d-none');
                clearBtn.classList.remove('d-none');
                
                // Scroll to results
                setTimeout(() => {
                    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);

            } catch (error) {
                console.error('Analysis error:', error);
                this.showAnalyzerError('Failed to analyze the user story. Please check your connection and try again.');
            } finally {
                analyzeBtn.disabled = false;
                loadingSpinner.classList.add('d-none');
            }
        });

        // Handle clear button
        clearBtn.addEventListener('click', () => {
            resultsContainer.classList.add('d-none');
            clearBtn.classList.add('d-none');
            errorMessage.classList.add('d-none');
            storyContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    showAnalyzerError(message) {
        const errorMessage = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        if (errorMessage && errorText) {
            errorText.textContent = message;
            errorMessage.classList.remove('d-none');
            errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    renderAnalysisResults(data) {
        if (!data) {
            console.error('No data received from API');
            this.showAnalyzerError('Invalid response from the server. Please try again.');
            return;
        }

        // API returns an object directly, not an array
        const investScore = data.invest_score;
        const improvements = data.story_improvement?.body;

        if (!investScore || !improvements) {
            console.error('Missing required data in API response', data);
            this.showAnalyzerError('Incomplete response from the server. Please try again.');
            return;
        }

        // Render INVEST scores
        this.renderInvestScores(investScore);

        // Render improvement suggestions
        this.renderImprovements(improvements);

        // Render rewritten story
        document.getElementById('rewritten-story').textContent = improvements.rewrittenStory || 'N/A';

        // Render Gherkin criteria
        const gherkinElement = document.getElementById('gherkin-criteria');
        gherkinElement.textContent = improvements.gherkinAcceptanceCriteria || 'N/A';
        
        // Highlight code if hljs is available
        setTimeout(() => {
            if (window.hljs?.highlightElement) {
                window.hljs.highlightElement(gherkinElement);
            }
        }, 10);

        // Render missing context
        document.getElementById('missing-context').textContent = improvements.missingContextOrDependencies || 'No specific dependencies identified.';

        // Update overall comments
        document.getElementById('overall-comment').textContent = investScore.overall_comment || '';
        document.getElementById('overall-improvement-comment').textContent = improvements.overallComment || '';
    }

    renderInvestScores(investScore) {
        const scoresContainer = document.getElementById('invest-scores');
        const scores = [
            { name: 'Independent', value: investScore.independent, icon: 'fa-puzzle-piece', key: 'independent' },
            { name: 'Negotiable', value: investScore.negotiable, icon: 'fa-handshake', key: 'negotiable' },
            { name: 'Valuable', value: investScore.valuable, icon: 'fa-gem', key: 'valuable' },
            { name: 'Estimable', value: investScore.estimable, icon: 'fa-calculator', key: 'estimable' },
            { name: 'Small', value: investScore.small, icon: 'fa-compress', key: 'small' },
            { name: 'Testable', value: investScore.testable, icon: 'fa-vial', key: 'testable' }
        ];

        scoresContainer.innerHTML = scores.map(score => {
            const badgeClass = this.getScoreBadgeClass(score.value);
            return `
                <div class="col-md-4 col-lg-2">
                    <div class="score-card text-center p-3 rounded-3 bg-body-tertiary h-100">
                        <i class="fa-solid ${score.icon} fs-3 mb-2 text-primary"></i>
                        <h3 class="h6 mb-2">${score.name}</h3>
                        <span class="badge ${badgeClass} fs-5">${score.value}/5</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderImprovements(improvements) {
        document.getElementById('independent-suggestion').textContent = improvements.independentSuggestion || 'N/A';
        document.getElementById('negotiable-suggestion').textContent = improvements.negotiableSuggestion || 'N/A';
        document.getElementById('valuable-suggestion').textContent = improvements.valuableSuggestion || 'N/A';
        document.getElementById('estimable-suggestion').textContent = improvements.estimableSuggestion || 'N/A';
        document.getElementById('small-suggestion').textContent = improvements.smallSuggestion || 'N/A';
        document.getElementById('testable-suggestion').textContent = improvements.testableSuggestion || 'N/A';
    }

    getScoreBadgeClass(score) {
        if (score <= 2) return 'bg-danger text-white';
        if (score <= 4) return 'bg-warning text-dark';
        return 'bg-success text-white';
    }


    closeMobileNav() {
        if (!this.navContainer || !window.bootstrap?.Collapse) return;
        if (!this.navContainer.classList.contains('show')) return;

        const instance = window.bootstrap.Collapse.getInstance(this.navContainer) || new window.bootstrap.Collapse(this.navContainer, { toggle: false });
        instance.hide();
    }

    resetPromptEscapeHandler() {
        if (this.promptEscapeHandler) {
            document.removeEventListener('keydown', this.promptEscapeHandler);
            this.promptEscapeHandler = null;
        }
    }

    showError(message) {
        this.contentArea.innerHTML = `
            <div class="bg-body-secondary border border-dashed border-secondary-subtle rounded-4 p-5 text-center">
                <h2 class="h4 mb-3">We hit a snag</h2>
                <p class="text-body-secondary mb-0">${message}</p>
            </div>
        `;
    }
}

function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;
    const body = document.body;
    const storageKey = 'preferred-theme';

    const applyTheme = (theme, persist = true) => {
        const normalized = theme === 'light' ? 'light' : 'dark';
        body.setAttribute('data-bs-theme', normalized);
        toggleBtn.setAttribute('aria-pressed', String(normalized === 'dark'));
        
        // Toggle navbar color scheme
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            if (normalized === 'dark') {
                navbar.classList.remove('navbar-light');
                navbar.classList.add('navbar-dark');
            } else {
                navbar.classList.remove('navbar-dark');
                navbar.classList.add('navbar-light');
            }
        }

        if (persist) {
            localStorage.setItem(storageKey, normalized);
        }
    };

    const storedTheme = localStorage.getItem(storageKey);
    if (storedTheme) {
        applyTheme(storedTheme, false);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light', false);
    }

    toggleBtn.addEventListener('click', () => {
        const nextTheme = body.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
    });

    toggleBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleBtn.click();
        }
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const mediaListener = (event) => {
        const stored = localStorage.getItem(storageKey);
        if (!stored) {
            applyTheme(event.matches ? 'dark' : 'light', false);
        }
    };

    if (media.addEventListener) {
        media.addEventListener('change', mediaListener);
    } else if (media.addListener) {
        media.addListener(mediaListener);
    }
}

function initDropdownSubmenus() {
    const Collapse = window.bootstrap?.Collapse;
    const toggles = document.querySelectorAll('[data-submenu-toggle]');

    toggles.forEach(toggle => {
        const targetSelector = toggle.getAttribute('data-bs-target');
        if (!targetSelector) {
            return;
        }

        const target = document.querySelector(targetSelector);
        if (!target) {
            return;
        }

        if (Collapse) {
            Collapse.getOrCreateInstance(target, { toggle: false });
        }

        if (target.classList.contains('show')) {
            toggle.classList.add('is-open', 'active');
        }

        target.addEventListener('shown.bs.collapse', () => {
            toggle.classList.add('is-open');
        });

        target.addEventListener('hidden.bs.collapse', () => {
            toggle.classList.remove('is-open');
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('page-space');
    initThemeToggle();
    initDropdownSubmenus();

    const router = new SPARouter();
    router.start().catch(error => {
        console.error('[router] Failed to start', error);
    });
});
