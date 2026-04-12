class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        // Static header links only (content pages may add route links dynamically).
        this.navLinks = Array.from(document.querySelectorAll('header [data-route]'));
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            // These routes are backed by Supabase Storage (see `content/protected-pages.json`).
            // Keep a non-sensitive placeholder fragment so the deployed site never ships the real content as static files.
            'prompt-explained': 'content/protected-loading.html',
            'user-story-analyzer': 'content/protected-loading.html',
            'qa-ai-training-program': 'content/qa-ai-training-program.html',
            'login': 'content/login.html',
            'privacy': 'content/privacy.html',
            'profile': 'content/profile.html'
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
            hasPrivileges: false,
            isAdmin: false,
            privilegesLoaded: false,
            email: null,
            fullName: null,
            provider: null,
            avatarUrl: null,
            avatarOverrideUrl: null
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

    getSupabaseStorageSpec(spec) {
        if (!spec || spec.type !== 'supabase_storage') return null;
        const bucket = String(spec.bucket || '').trim();
        const path = String(spec.path || '').trim();
        if (!bucket || !path) return null;
        return { bucket, path };
    }

    getProtectedContentHtmlSpec(routeId) {
        const entry = this.protectedPagesIndex.get(routeId);
        return this.getSupabaseStorageSpec(entry?.content?.html);
    }

    getProtectedDownloadSpec(routeId, elementId) {
        const entry = this.protectedPagesIndex.get(routeId);
        const downloads = Array.isArray(entry?.content?.downloads) ? entry.content.downloads : [];
        const match = downloads.find(d => d && d.elementId === elementId);
        if (!match) return null;

        const storage = this.getSupabaseStorageSpec(match);
        if (!storage) return null;

        return {
            ...storage,
            filename: String(match.filename || '').trim() || null,
            contentType: String(match.contentType || '').trim() || null
        };
    }

    getProtectedIframeSpec(routeId) {
        const entry = this.protectedPagesIndex.get(routeId);
        const storage = this.getSupabaseStorageSpec(entry?.content?.iframe);
        if (!storage) return null;

        const rawExpiry = Number(entry?.content?.iframe?.expiresInSeconds);
        const expiresInSeconds = Number.isFinite(rawExpiry) && rawExpiry > 0 ? Math.floor(rawExpiry) : 600;

        return {
            ...storage,
            expiresInSeconds
        };
    }

    async downloadFromSupabaseStorage(bucket, path) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.storage.from(bucket).download(path);
        if (error) {
            throw error;
        }
        if (!data) {
            throw new Error('Storage download returned no data.');
        }

        return data; // Blob
    }

    async createSupabaseSignedUrl(bucket, path, expiresInSeconds = 600) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const ttl = Number.isFinite(Number(expiresInSeconds)) ? Math.max(60, Math.floor(Number(expiresInSeconds))) : 600;
        const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(path, ttl);
        if (error) {
            throw error;
        }
        if (!data?.signedUrl) {
            throw new Error('Storage signed URL response is missing signedUrl.');
        }

        return data.signedUrl;
    }

    async loadContent(page) {
        this.resetPromptEscapeHandler();

        const protectedHtmlSpec = this.getProtectedContentHtmlSpec(page);
        if (protectedHtmlSpec) {
            // Render a non-sensitive placeholder while we fetch protected content.
            this.contentArea.innerHTML = `
                <section class="py-4">
                  <div class="card shadow-sm">
                    <div class="card-body p-4">
                      <h1 class="h4 mb-2">Loading protected content</h1>
                      <p class="text-body-secondary mb-3">Fetching this page from private storage...</p>
                      <div class="d-flex align-items-center gap-2" role="status" aria-live="polite">
                        <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
                        <span>Working...</span>
                      </div>
                    </div>
                  </div>
                </section>
            `;

            const blob = await this.downloadFromSupabaseStorage(protectedHtmlSpec.bucket, protectedHtmlSpec.path);
            const markup = await blob.text();
            this.contentArea.innerHTML = markup;
            this.initializePageScripts(page);
            return;
        }

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
            if (runtimeUrl && !this.authConfig.supabase.url) {
                this.authConfig.supabase.url = runtimeUrl;
            }

            if (runtimeAnonKey && !this.authConfig.supabase.anonKey) {
                this.authConfig.supabase.anonKey = runtimeAnonKey;
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

    updateProtectedAccessReason() {
        if (!this.authState.isAuthenticated) {
            sessionStorage.removeItem('auth_denied_reason');
            return;
        }

        if (!this.authState.privilegesLoaded) {
            sessionStorage.setItem('auth_denied_reason', 'Your account is signed in, but your protected-content access is still being resolved.');
            return;
        }

        if (!this.authState.hasPrivileges) {
            sessionStorage.setItem('auth_denied_reason', 'Your account is signed in, but does not have privileges to access protected content.');
            return;
        }

        sessionStorage.removeItem('auth_denied_reason');
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
                if (data?.session?.user) {
                    await this.ensureProfileRow();
                }
            }

            this.supabase.auth.onAuthStateChange(async (event, session) => {
                this.setAuthSession(session || null);

                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && this.authState.isAuthenticated) {
                    try {
                        await this.ensureProfileRow();
                    } catch (error) {
                        console.warn('[profile] ensureProfileRow failed', error);
                    }
                }

                this.updateProtectedAccessReason();
                this.updateAuthUI();
                this.applyNavVisibilityRules();

                // If the user is currently on the login page, refresh its UI (hide SSO, update dot, etc.).
                if (this.currentPage === 'login') {
                    this.setupLoginPage();
                }

                if (event === 'PASSWORD_RECOVERY') {
                    // User came from a recovery email link; prompt them to set a new password.
                    sessionStorage.setItem('password_recovery', '1');
                    if ((this.currentPage || '') !== 'login') {
                        this.navigate('login', 'replace');
                    } else {
                        this.setupLoginPage();
                    }
                    return;
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
        const fullName = meta.full_name || meta.fullName || meta.name || null;
        const provider = session?.user?.app_metadata?.provider || meta.provider || null;
        const isAuthenticated = Boolean(session?.user);

        this.authState.isAuthenticated = isAuthenticated;
        this.authState.hasPrivileges = false;
        this.authState.isAdmin = false;
        this.authState.privilegesLoaded = !isAuthenticated;
        this.authState.email = email;
        this.authState.fullName = fullName;
        this.authState.provider = provider;
        this.authState.avatarUrl = avatarUrl;
        if (!isAuthenticated) {
            this.authState.avatarOverrideUrl = null;
        }

        this.updateProtectedAccessReason();
    }

    isAuthedForProtectedPages() {
        return this.authState.isAuthenticated && this.authState.privilegesLoaded && this.authState.hasPrivileges;
    }

    guardRoute(page) {
        const entry = this.protectedPagesIndex.get(page);
        if (!entry || !entry.requireAuth) return null;

        if (page === (this.protectedPagesConfig.defaults?.redirectRoute || 'login')) return null;

        // "requireAuth" means: signed in is required. Protected content is granted by `profiles.has_privileges`.
        // Profile is available to any authenticated user so they can complete their details, even if not privileged.
        if (!this.authState.isAuthenticated) {
            return {
                redirectTo: this.protectedPagesConfig.defaults?.redirectRoute || 'login',
                storeRedirectFrom: true,
                reason: sessionStorage.getItem('auth_denied_reason') || null
            };
        }

        if (page === 'profile') {
            return null;
        }

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
        const forceProfile = sessionStorage.getItem('post_auth_force_profile');
        // Always allow redirecting to profile for any authenticated user, even if they lack protected-content privileges.
        if ((forceProfile === '1' || this.currentPage === 'login') && this.authState.isAuthenticated) {
            sessionStorage.removeItem('post_auth_force_profile');
            sessionStorage.removeItem('post_login_redirect');
            sessionStorage.removeItem('auth_denied_reason');
            if (this.currentPage !== 'profile') {
                this.navigate('profile', 'replace');
            }
            return;
        }

        if (!this.isAuthedForProtectedPages()) return;

        const requested = sessionStorage.getItem('post_login_redirect');
        if (!requested) return;
        sessionStorage.removeItem('post_login_redirect');
        sessionStorage.removeItem('auth_denied_reason');

        const target = this.routes[requested] ? requested : 'home';
        if (this.currentPage === target) return;
        this.navigate(target, 'replace');
    }

    getAvatarPublicUrl(path) {
        if (!path || !this.supabase?.storage) return null;
        try {
            const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch {
            return null;
        }
    }

    async ensureProfileRow() {
        if (!this.supabase) return;
        if (!this.authState.isAuthenticated) return;

        const { data, error } = await this.supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user;
        if (!user) return;

        const meta = user.user_metadata || {};
        const fullName = meta.full_name || meta.name || this.authState.fullName || null;
        const email = user.email || this.authState.email || null;
        const provider = user.app_metadata?.provider || this.authState.provider || null;
        const oauthAvatarUrl = meta.avatar_url || meta.picture || this.authState.avatarUrl || null;

        if (!email) return;

        // Email is used as the primary key per repo preference. Also store user_id for stable linkage + RLS checks.
        const payload = {
            email,
            user_id: user.id,
            full_name: fullName,
            provider,
            oauth_avatar_url: oauthAvatarUrl
        };

        const upsert = await this.supabase
            .from('profiles')
            .upsert(payload, { onConflict: 'email' })
            .select('email, avatar_storage_path, oauth_avatar_url, has_privileges, is_admin')
            .maybeSingle();

        if (upsert.error) throw upsert.error;

        const row = upsert.data;
        this.authState.hasPrivileges = Boolean(row?.has_privileges);
        this.authState.isAdmin = Boolean(row?.is_admin);
        this.authState.privilegesLoaded = true;
        const overrideUrl = row?.avatar_storage_path ? this.getAvatarPublicUrl(row.avatar_storage_path) : null;
        this.authState.avatarOverrideUrl = overrideUrl;
        this.updateProtectedAccessReason();
        this.updateAuthUI();
    }

    getCurrentIdentity() {
        const email = this.authState.email || null;
        const provider = this.authState.provider || null;
        const avatarUrl = this.authState.avatarOverrideUrl || this.authState.avatarUrl || null;
        const fullName = this.authState.fullName || null;
        return { email, provider, avatarUrl, fullName };
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
            const url = this.authState.avatarOverrideUrl || this.authState.avatarUrl || null;
            userAvatar.src = url ? url : fallbackAvatar;
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
            'qa-ai-training-program': 'QA AI Training Program | Douglas D\'Avila',
            'login': 'Sign in | Douglas D\'Avila',
            'privacy': 'Privacy | Douglas D\'Avila',
            'profile': 'Profile | Douglas D\'Avila'
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
            this.setupPromptInteractions(page);
        }

        if (page === 'home') {
            this.setupHomeCarousel();
        }

        if (page === 'user-story-analyzer') {
            this.setupUserStoryAnalyzer();
        }

        if (page === 'qa-ai-training-program') {
            this.setupQaAiTrainingPage();
        }

        if (page === 'login') {
            this.setupLoginPage();
        }

        if (page === 'profile') {
            this.setupProfilePage();
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

                    // After successful sign in (OAuth), route to profile per requirement.
                    sessionStorage.setItem('post_auth_force_profile', '1');

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

        const emailAuthRoot = document.getElementById('login-email-auth');
        const dividerEl = document.getElementById('login-divider');
        const alreadySignedInEl = document.getElementById('login-already-signedin');

        if (emailAuthRoot) {
            emailAuthRoot.classList.toggle('d-none', showLogout);
        }
        if (dividerEl) {
            dividerEl.classList.toggle('d-none', showLogout);
        }
        if (alreadySignedInEl) {
            alreadySignedInEl.classList.toggle('d-none', !showLogout);
        }

        const setError = (msg) => {
            if (!errorBox) return;
            if (msg) {
                errorBox.textContent = msg;
                errorBox.classList.remove('d-none');
            } else {
                errorBox.textContent = '';
                errorBox.classList.add('d-none');
            }
        };

        const setStatus = (msg) => {
            if (!statusBox) return;
            if (msg) {
                statusBox.textContent = msg;
                statusBox.classList.remove('d-none');
            } else {
                statusBox.textContent = '';
                statusBox.classList.add('d-none');
            }
        };

        if (emailAuthRoot && !emailAuthRoot.dataset.bound) {
            const tabSignin = document.getElementById('login-tab-signin');
            const tabSignup = document.getElementById('login-tab-signup');
            const panelSignin = document.getElementById('login-panel-signin');
            const panelSignup = document.getElementById('login-panel-signup');
            const panelVerify = document.getElementById('login-panel-verify');
            const panelRecovery = document.getElementById('login-panel-recovery');

            const formSignin = document.getElementById('login-form-signin');
            const formSignup = document.getElementById('login-form-signup');
            const formVerify = document.getElementById('login-form-verify');
            const formRecovery = document.getElementById('login-form-recovery');

            const signinEmail = document.getElementById('login-signin-email');
            const signinPassword = document.getElementById('login-signin-password');
            const forgotBtn = document.getElementById('login-forgot-password');

            const signupName = document.getElementById('login-signup-name');
            const signupEmail = document.getElementById('login-signup-email');
            const signupPassword = document.getElementById('login-signup-password');
            const signupPassword2 = document.getElementById('login-signup-password2');

            const verifyEmail = document.getElementById('login-verify-email');
            const verifyCode = document.getElementById('login-verify-code');
            const verifyResend = document.getElementById('login-verify-resend');
            const verifyCancel = document.getElementById('login-verify-cancel');

            const recoveryEmail = document.getElementById('login-recovery-email');
            const recoveryPassword = document.getElementById('login-recovery-password');
            const recoveryPassword2 = document.getElementById('login-recovery-password2');
            const recoveryCancel = document.getElementById('login-recovery-cancel');

            const switchToSignup = document.getElementById('login-switch-to-signup');
            const switchToSignin = document.getElementById('login-switch-to-signin');

            const setMode = (mode) => {
                const isSignin = mode === 'signin';
                const isSignup = mode === 'signup';
                const isVerify = mode === 'verify';
                const isRecover = mode === 'recover';

                if (tabSignin) {
                    tabSignin.classList.toggle('is-active', isSignin);
                    tabSignin.setAttribute('aria-selected', isSignin ? 'true' : 'false');
                }
                if (tabSignup) {
                    tabSignup.classList.toggle('is-active', isSignup);
                    tabSignup.setAttribute('aria-selected', isSignup ? 'true' : 'false');
                }

                // Hide the tablist when in recovery mode to avoid suggesting sign-in/signup actions.
                if (tabSignin?.parentElement) {
                    tabSignin.parentElement.classList.toggle('d-none', isRecover);
                }

                if (panelSignin) panelSignin.classList.toggle('d-none', !isSignin);
                if (panelSignup) panelSignup.classList.toggle('d-none', !isSignup);
                if (panelVerify) panelVerify.classList.toggle('d-none', !isVerify);
                if (panelRecovery) panelRecovery.classList.toggle('d-none', !isRecover);

                setError(null);
                setStatus(null);
            };

            const sanitizeOtp = (value) => String(value || '').replace(/\D+/g, '').slice(0, 6);

            if (tabSignin) {
                tabSignin.addEventListener('click', () => setMode('signin'));
            }
            if (tabSignup) {
                tabSignup.addEventListener('click', () => setMode('signup'));
            }
            if (switchToSignup) {
                switchToSignup.addEventListener('click', () => setMode('signup'));
            }
            if (switchToSignin) {
                switchToSignin.addEventListener('click', () => setMode('signin'));
            }

            if (verifyCode) {
                verifyCode.addEventListener('input', () => {
                    const next = sanitizeOtp(verifyCode.value);
                    if (verifyCode.value !== next) verifyCode.value = next;
                });
            }

            if (formSignin) {
                formSignin.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;

                    const email = String(signinEmail?.value || '').trim();
                    const password = String(signinPassword?.value || '');
                    if (!email || !password) {
                        setError('Please enter your email and password.');
                        return;
                    }

                    try {
                        setStatus('Signing in...');
                        sessionStorage.setItem('post_auth_force_profile', '1');
                        const { error } = await this.supabase.auth.signInWithPassword({ email, password });
                        if (error) throw error;
                        setStatus('Signed in. Redirecting to profile...');
                    } catch (error) {
                        console.error('[auth] signInWithPassword failed', error);
                        setStatus(null);
                        setError('Unable to sign in. Please double-check your credentials and try again.');
                    }
                });
            }

            if (formSignup) {
                formSignup.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;

                    const fullName = String(signupName?.value || '').trim();
                    const email = String(signupEmail?.value || '').trim();
                    const password = String(signupPassword?.value || '');
                    const password2 = String(signupPassword2?.value || '');

                    if (!email || !password) {
                        setError('Please enter an email and a password.');
                        return;
                    }
                    if (password.length < 8) {
                        setError('Password must be at least 8 characters.');
                        return;
                    }
                    if (password !== password2) {
                        setError('Passwords do not match.');
                        return;
                    }

                    try {
                        setStatus('Sending verification code...');
                        this.pendingEmailSignup = { email, password, fullName };

                        // Uses Supabase email OTP. Your Supabase email template must include the token to display a code.
                        const { error } = await this.supabase.auth.signInWithOtp({
                            email,
                            options: {
                                shouldCreateUser: true,
                                data: fullName ? { full_name: fullName } : undefined
                            }
                        });
                        if (error) throw error;

                        if (verifyEmail) verifyEmail.value = email;
                        if (verifyCode) verifyCode.value = '';
                        setMode('verify');
                        setStatus('Check your email for the verification code.');
                        if (verifyCode && typeof verifyCode.focus === 'function') {
                            verifyCode.focus({ preventScroll: true });
                        }
                    } catch (error) {
                        console.error('[auth] signInWithOtp failed', error);
                        this.pendingEmailSignup = null;
                        setStatus(null);
                        setError('Unable to send a verification code right now. Please try again.');
                    }
                });
            }

            if (formVerify) {
                formVerify.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;

                    const pending = this.pendingEmailSignup;
                    const email = String(verifyEmail?.value || pending?.email || '').trim();
                    const token = sanitizeOtp(verifyCode?.value || '');
                    if (!email) {
                        setError('Missing email for verification.');
                        return;
                    }
                    if (!/^\d{6}$/.test(token)) {
                        setError('Please enter the 6-digit code from your email.');
                        return;
                    }

                    try {
                        setStatus('Verifying code...');
                        const { error: verifyErr } = await this.supabase.auth.verifyOtp({
                            email,
                            token,
                            type: 'email'
                        });
                        if (verifyErr) throw verifyErr;

                        // Once verified, enable password-based sign-in by setting the password on the new account.
                        const newPassword = pending?.password;
                        if (newPassword) {
                            const { error: updateErr } = await this.supabase.auth.updateUser({ password: newPassword });
                            if (updateErr) throw updateErr;
                        }

                        this.pendingEmailSignup = null;
                        sessionStorage.setItem('post_auth_force_profile', '1');
                        setStatus('Signup complete. Redirecting to profile...');
                    } catch (error) {
                        console.error('[auth] verifyOtp/updateUser failed', error);
                        setStatus(null);
                        setError('Invalid or expired code. Please try again (or resend a new code).');
                    }
                });
            }

            if (verifyResend) {
                verifyResend.addEventListener('click', async () => {
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;
                    const email = String(verifyEmail?.value || this.pendingEmailSignup?.email || '').trim();
                    if (!email) {
                        setError('Missing email to resend the code.');
                        return;
                    }
                    try {
                        setStatus('Resending verification code...');
                        const fullName = String(this.pendingEmailSignup?.fullName || '').trim();
                        const { error } = await this.supabase.auth.signInWithOtp({
                            email,
                            options: {
                                shouldCreateUser: true,
                                data: fullName ? { full_name: fullName } : undefined
                            }
                        });
                        if (error) throw error;
                        setStatus('Verification code resent. Check your email.');
                    } catch (error) {
                        console.error('[auth] resend signInWithOtp failed', error);
                        setStatus(null);
                        setError('Unable to resend the code right now. Please try again.');
                    }
                });
            }

            if (verifyCancel) {
                verifyCancel.addEventListener('click', () => {
                    this.pendingEmailSignup = null;
                    setMode('signup');
                });
            }

            if (forgotBtn) {
                forgotBtn.addEventListener('click', async () => {
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;

                    const email = String(signinEmail?.value || '').trim();
                    if (!email) {
                        setError('Enter your email above first, then click “Forgot my password”.');
                        return;
                    }

                    try {
                        setStatus('Sending password reset email...');
                        // Supabase will send a recovery link; when the user returns, we show the recovery form.
                        const redirectTo = `${window.location.origin}${window.location.pathname}#login`;
                        const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
                        if (error) throw error;
                        setStatus('Password reset email sent. Open it to continue.');
                    } catch (error) {
                        console.error('[auth] resetPasswordForEmail failed', error);
                        setStatus(null);
                        setError('Unable to send reset email right now. Please try again.');
                    }
                });
            }

            if (formRecovery) {
                formRecovery.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    setError(null);
                    setStatus(null);
                    if (!configured) {
                        setStatus('Auth is not configured yet.');
                        return;
                    }
                    if (!this.supabase) return;

                    const p1 = String(recoveryPassword?.value || '');
                    const p2 = String(recoveryPassword2?.value || '');
                    if (p1.length < 8) {
                        setError('Password must be at least 8 characters.');
                        return;
                    }
                    if (p1 !== p2) {
                        setError('Passwords do not match.');
                        return;
                    }

                    try {
                        setStatus('Updating password...');
                        const { error } = await this.supabase.auth.updateUser({ password: p1 });
                        if (error) throw error;
                        sessionStorage.removeItem('password_recovery');
                        sessionStorage.setItem('post_auth_force_profile', '1');
                        setStatus('Password updated. Redirecting to profile...');
                        this.maybeRedirectAfterLogin();
                    } catch (error) {
                        console.error('[auth] updateUser(password) failed', error);
                        setStatus(null);
                        setError('Unable to update password. Please try again.');
                    }
                });
            }

            if (recoveryCancel) {
                recoveryCancel.addEventListener('click', () => {
                    sessionStorage.removeItem('password_recovery');
                    setMode('signin');
                });
            }

            // Default panel.
            const recoveryMode = sessionStorage.getItem('password_recovery') === '1' && this.authState.isAuthenticated;
            if (recoveryMode) {
                const identity = this.getCurrentIdentity();
                if (recoveryEmail) recoveryEmail.value = identity.email || '';
                if (recoveryPassword) recoveryPassword.value = '';
                if (recoveryPassword2) recoveryPassword2.value = '';
                setMode('recover');
                if (recoveryPassword && typeof recoveryPassword.focus === 'function') {
                    recoveryPassword.focus({ preventScroll: true });
                }
            } else {
                setMode('signin');
            }
            emailAuthRoot.dataset.bound = 'true';
        }

        // If already signed in, bounce away from login quickly (profile for any authed user; otherwise a stored redirect).
        if (this.authState.isAuthenticated) {
            this.maybeRedirectAfterLogin();
        }
    }

    setupProfilePage() {
        const statusEl = document.getElementById('profile-save-status');
        const badgeEl = document.getElementById('profile-auth-badge');
        const avatarEl = document.getElementById('profile-avatar');
        const avatarFileEl = document.getElementById('profile-avatar-file');

        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        const providerEl = document.getElementById('profile-provider');
        const privilegesEl = document.getElementById('profile-privileges');
        const adminEl = document.getElementById('profile-admin-status');
        const adminPanelEl = document.getElementById('profile-admin-panel');

        const countryEl = document.getElementById('profile-phone-country');
        const dialEl = document.getElementById('profile-phone-dial');
        const phoneEl = document.getElementById('profile-phone');
        const roleEl = document.getElementById('profile-role');
        const companyUrlEl = document.getElementById('profile-company-url');
        const formEl = document.getElementById('profile-form');

        const setStatus = (message) => {
            if (!statusEl) return;
            statusEl.textContent = message || '';
        };

        if (!this.authState.isAuthenticated || !this.supabase) {
            if (badgeEl) badgeEl.textContent = 'Not signed in';
            setStatus('Please sign in to view your profile.');
            this.navigate('login', 'replace');
            return;
        }

        const fallbackAvatar = 'assets/user-default.svg';
        const identity = this.getCurrentIdentity();
        if (nameEl) nameEl.value = identity.fullName || '';
        if (emailEl) emailEl.value = identity.email || '';
        if (providerEl) providerEl.value = identity.provider || '';
        if (privilegesEl) privilegesEl.value = this.authState.hasPrivileges ? 'Enabled' : 'Disabled';
        if (adminEl) adminEl.value = this.authState.isAdmin ? 'Enabled' : 'Disabled';
        if (adminPanelEl) adminPanelEl.classList.toggle('d-none', !this.authState.isAdmin);
        if (badgeEl) badgeEl.textContent = 'Signed in';
        if (avatarEl) avatarEl.src = identity.avatarUrl || fallbackAvatar;

        const countries = [
            { iso2: 'US', name: 'United States', dial: '+1' },
            { iso2: 'BR', name: 'Brazil', dial: '+55' },
            { iso2: 'CA', name: 'Canada', dial: '+1' },
            { iso2: 'GB', name: 'United Kingdom', dial: '+44' },
            { iso2: 'DE', name: 'Germany', dial: '+49' },
            { iso2: 'FR', name: 'France', dial: '+33' },
            { iso2: 'ES', name: 'Spain', dial: '+34' },
            { iso2: 'PT', name: 'Portugal', dial: '+351' },
            { iso2: 'NL', name: 'Netherlands', dial: '+31' },
            { iso2: 'AU', name: 'Australia', dial: '+61' },
            { iso2: 'IN', name: 'India', dial: '+91' },
            { iso2: 'JP', name: 'Japan', dial: '+81' },
            { iso2: 'KR', name: 'South Korea', dial: '+82' },
            { iso2: 'MX', name: 'Mexico', dial: '+52' },
            { iso2: 'AR', name: 'Argentina', dial: '+54' },
            { iso2: 'CL', name: 'Chile', dial: '+56' },
            { iso2: 'CO', name: 'Colombia', dial: '+57' },
            { iso2: 'UY', name: 'Uruguay', dial: '+598' },
            { iso2: 'PE', name: 'Peru', dial: '+51' },
            { iso2: 'ZA', name: 'South Africa', dial: '+27' },
            { iso2: 'OTHER', name: 'Other', dial: '' }
        ];

        const toFlag = (iso2) => {
            if (!iso2 || iso2.length !== 2) return '🌐';
            const base = 0x1F1E6;
            const A = 0x41;
            const chars = iso2.toUpperCase().split('');
            return String.fromCodePoint(base + (chars[0].charCodeAt(0) - A), base + (chars[1].charCodeAt(0) - A));
        };

        if (countryEl && !countryEl.dataset.bound) {
            countryEl.innerHTML = '';
            countries.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.iso2;
                const flag = c.iso2 === 'OTHER' ? '🌐' : toFlag(c.iso2);
                opt.textContent = `${flag} ${c.name}${c.dial ? ` (${c.dial})` : ''}`;
                opt.dataset.dial = c.dial || '';
                countryEl.appendChild(opt);
            });
            countryEl.value = 'US';
            countryEl.dataset.bound = 'true';
        }

        const syncDialInput = () => {
            if (!countryEl || !dialEl) return;
            const selected = countryEl.options[countryEl.selectedIndex];
            const dial = selected?.dataset?.dial || '';
            const isOther = countryEl.value === 'OTHER';
            dialEl.classList.toggle('d-none', !isOther);
            if (!isOther) {
                dialEl.value = dial;
            } else if (!dialEl.value) {
                dialEl.value = '+';
            }
        };

        if (countryEl && dialEl && !countryEl.dataset.boundChange) {
            countryEl.addEventListener('change', syncDialInput);
            countryEl.dataset.boundChange = 'true';
        }
        syncDialInput();

        let pendingAvatarFile = null;
        if (avatarFileEl && !avatarFileEl.dataset.bound) {
            avatarFileEl.addEventListener('change', () => {
                const file = avatarFileEl.files?.[0] || null;
                pendingAvatarFile = null;
                if (!file) return;

                const allowed = ['image/jpeg', 'image/png', 'image/webp'];
                if (!allowed.includes(file.type)) {
                    setStatus('Unsupported image type. Use JPG, PNG, or WebP.');
                    avatarFileEl.value = '';
                    return;
                }

                const maxBytes = 2 * 1024 * 1024;
                if (file.size > maxBytes) {
                    setStatus('Image too large. Max 2 MB.');
                    avatarFileEl.value = '';
                    return;
                }

                pendingAvatarFile = file;
                const url = URL.createObjectURL(file);
                if (avatarEl) avatarEl.src = url;
                setStatus('New photo selected. Click Save changes.');
            });
            avatarFileEl.dataset.bound = 'true';
        }

        const loadExisting = async () => {
            if (!identity.email) return null;
            const { data, error } = await this.supabase
                .from('profiles')
                .select('email, role, company_website_url, phone_country_iso2, phone_dial_code, phone_number, avatar_storage_path, oauth_avatar_url, has_privileges, is_admin')
                .eq('email', identity.email)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        };

        const applyExisting = (row) => {
            if (!row) return;
            this.authState.hasPrivileges = Boolean(row.has_privileges);
            this.authState.isAdmin = Boolean(row.is_admin);
            if (roleEl) roleEl.value = row.role || '';
            if (companyUrlEl) companyUrlEl.value = row.company_website_url || '';
            if (phoneEl) phoneEl.value = row.phone_number || '';

            if (countryEl) {
                const iso2 = row.phone_country_iso2 || '';
                const option = Array.from(countryEl.options).find(o => o.value === iso2);
                countryEl.value = option ? iso2 : 'OTHER';
            }

            if (dialEl) {
                dialEl.value = row.phone_dial_code || '';
            }
            syncDialInput();

            const overrideUrl = row.avatar_storage_path ? this.getAvatarPublicUrl(row.avatar_storage_path) : null;
            const effectiveAvatar = overrideUrl || identity.avatarUrl || row.oauth_avatar_url || fallbackAvatar;
            if (avatarEl) avatarEl.src = effectiveAvatar;
            if (privilegesEl) privilegesEl.value = row.has_privileges ? 'Enabled' : 'Disabled';
            if (adminEl) adminEl.value = row.is_admin ? 'Enabled' : 'Disabled';
            if (adminPanelEl) adminPanelEl.classList.toggle('d-none', !row.is_admin);
            this.updateProtectedAccessReason();
        };

        loadExisting()
            .then(applyExisting)
            .catch(err => {
                console.warn('[profile] load failed', err);
                setStatus('Unable to load profile right now.');
            });

        const normalizeUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw)) return raw;
            return `https://${raw}`;
        };

        const save = async () => {
            setStatus('Saving...');

            const { data: userData, error: userErr } = await this.supabase.auth.getUser();
            if (userErr) throw userErr;
            const user = userData?.user;
            if (!user) throw new Error('Missing user session');

            const email = user.email || identity.email;
            if (!email) throw new Error('Missing email');

            const meta = user.user_metadata || {};
            const fullName = meta.full_name || meta.name || identity.fullName || null;
            const provider = user.app_metadata?.provider || identity.provider || null;
            const oauthAvatarUrl = meta.avatar_url || meta.picture || identity.avatarUrl || null;

            let avatarPath = null;
            if (pendingAvatarFile) {
                const ext = pendingAvatarFile.type === 'image/png' ? 'png' : (pendingAvatarFile.type === 'image/webp' ? 'webp' : 'jpg');
                const path = `${user.id}/avatar.${ext}`;
                const upload = await this.supabase.storage
                    .from('avatars')
                    .upload(path, pendingAvatarFile, { upsert: true, contentType: pendingAvatarFile.type, cacheControl: '3600' });
                if (upload.error) throw upload.error;
                avatarPath = path;
            }

            const phoneCountry = countryEl ? countryEl.value : null;
            const phoneDial = dialEl ? String(dialEl.value || '').trim() : '';
            const phoneNumber = phoneEl ? String(phoneEl.value || '').trim() : '';

            const payload = {
                email,
                user_id: user.id,
                full_name: fullName,
                provider,
                oauth_avatar_url: oauthAvatarUrl,
                role: roleEl ? String(roleEl.value || '').trim() : null,
                company_website_url: companyUrlEl ? normalizeUrl(companyUrlEl.value) : null,
                phone_country_iso2: phoneCountry && phoneCountry !== 'OTHER' ? phoneCountry : null,
                phone_dial_code: phoneDial || null,
                phone_number: phoneNumber || null
            };

            if (avatarPath) {
                payload.avatar_storage_path = avatarPath;
            }

            const { data, error } = await this.supabase
                .from('profiles')
                .upsert(payload, { onConflict: 'email' })
                .select('avatar_storage_path')
                .maybeSingle();
            if (error) throw error;

            const overrideUrl = data?.avatar_storage_path ? this.getAvatarPublicUrl(data.avatar_storage_path) : null;
            this.authState.avatarOverrideUrl = overrideUrl;
            this.updateAuthUI();

            pendingAvatarFile = null;
            if (avatarFileEl) avatarFileEl.value = '';
            setStatus('Saved.');
        };

        if (formEl && !formEl.dataset.bound) {
            formEl.addEventListener('submit', (event) => {
                event.preventDefault();
                save().catch(err => {
                    console.error('[profile] save failed', err);
                    setStatus('Unable to save right now.');
                });
            });
            formEl.dataset.bound = 'true';
        }
    }

    setupPromptInteractions(routeId) {
        this.setupModals();
        this.setupDownloadButton(routeId);
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

    setupDownloadButton(routeId) {
        const downloadBtn = document.getElementById('download-md');
        if (!downloadBtn) return;

        downloadBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> Download Markdown';
        downloadBtn.setAttribute('title', 'Download prompt as Markdown');

        downloadBtn.addEventListener('click', async () => {
            try {
                const page = String(routeId || 'prompt-explained');
                const spec = this.getProtectedDownloadSpec(page, 'download-md');
                if (!spec) {
                    throw new Error('No protected download is configured for this page.');
                }

                const raw = await this.downloadFromSupabaseStorage(spec.bucket, spec.path);
                let blob = raw;
                if (spec.contentType && raw.type !== spec.contentType) {
                    blob = new Blob([await raw.arrayBuffer()], { type: spec.contentType });
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = spec.filename || 'download.md';
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
                        'Content-Type': 'application/json'
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

    async setupQaAiTrainingPage() {
        const iframe = document.getElementById('qa-training-frame');
        const status = document.getElementById('qa-training-status');
        if (!iframe) return;

        try {
            if (!this.isAuthedForProtectedPages()) {
                throw new Error('You are not authorized to access this protected training content.');
            }

            const spec = this.getProtectedIframeSpec('qa-ai-training-program');
            if (!spec) {
                throw new Error('Training iframe source is not configured in protected-pages.json.');
            }

            if (status) {
                status.className = 'alert alert-info mb-3';
                status.textContent = 'Loading protected training content...';
            }

            const blob = await this.downloadFromSupabaseStorage(spec.bucket, spec.path);
            const html = await blob.text();
            iframe.removeAttribute('src');
            iframe.srcdoc = html;
            iframe.addEventListener('load', () => {
                if (status) {
                    status.className = 'alert alert-success mb-3';
                    status.textContent = 'Training content loaded.';
                }
            }, { once: true });
        } catch (error) {
            console.error('[training] failed to load protected iframe', error);
            iframe.removeAttribute('src');
            if (status) {
                status.className = 'alert alert-danger mb-3';
                status.textContent = 'Unable to load the training content right now.';
            }
        }
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
