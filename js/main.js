class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        // Static header links only (content pages may add route links dynamically).
        this.navLinks = Array.from(document.querySelectorAll('header [data-route]'));
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            'relationship-graph': 'content/relationship-graph.html',
            'relationship-entity': 'content/relationship-entity.html',
            'user-story-analyzer': 'content/user-story-analyzer.html',
            'login': 'content/login.html',
            'privacy': 'content/privacy.html',
            'profile': 'content/profile.html'
        };
        this.currentPage = '';
        this.currentRouteTarget = '';
        this.navContainer = document.getElementById('primaryNav');

        this.protectedPagesConfigUrl = 'content/protected-pages.json';
        this.authConfigUrl = 'content/auth.config.json';
        this.authRuntimeUrl = 'content/auth.runtime.json';

        this.homeConfig = null;

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
            userId: null,
            avatarUrl: null,
            avatarOverrideUrl: null
        };
        this.authCallbackHandled = false;
        this.pendingPostAuthNavigationTarget = null;
        this.authReadyPromise = new Promise(resolve => {
            this.resolveAuthReady = resolve;
        });
        this.privilegesReadyPromise = Promise.resolve();
        this.resolvePrivilegesReady = null;

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

    markAuthInitialized() {
        if (this.authState.initialized) return;
        this.authState.initialized = true;
        if (typeof this.resolveAuthReady === 'function') {
            this.resolveAuthReady();
        }
    }

    waitForAuthReady() {
        return this.authState.initialized ? Promise.resolve() : this.authReadyPromise;
    }

    resetPrivilegesReady() {
        this.privilegesReadyPromise = new Promise(resolve => {
            this.resolvePrivilegesReady = resolve;
        });
    }

    markPrivilegesReady() {
        if (typeof this.resolvePrivilegesReady === 'function') {
            this.resolvePrivilegesReady();
            this.resolvePrivilegesReady = null;
        }
    }

    waitForPrivilegesReady() {
        return this.authState.privilegesLoaded ? Promise.resolve() : this.privilegesReadyPromise;
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

    normalizeRouteTarget(value) {
        return String(value || '')
            .replace(/^#/, '')
            .replace(/^\/+/, '')
            .trim();
    }

    buildRedirectTarget(requestedTarget, page) {
        if ((page === 'relationship-entity' || page === 'relationship-graph') && window.location.search) {
            return `${window.location.search}#${requestedTarget}`;
        }

        return requestedTarget;
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
            if (targetPage === 'login' && !this.authState.isAuthenticated) {
                this.rememberPostLoginRedirectFromCurrentRoute();
            }
            this.navigate(targetPage, 'push');
        });

        window.addEventListener('popstate', (event) => {
            const target = event.state?.target
                || event.state?.page
                || (this.normalizeRouteTarget(window.location.hash) || 'home');
            this.navigate(target, 'none');
        });

        // Hash-only navigation for direct deep links.
        // Without this, the SPA won't react until a full refresh because `hashchange` does not fire `popstate`.
        window.addEventListener('hashchange', () => {
            const target = this.normalizeRouteTarget(window.location.hash) || 'home';
            const page = this.normalizeRouteId(target) || 'home';
            // Ensure back/forward has consistent state even for hash-only navigation.
            history.replaceState({ page, target }, '', `#${target}`);
            this.navigate(target, 'none');
        });

        this.bindAuthControls();

        await this.loadProtectedPagesConfig();
        await this.loadAuthConfig();
        await this.loadAuthRuntimeConfig();
        await this.initSupabaseAuth();
        await this.loadHomeConfig();

        this.updateAuthUI();
        this.applyNavVisibilityRules();

        const initialTarget = this.pendingPostAuthNavigationTarget
            || this.normalizeRouteTarget(window.location.hash)
            || 'home';
        this.pendingPostAuthNavigationTarget = null;
        this.navigate(initialTarget, this.authCallbackHandled ? 'replace' : 'none');
    }

    async navigate(page, historyMode = 'push') {
        const requestedTarget = this.normalizeRouteTarget(page) || 'home';
        const normalized = this.normalizeRouteId(requestedTarget);
        const requestedPage = normalized;

        page = normalized;
        if (!this.routes[page]) {
            page = 'home';
            if (historyMode === 'none') {
                historyMode = 'replace';
            }
        }

        const finalTarget = page === requestedPage ? requestedTarget : page;

        if (this.currentPage === page && this.currentRouteTarget === finalTarget) {
            this.closeMobileNav();
            return;
        }

        try {
            const guard = this.guardRoute(page);
            if (guard?.waitForAuth) {
                this.showAuthInitializing(page);
                await this.waitForAuthReady();
                return this.navigate(requestedTarget, historyMode);
            }
            if (guard?.waitForPrivileges) {
                this.showAuthInitializing(page);
                await this.waitForPrivilegesReady();
                return this.navigate(requestedTarget, historyMode);
            }
            if (guard?.redirectTo && guard.redirectTo !== page) {
                if (guard.storeRedirectFrom) {
                    sessionStorage.setItem('post_login_redirect', this.buildRedirectTarget(requestedTarget, page));
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
                history.pushState({ page, target: finalTarget }, '', `#${finalTarget}`);
            } else if (historyMode === 'replace') {
                history.replaceState({ page, target: finalTarget }, '', `#${finalTarget}`);
            }

            this.setPageChrome(page);
            this.setActiveLink(page);
            await this.loadContent(page);
            this.currentPage = page;
            this.currentRouteTarget = finalTarget;
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

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getHomeRoadmapData() {
        const base = window.HomeRoadmapData || null;
        if (!base) return null;
        if (!this.homeConfig) return base;
        // Shallow-merge top-level sections from homeConfig over the JS defaults.
        return Object.assign({}, base, this.homeConfig);
    }

    renderExternalLinkAttributes(external) {
        return external ? ' target="_blank" rel="noopener"' : '';
    }

    renderRoadmapChipRow(items, options = {}) {
        const itemList = Array.isArray(items) ? items : [];
        const buttonMode = Boolean(options.buttonMode);
        const activeKey = options.activeKey || '';

        return itemList.map((item) => {
            const value = typeof item === 'string' ? item : item?.label || item?.value || '';
            const buttonKey = typeof item === 'string' ? options.buttonKey : item?.buttonKey || item?.id || '';

            if (!buttonMode) {
                return `<span class="roadmap-chip">${this.escapeHtml(value)}</span>`;
            }

            const isActive = buttonKey === activeKey;
            return `<button class="roadmap-chip roadmap-chip-button${isActive ? ' is-active' : ''}" type="button" data-skill-key="${this.escapeHtml(buttonKey)}">${this.escapeHtml(value)}</button>`;
        }).join('');
    }

    renderHomeRoadmap(root) {
        const data = this.getHomeRoadmapData();
        const shell = root?.querySelector?.('[data-roadmap-shell]');
        if (!data || !shell) return;

        shell.innerHTML = [
            this.renderRoadmapRoleSection(data),
            this.renderRoadmapValueAvailabilitySection(data),
            this.renderRoadmapTimelineSection(data),
            this.renderRoadmapKnowledgeSection(data),
            this.renderRoadmapSkillsSection(data),
            this.renderRoadmapCtaSection(data)
        ].join('');
    }

    renderRoadmapRoleSection(data) {
        const defaultRole = data.defaultRole || 'recruiter';
        const activeRole = data.roleLenses.find((item) => item.id === defaultRole) || data.roleLenses[0];
        const roleButtons = data.roleLenses.map((lens) => {
            const isActive = lens.id === activeRole.id;
            return `<button class="roadmap-pill${isActive ? ' is-active' : ''}" type="button" role="tab" aria-selected="${isActive}" data-role-lens="${this.escapeHtml(lens.id)}">${this.escapeHtml(lens.label)}</button>`;
        }).join('');

        const roleActions = (data.roleActions || []).map((action) => (
            `<a class="btn btn-sm btn-outline-primary" href="${this.escapeHtml(action.href)}"${this.renderExternalLinkAttributes(action.external)}>${this.escapeHtml(action.label)}</a>`
        )).join('');

        const metrics = (data.impactMetrics || []).map((metric) => {
            const toneClass = metric.tone && metric.tone !== 'blue' ? ` tone-${this.escapeHtml(metric.tone)}` : '';
            const roleFocus = Array.isArray(metric.roleFocus) ? metric.roleFocus.join(' ') : '';
            return `<button class="roadmap-metric-card${metric.active ? ' is-active' : ''}" type="button" data-metric-target="${this.escapeHtml(metric.metricTarget)}" data-role-focus="${this.escapeHtml(roleFocus)}">
                <span class="roadmap-metric-icon${toneClass}"><i class="${this.escapeHtml(metric.icon)}"></i></span>
                <span class="roadmap-metric-value" data-count-to="${this.escapeHtml(metric.countTo)}" data-count-suffix="${this.escapeHtml(metric.countSuffix)}">${this.escapeHtml(metric.value)}</span>
                <span class="roadmap-metric-label">${this.escapeHtml(metric.label)}</span>
                <span class="roadmap-metric-detail">${this.escapeHtml(metric.detail)}</span>
            </button>`;
        }).join('');

        return `<section class="card shadow-sm roadmap-role-card" aria-labelledby="role-lens-title">
            <div class="card-body p-4 p-xl-4">
                <div class="roadmap-role-topbar">
                    <div>
                        <p class="roadmap-eyebrow mb-1">Role Lens</p>
                        <h2 id="role-lens-title" class="h4 mb-0">Choose the viewpoint that matters first.</h2>
                    </div>
                    <button class="btn btn-link roadmap-inline-link" type="button" data-metric-help aria-label="Learn why these metrics matter">
                        <i class="fa-solid fa-circle-info me-2"></i>Why these metrics?
                    </button>
                </div>
                <div class="roadmap-role-tabs" role="tablist" aria-label="Role lens switcher">${roleButtons}</div>
                <div class="roadmap-role-summary">
                    <div>
                        <p class="roadmap-eyebrow mb-1">Active Perspective</p>
                        <h3 class="h5 mb-2" data-role-headline>${this.escapeHtml(activeRole.headline)}</h3>
                        <p class="mb-0 text-body-secondary" data-role-description>${this.escapeHtml(activeRole.description)}</p>
                    </div>
                    <div class="roadmap-role-actions" data-role-focus="recruiter qa-lead engineering-manager cto">${roleActions}</div>
                </div>
                <div class="roadmap-metrics-grid" aria-label="Impact metrics">${metrics}</div>
            </div>
        </section>`;
    }

    renderRoadmapValueAvailabilitySection(data) {
        const valueCards = (data.valueEngine?.cards || []).map((card) => {
            const chips = this.renderRoadmapChipRow(card.chips || []);
            const roleFocus = Array.isArray(card.roleFocus) ? card.roleFocus.join(' ') : '';
            return `<article class="value-card tone-${this.escapeHtml(card.tone || 'blue')}" data-role-focus="${this.escapeHtml(roleFocus)}" data-skill-group="${this.escapeHtml(card.skillGroup || '')}">
                <div class="value-card-icon"><i class="${this.escapeHtml(card.icon)}"></i></div>
                <div class="value-card-copy">
                    <h3 class="h5 mb-2">${this.escapeHtml(card.title)}</h3>
                    <p class="text-body-secondary mb-3">${this.escapeHtml(card.summary)}</p>
                    <div class="roadmap-chip-row">${chips}</div>
                </div>
                <p class="value-card-detail mb-0">${this.escapeHtml(card.detail)}</p>
            </article>`;
        }).join('');

        const defaultView = data.defaultAvailabilityView || 'recruiter';
        const availabilityButtons = (data.availability?.views || []).map((view) => {
            const isActive = view.id === defaultView;
            return `<button class="roadmap-pill${isActive ? ' is-active' : ''}" type="button" aria-pressed="${isActive}" data-availability-view="${this.escapeHtml(view.id)}">${this.escapeHtml(view.label)}</button>`;
        }).join('');
        const availabilityPanels = (data.availability?.views || []).map((view) => {
            const isActive = view.id === defaultView;
            const rows = (view.rows || []).map((row) => `<li><span>${this.escapeHtml(row.label)}</span><strong>${this.escapeHtml(row.value)}</strong></li>`).join('');
            return `<div class="availability-panel${isActive ? ' is-active' : ''}" data-availability-panel="${this.escapeHtml(view.id)}"${isActive ? '' : ' hidden'}>
                <ul class="availability-list">${rows}</ul>
                <p class="text-body-secondary mb-0">${this.escapeHtml(view.description)}</p>
            </div>`;
        }).join('');
        const availabilityCtas = (data.availability?.ctas || []).map((cta) => (
            `<a class="btn ${this.escapeHtml(cta.variant)} flex-fill" href="${this.escapeHtml(cta.href)}"${this.renderExternalLinkAttributes(cta.external)}><i class="${this.escapeHtml(cta.icon)} me-2"></i>${this.escapeHtml(cta.label)}</a>`
        )).join('');

        return `<section class="roadmap-duo-grid">
            <section class="card shadow-sm roadmap-panel" aria-labelledby="value-engine-title">
                <div class="card-body p-4">
                    <div class="roadmap-panel-header">
                        <div>
                            <p class="roadmap-eyebrow mb-1">Value Engine</p>
                            <h2 id="value-engine-title" class="h4 mb-1">${this.escapeHtml(data.valueEngine?.title || '')}</h2>
                        </div>
                        <span class="roadmap-panel-link">${this.escapeHtml(data.valueEngine?.linkLabel || '')}</span>
                    </div>
                    <div class="value-engine-grid">${valueCards}<div class="value-engine-node" aria-hidden="true"></div></div>
                </div>
            </section>
            <section class="card shadow-sm roadmap-panel" aria-labelledby="availability-title">
                <div class="card-body p-4 h-100 d-flex flex-column">
                    <div class="roadmap-panel-header align-items-start">
                        <div>
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <p class="roadmap-eyebrow mb-0">Work Mode &amp; Availability</p>
                                <span class="roadmap-live-pill"><span class="roadmap-live-dot"></span>Live</span>
                            </div>
                            <h2 id="availability-title" class="h4 mb-1">${this.escapeHtml(data.availability?.title || '')}</h2>
                        </div>
                    </div>
                    <div class="availability-views" role="group" aria-label="Availability perspective switcher">${availabilityButtons}</div>
                    <div class="availability-map" aria-hidden="true">
                        <span class="availability-map-pulse pulse-a"></span>
                        <span class="availability-map-pulse pulse-b"></span>
                        <span class="availability-map-grid"></span>
                    </div>
                    <div class="availability-content mt-3">${availabilityPanels}</div>
                    <div class="d-flex flex-column flex-sm-row gap-2 mt-auto pt-4">${availabilityCtas}</div>
                </div>
            </section>
        </section>`;
    }

    renderRoadmapTimelineSection(data) {
        const filters = (data.timeline?.filters || []).map((filter) => (
            `<button class="roadmap-pill${filter.active ? ' is-active' : ''}" type="button" aria-pressed="${Boolean(filter.active)}" data-timeline-filter="${this.escapeHtml(filter.id)}">${this.escapeHtml(filter.label)}</button>`
        )).join('');

        const missions = (data.timeline?.missions || []).map((mission) => {
            const tags = this.renderRoadmapChipRow(mission.tags || []);
            const bullets = (mission.bullets || []).map((bullet) => `<li>${this.escapeHtml(bullet)}</li>`).join('');
            const detailRows = Object.entries(mission.details || {}).map(([label, value]) => `<div><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value)}</strong></div>`).join('');
            const filtersAttr = Array.isArray(mission.filters) ? mission.filters.join(' ') : '';
            const roleFocus = Array.isArray(mission.roleFocus) ? mission.roleFocus.join(' ') : '';
            return `<article class="roadmap-mission${mission.expanded ? ' is-expanded' : ''}" id="${this.escapeHtml(mission.id)}" role="listitem" data-filters="${this.escapeHtml(filtersAttr)}" data-role-focus="${this.escapeHtml(roleFocus)}">
                <div class="roadmap-mission-date"><span>${this.escapeHtml(mission.start)}</span><span>${this.escapeHtml(mission.end)}</span></div>
                <div class="roadmap-mission-node tone-${this.escapeHtml(mission.tone || 'blue')}"></div>
                <div class="roadmap-mission-card">
                    <div class="roadmap-mission-header">
                        <div>
                            <h3 class="h5 mb-1">${this.escapeHtml(mission.title)}</h3>
                            <p class="text-body-secondary mb-2">${this.escapeHtml(mission.location)}</p>
                            <p class="mb-0">${this.escapeHtml(mission.summary)}</p>
                        </div>
                        <button class="roadmap-mission-toggle" type="button" aria-expanded="${Boolean(mission.expanded)}" aria-controls="${this.escapeHtml(mission.id)}-details">
                            <span class="visually-hidden">Toggle mission details</span>
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                    </div>
                    <div class="roadmap-chip-row roadmap-chip-row--mission mt-3">${tags}</div>
                    <div class="roadmap-mission-details" id="${this.escapeHtml(mission.id)}-details"${mission.expanded ? '' : ' hidden'}>
                        <ul class="list-check mt-3 mb-3">${bullets}</ul>
                        <div class="roadmap-detail-grid">${detailRows}</div>
                    </div>
                </div>
            </article>`;
        }).join('');

        return `<section class="card shadow-sm roadmap-panel roadmap-timeline-panel" aria-labelledby="mission-timeline-title">
            <div class="card-body p-4">
                <div class="roadmap-panel-header align-items-start">
                    <div>
                        <p class="roadmap-eyebrow mb-1">Mission Timeline</p>
                        <h2 id="mission-timeline-title" class="h4 mb-1">${this.escapeHtml(data.timeline?.title || '')}</h2>
                        <p class="text-body-secondary mb-0">${this.escapeHtml(data.timeline?.description || '')}</p>
                    </div>
                </div>
                <div class="timeline-filter-row" role="group" aria-label="Mission timeline filters">${filters}</div>
                <div class="roadmap-timeline" role="list">${missions}</div>
            </div>
        </section>`;
    }

    renderRoadmapKnowledgeSection(data) {
        const layers = (data.knowledge?.layers || []).map((layer) => (
            `<article class="knowledge-layer tone-${this.escapeHtml(layer.tone || 'blue')}"><div><p class="roadmap-layer-label">${this.escapeHtml(layer.label)}</p><div class="roadmap-chip-row">${this.renderRoadmapChipRow(layer.chips || [])}</div></div></article>`
        )).join('');
        const education = (data.knowledge?.education || []).map((item) => (
            `<article class="knowledge-education-card"><h3 class="h6 mb-1">${this.escapeHtml(item.title)}</h3><p class="text-body-secondary mb-1">${this.escapeHtml(item.subtitle)}</p><p class="mb-0 text-body-secondary">${this.escapeHtml(item.description)}</p></article>`
        )).join('');
        const recognition = data.recognition || {};

        return `<section class="roadmap-duo-grid roadmap-bottom-grid">
            <section class="card shadow-sm roadmap-panel" aria-labelledby="knowledge-stack-title">
                <div class="card-body p-4">
                    <div class="roadmap-panel-header align-items-start">
                        <div>
                            <p class="roadmap-eyebrow mb-1">Knowledge Stack</p>
                            <h2 id="knowledge-stack-title" class="h4 mb-1">Layered growth from foundations to emerging edge.</h2>
                        </div>
                    </div>
                    <div class="knowledge-stack">${layers}</div>
                    <div class="knowledge-education-grid mt-4">${education}</div>
                </div>
            </section>
            <section class="card shadow-sm roadmap-panel recognition-panel" aria-labelledby="recognition-title">
                <div class="card-body p-4 d-flex flex-column h-100">
                    <div class="roadmap-panel-header align-items-start">
                        <div>
                            <p class="roadmap-eyebrow mb-1">Recognition Signal</p>
                            <h2 id="recognition-title" class="h4 mb-1">Proof that the work scales through teams, not just tools.</h2>
                        </div>
                    </div>
                    <div class="recognition-card mt-3 mt-xl-4">
                        <div class="recognition-copy">
                            <p class="roadmap-layer-label text-warning-emphasis mb-2">${this.escapeHtml(recognition.overline || '')}</p>
                            <h3 class="h4 mb-1">${this.escapeHtml(recognition.title || '')}</h3>
                            <p class="text-body-secondary mb-3">${this.escapeHtml(recognition.description || '')}</p>
                            <p class="mb-0"><strong>Why it matters:</strong> ${this.escapeHtml(recognition.whyItMatters || '')}</p>
                        </div>
                        <div class="recognition-badge" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
                    </div>
                </div>
            </section>
        </section>`;
    }

    renderRoadmapSkillsSection(data) {
        const defaultSkill = data.defaultSkill || 'automation';
        const clusters = (data.skills?.clusters || []).map((cluster) => {
            return `<div class="skill-cluster cluster-${this.escapeHtml(cluster.id)}">
                <p class="roadmap-layer-label">${this.escapeHtml(cluster.label)}</p>
                <div class="roadmap-chip-row">${this.renderRoadmapChipRow((cluster.items || []).map((item) => ({ label: item, buttonKey: cluster.id })), { buttonMode: true, activeKey: cluster.active ? cluster.id : defaultSkill })}</div>
            </div>`;
        }).join('');
        const activeReadout = data.skills?.readouts?.[defaultSkill] || { title: '', description: '' };

        let toolsHtml;
        const toolCategories = data.skills?.toolCategories;
        if (Array.isArray(toolCategories) && toolCategories.length > 0) {
            toolsHtml = toolCategories.map((cat, idx) => {
                const chips = this.renderRoadmapChipRow(cat.items || []);
                const mb = idx < toolCategories.length - 1 ? ' mb-3' : '';
                return `<p class="roadmap-eyebrow mb-2">${this.escapeHtml(cat.label)}</p><div class="roadmap-chip-row roadmap-chip-row--tools${mb}">${chips}</div>`;
            }).join('');
        } else {
            toolsHtml = `<div class="roadmap-chip-row roadmap-chip-row--tools">${this.renderRoadmapChipRow(data.skills?.tools || [])}</div>`;
        }

        return `<section class="roadmap-duo-grid roadmap-tools-grid">
            <section class="card shadow-sm roadmap-panel" aria-labelledby="skill-constellation-title">
                <div class="card-body p-4">
                    <div class="roadmap-panel-header align-items-start">
                        <div>
                            <p class="roadmap-eyebrow mb-1">Skill Constellation</p>
                            <h2 id="skill-constellation-title" class="h4 mb-1">Connected expertise across the quality universe.</h2>
                        </div>
                    </div>
                    <div class="skill-constellation-shell">
                        ${clusters}
                        <div class="constellation-map" aria-hidden="true">
                            <span class="constellation-center">DD</span>
                            <span class="constellation-ring ring-outer"></span>
                            <span class="constellation-ring ring-inner"></span>
                            <span class="constellation-node node-a"></span>
                            <span class="constellation-node node-b"></span>
                            <span class="constellation-node node-c"></span>
                            <span class="constellation-node node-d"></span>
                            <span class="constellation-path path-a"></span>
                            <span class="constellation-path path-b"></span>
                        </div>
                    </div>
                    <div class="skill-readout mt-3" aria-live="polite">
                        <p class="roadmap-eyebrow mb-1">Active Cluster</p>
                        <h3 class="h5 mb-1" data-skill-readout-title>${this.escapeHtml(activeReadout.title)}</h3>
                        <p class="text-body-secondary mb-0" data-skill-readout-description>${this.escapeHtml(activeReadout.description)}</p>
                    </div>
                </div>
            </section>
            <section class="card shadow-sm roadmap-panel" aria-labelledby="tools-panel-title">
                <div class="card-body p-4">
                    <div class="roadmap-panel-header align-items-start">
                        <div>
                            <p class="roadmap-eyebrow mb-1">Tools &amp; Technologies</p>
                            <h2 id="tools-panel-title" class="h4 mb-1">The stack behind the roadmap.</h2>
                        </div>
                    </div>
                    ${toolsHtml}
                    <p class="text-body-secondary mt-3 mb-0">${this.escapeHtml(data.skills?.toolsNote || '')}</p>
                </div>
            </section>
        </section>`;
    }

    renderRoadmapCtaSection(data) {
        const buttons = (data.cta?.buttons || []).map((button) => (
            `<a class="btn btn-lg ${this.escapeHtml(button.variant)}" href="${this.escapeHtml(button.href)}"${this.renderExternalLinkAttributes(button.external)}><i class="${this.escapeHtml(button.icon)} me-2"></i>${this.escapeHtml(button.label)}</a>`
        )).join('');

        return `<section class="cta-section">
            <div class="card border-0 shadow-lg glass-card cta-space rounded-4 overflow-hidden">
                <div class="card-body p-5 position-relative">
                    <div class="cta-accent"></div>
                    <div class="row align-items-center g-4">
                        <div class="col-lg-7">
                            <h2 class="display-6 fw-bold">${this.escapeHtml(data.cta?.title || '')}</h2>
                            <p class="lead text-body-secondary mb-0">${this.escapeHtml(data.cta?.subtitle || '')}</p>
                        </div>
                        <div class="col-lg-5 d-flex flex-column gap-3">${buttons}</div>
                    </div>
                </div>
            </div>
        </section>`;
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
        this.cleanupPageScripts();

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

    showAuthInitializing(page) {
        this.setPageChrome(page);
        this.setActiveLink(page);
        this.contentArea.innerHTML = `
            <section class="py-4">
              <div class="card shadow-sm">
                <div class="card-body p-4">
                  <h1 class="h4 mb-2">Restoring your session</h1>
                  <p class="text-body-secondary mb-3">Checking your signed-in state before loading this page...</p>
                  <div class="d-flex align-items-center gap-2" role="status" aria-live="polite">
                    <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
                    <span>Working...</span>
                  </div>
                </div>
              </div>
            </section>
        `;
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
        if (!this.authConfig) {
            this.setAuthSession(null);
            this.markAuthInitialized();
            return;
        }

        if (!this.isAuthConfigured()) {
            console.warn('[auth] Supabase config placeholders detected. Auth UI will show a configuration warning.');
            this.setAuthSession(null);
            this.markAuthInitialized();
            return;
        }

        const createClient = window.supabase?.createClient;
        if (typeof createClient !== 'function') {
            console.warn('[auth] Supabase library not available on window.supabase. Auth disabled.');
            this.setAuthSession(null);
            this.markAuthInitialized();
            return;
        }

        try {
            this.supabase = createClient(this.authConfig.supabase.url, this.authConfig.supabase.anonKey, {
                auth: {
                    flowType: 'pkce',
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false
                }
            });

            this.supabase.auth.onAuthStateChange((event, session) => {
                this.handleAuthStateChange(event, session).catch(error => {
                    console.warn('[auth] auth state change handling failed', error);
                });
            });

            await this.handleAuthRedirectCallback();

            const { data, error } = await this.supabase.auth.getSession();
            if (error) {
                console.warn('[auth] unable to restore existing session', error);
                this.setAuthSession(null);
            } else {
                this.setAuthSession(data?.session || null);
            }

            if (this.authState.isAuthenticated) {
                this.refreshProfileAccess();
                if (this.authCallbackHandled && !this.pendingPostAuthNavigationTarget) {
                    this.pendingPostAuthNavigationTarget = this.consumePostLoginRedirectTarget() || 'home';
                }
            }

            this.markAuthInitialized();
            this.updateProtectedAccessReason();
            this.updateAuthUI();
            this.applyNavVisibilityRules();
        } catch (error) {
            console.warn('[auth] Supabase initialization failed. Auth disabled.', error);
            this.setAuthSession(null);
            this.markAuthInitialized();
        }
    }

    async handleAuthRedirectCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error') || params.get('error_code');
        const errorDescription = params.get('error_description') || params.get('error');
        const type = String(params.get('type') || '').toLowerCase();

        if (!code && !error) return;

        this.authCallbackHandled = true;

        try {
            if (error) {
                throw new Error(errorDescription || 'The authentication provider rejected the sign-in request.');
            }

            const result = await this.supabase.auth.exchangeCodeForSession(code);
            if (result.error) throw result.error;

            this.setAuthSession(result.data?.session || null);
            sessionStorage.removeItem('auth_denied_reason');
            sessionStorage.removeItem('post_auth_force_profile');

            if (type === 'recovery') {
                sessionStorage.setItem('password_recovery', '1');
                this.pendingPostAuthNavigationTarget = 'login';
            } else {
                this.pendingPostAuthNavigationTarget = this.consumePostLoginRedirectTarget() || 'home';
            }
        } catch (callbackError) {
            console.warn('[auth] failed to complete auth callback', callbackError);
            this.setAuthSession(null);
            sessionStorage.setItem('auth_denied_reason', 'Unable to complete sign-in. Please try again.');
            this.pendingPostAuthNavigationTarget = 'login';
        } finally {
            this.removeAuthCallbackParamsFromUrl();
        }
    }

    removeAuthCallbackParamsFromUrl() {
        const url = new URL(window.location.href);
        ['code', 'error', 'error_code', 'error_description', 'type'].forEach(key => {
            url.searchParams.delete(key);
        });

        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        history.replaceState(history.state || {}, '', nextUrl || window.location.pathname);
    }

    consumePostLoginRedirectTarget() {
        const requested = sessionStorage.getItem('post_login_redirect');
        sessionStorage.removeItem('post_login_redirect');
        sessionStorage.removeItem('auth_denied_reason');

        if (!requested) return null;
        if (requested.startsWith('?')) return requested;

        const requestedRoute = this.normalizeRouteId(requested);
        return this.routes[requestedRoute] ? requested : 'home';
    }

    rememberPostLoginRedirectFromCurrentRoute() {
        const currentTarget = this.currentRouteTarget || this.normalizeRouteTarget(window.location.hash);
        const currentPage = this.currentPage || this.normalizeRouteId(currentTarget);

        if (!currentTarget || !currentPage || currentPage === 'login') return;
        if (!this.routes[currentPage]) return;

        sessionStorage.setItem('post_login_redirect', this.buildRedirectTarget(currentTarget, currentPage));
        sessionStorage.removeItem('auth_denied_reason');
    }

    async handleAuthStateChange(event, session) {
        this.setAuthSession(session || null);

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && this.authState.isAuthenticated) {
            this.refreshProfileAccess();
        }

        this.updateProtectedAccessReason();
        this.updateAuthUI();
        this.applyNavVisibilityRules();
        this.updatePrivilegedFeatureAccess();

        // If the user is currently on the login page, refresh its UI (hide SSO, update dot, etc.).
        if (this.currentPage === 'login') {
            this.setupLoginPage();
        }

        if (this.currentPage === 'profile') {
            this.setupProfilePage();
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

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && this.authState.initialized) {
            this.maybeRedirectAfterLogin();
        }

        if (event === 'SIGNED_OUT') {
            sessionStorage.removeItem('post_login_redirect');
            sessionStorage.removeItem('auth_denied_reason');
            sessionStorage.removeItem('post_auth_force_profile');

            // On sign out, always return to the login route (and avoid leaving the UI on a protected screen).
            if ((this.currentPage || '') !== 'login') {
                this.navigate('login', 'replace');
            }
        }
    }

    refreshProfileAccess() {
        if (!this.authState.isAuthenticated) return;

        this.ensureProfileRow().catch(error => {
            console.warn('[profile] ensureProfileRow failed', error);
            this.authState.privilegesLoaded = true;
            this.markPrivilegesReady();
            this.updateProtectedAccessReason();
            this.updateAuthUI();
            this.applyNavVisibilityRules();
            this.updatePrivilegedFeatureAccess();
        });
    }

    setAuthSession(session) {
        const email = session?.user?.email || null;
        const meta = session?.user?.user_metadata || {};
        const avatarUrl = meta.avatar_url || meta.picture || meta.avatarUrl || null;
        const fullName = meta.full_name || meta.fullName || meta.name || null;
        const provider = session?.user?.app_metadata?.provider || meta.provider || null;
        const userId = session?.user?.id || null;
        const isAuthenticated = Boolean(session?.user);
        const sameIdentity = Boolean(isAuthenticated && userId && this.authState.userId === userId);
        const previousAccess = {
            hasPrivileges: this.authState.hasPrivileges,
            isAdmin: this.authState.isAdmin,
            privilegesLoaded: this.authState.privilegesLoaded,
            avatarOverrideUrl: this.authState.avatarOverrideUrl
        };

        this.authState.isAuthenticated = isAuthenticated;
        this.authState.email = email;
        this.authState.fullName = fullName;
        this.authState.provider = provider;
        this.authState.userId = userId;
        this.authState.avatarUrl = avatarUrl;
        if (!isAuthenticated) {
            this.authState.hasPrivileges = false;
            this.authState.isAdmin = false;
            this.authState.privilegesLoaded = true;
            this.authState.avatarOverrideUrl = null;
            this.markPrivilegesReady();
        } else if (sameIdentity && previousAccess.privilegesLoaded) {
            this.authState.hasPrivileges = previousAccess.hasPrivileges;
            this.authState.isAdmin = previousAccess.isAdmin;
            this.authState.privilegesLoaded = true;
            this.authState.avatarOverrideUrl = previousAccess.avatarOverrideUrl;
            this.markPrivilegesReady();
        } else {
            this.authState.hasPrivileges = false;
            this.authState.isAdmin = false;
            this.authState.privilegesLoaded = false;
            this.authState.avatarOverrideUrl = null;
            this.resetPrivilegesReady();
        }

        this.updateProtectedAccessReason();
    }

    isAuthedForProtectedPages() {
        return this.authState.isAuthenticated && this.authState.privilegesLoaded && this.authState.hasPrivileges;
    }

    async getCurrentAccessToken() {
        if (!this.supabase || !this.authState.isAuthenticated) return null;
        const { data, error } = await this.supabase.auth.getSession();
        if (error) {
            console.warn('[auth] unable to read current access token', error);
            return null;
        }
        const session = data?.session;
        const expiresAtMs = Number(session?.expires_at || 0) * 1000;
        const shouldRefresh = Boolean(session?.refresh_token && expiresAtMs && expiresAtMs - Date.now() < 60000);
        if (shouldRefresh) {
            const refreshed = await this.supabase.auth.refreshSession(session);
            if (refreshed.error) {
                console.warn('[auth] unable to refresh access token', refreshed.error);
                return session?.access_token || null;
            }
            return refreshed.data?.session?.access_token || session?.access_token || null;
        }
        return session?.access_token || null;
    }

    getPrivilegedFeatureAccess(options = {}) {
        const isAuthenticated = this.authState.isAuthenticated;
        const canUseFeature = this.isAuthedForProtectedPages();
        let lockedMessage = options.loginMessage || 'Log In to Unlock this Feature';
        let lockedDetail = options.loginDetail || 'This AI feature requires an approved account.';

        if (isAuthenticated && !this.authState.privilegesLoaded) {
            lockedMessage = options.loadingMessage || 'Feature access is loading';
            lockedDetail = 'Your account is signed in while access permissions are being resolved.';
        } else if (isAuthenticated && !this.authState.hasPrivileges) {
            lockedMessage = options.deniedMessage || 'Feature access is not enabled';
            lockedDetail = options.deniedDetail || 'Your account is signed in, but it is not approved for this AI feature yet.';
        }

        return {
            canUseFeature,
            canUseAssistant: canUseFeature,
            isAuthenticated,
            lockedMessage,
            lockedDetail,
            getAccessToken: () => this.getCurrentAccessToken()
        };
    }

    getRelationshipGraphAssistantAccess() {
        return this.getPrivilegedFeatureAccess({
            loginDetail: 'The graph remains available, but the AI assistant requires an approved account.',
            loadingMessage: 'Assistant access is loading',
            deniedMessage: 'Assistant access is not enabled'
        });
    }

    getUserStoryAnalyzerAccess() {
        return this.getPrivilegedFeatureAccess({
            loginDetail: 'The analyzer remains visible, but AI analysis requires an approved account.',
            loadingMessage: 'Analyzer access is loading',
            deniedMessage: 'Analyzer access is not enabled'
        });
    }

    updateRelationshipGraphAssistantAccess() {
        if (this.currentPage !== 'relationship-graph') return;
        window.RelationshipGraphFeature?.setAssistantAccess?.(this.getRelationshipGraphAssistantAccess());
    }

    updateUserStoryAnalyzerAccess() {
        if (this.currentPage !== 'user-story-analyzer') return;
        this.applyUserStoryAnalyzerAccess(this.getUserStoryAnalyzerAccess());
    }

    updatePrivilegedFeatureAccess() {
        this.updateRelationshipGraphAssistantAccess();
        this.updateUserStoryAnalyzerAccess();
    }

    routeRequiresPrivileges(entry, page) {
        if (page === 'profile') return false;
        return entry?.requirePrivileges !== false;
    }

    guardRoute(page) {
        const entry = this.protectedPagesIndex.get(page);
        if (!entry || !entry.requireAuth) return null;

        if (page === (this.protectedPagesConfig.defaults?.redirectRoute || 'login')) return null;

        if (!this.authState.initialized) {
            return { waitForAuth: true };
        }

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

        if (!this.routeRequiresPrivileges(entry, page)) {
            return null;
        }

        if (!this.authState.privilegesLoaded) {
            return { waitForPrivileges: true };
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
        if (!this.authState.isAuthenticated) return;

        const forceProfile = sessionStorage.getItem('post_auth_force_profile');
        if (forceProfile === '1') {
            sessionStorage.removeItem('post_auth_force_profile');
            sessionStorage.removeItem('post_login_redirect');
            sessionStorage.removeItem('auth_denied_reason');
            if (this.currentPage !== 'profile') {
                this.navigate('profile', 'replace');
            }
            return;
        }

        const requested = this.consumePostLoginRedirectTarget();
        if (requested) {
            if (requested.startsWith('?')) {
                window.location.replace(requested);
                return;
            }

            if (this.currentRouteTarget !== requested) {
                this.navigate(requested, 'replace');
            }
            return;
        }

        // Fallback for users who arrive at the login route already authenticated
        // without an explicit protected-page redirect waiting.
        if (this.currentPage === 'login' && this.authState.isAuthenticated) {
            sessionStorage.removeItem('auth_denied_reason');
            this.navigate('home', 'replace');
        }
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

        const existing = await this.supabase
            .from('profiles')
            .select('full_name')
            .eq('email', email)
            .maybeSingle();

        if (existing.error) throw existing.error;

        // Email is used as the primary key per repo preference. Also store user_id for stable linkage + RLS checks.
        const payload = {
            email,
            user_id: user.id,
            full_name: existing.data?.full_name || fullName,
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
        this.authState.fullName = payload.full_name || fullName || this.authState.fullName;
        this.authState.hasPrivileges = Boolean(row?.has_privileges);
        this.authState.isAdmin = Boolean(row?.is_admin);
        this.authState.privilegesLoaded = true;
        this.markPrivilegesReady();
        const overrideUrl = row?.avatar_storage_path ? this.getAvatarPublicUrl(row.avatar_storage_path) : null;
        this.authState.avatarOverrideUrl = overrideUrl;
        this.updateProtectedAccessReason();
        this.updateAuthUI();
        this.applyNavVisibilityRules();
        this.updatePrivilegedFeatureAccess();
    }

    getCurrentIdentity() {
        const email = this.authState.email || null;
        const provider = this.authState.provider || null;
        const avatarUrl = this.authState.avatarOverrideUrl || this.authState.avatarUrl || null;
        const fullName = this.authState.fullName || null;
        return { email, provider, avatarUrl, fullName };
    }

    async loadHomeConfig() {
        if (!this.supabase) return;
        try {
            const { data, error } = await this.supabase
                .from('home_config')
                .select('section, value');
            if (error) {
                console.warn('[home-config] Failed to load from Supabase, using defaults.', error);
                return;
            }
            if (!Array.isArray(data) || data.length === 0) return;
            const merged = {};
            data.forEach(row => {
                if (row.section && row.value !== undefined) {
                    merged[row.section] = row.value;
                }
            });
            this.homeConfig = merged;
        } catch (err) {
            console.warn('[home-config] Error loading home config, using defaults.', err);
        }
    }

    async saveHomeConfigSection(section, value) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }
        const { error } = await this.supabase.rpc('admin_save_home_config_section', {
            p_section: section,
            p_value: value
        });
        if (error) throw error;
        if (!this.homeConfig) this.homeConfig = {};
        this.homeConfig[section] = value;
    }

    async listAdminProfiles() {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_list_profiles');
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async updateAdminProfile(payload) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_update_profile', payload);
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Admin update returned no profile row.');
        }

        return data[0];
    }

    async listAdminAiPrompts() {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_list_ai_prompts');
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async upsertAdminAiPrompt(payload) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_upsert_ai_prompt', payload);
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Prompt save returned no prompt row.');
        }

        return data[0];
    }

    async deleteAdminAiPrompt(promptId) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { error } = await this.supabase.rpc('admin_delete_ai_prompt', {
            p_id: promptId
        });
        if (error) throw error;
    }

    async listAdminAiInteractionLogs(userId) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_list_ai_interaction_logs', {
            p_user_id: userId
        });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async resetAdminAiDailyInteractions(userId) {
        if (!this.supabase) {
            throw new Error('Supabase client is not available.');
        }

        const { data, error } = await this.supabase.rpc('admin_reset_ai_daily_interactions', {
            p_user_id: userId
        });
        if (error) throw error;
        return Array.isArray(data) && data.length ? data[0] : null;
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

        const authReady = this.authState.initialized;
        const showLoggedIn = authReady && this.authState.isAuthenticated;
        const showLoggedOut = authReady && !this.authState.isAuthenticated;
        const fallbackAvatar = 'assets/user-default.svg';

        if (loginLink) {
            loginLink.classList.toggle('d-none', !showLoggedOut);
            // Also set the `hidden` attribute to avoid any utility class ordering issues.
            loginLink.hidden = !showLoggedOut;
            loginLink.setAttribute('aria-hidden', String(!showLoggedOut));
            if (!showLoggedOut) {
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
            'relationship-graph': 'Operational Context Graph | Douglas D\'Avila',
            'relationship-entity': 'Operational Context Record | Douglas D\'Avila',
            'user-story-analyzer': 'User Story Quality Analyzer | Douglas D\'Avila',
            'login': 'Sign in | Douglas D\'Avila',
            'privacy': 'Privacy | Douglas D\'Avila',
            'profile': 'Profile | Douglas D\'Avila'
        };
        document.title = titles[page] || titles.home;
    }

    cleanupPageScripts() {
        if (window.RelationshipGraphFeature?.unmount) {
            window.RelationshipGraphFeature.unmount();
        }
        if (window.RelationshipEntityPageFeature?.unmount) {
            window.RelationshipEntityPageFeature.unmount();
        }
    }

    initializePageScripts(page) {
        if (page === 'home') {
            this.setupHomeRoadmap();
            this.setupHomeCarousel();
        }

        if (page === 'relationship-graph') {
            window.RelationshipGraphFeature?.mount?.(this.getRelationshipGraphAssistantAccess());
        }

        if (page === 'relationship-entity') {
            window.RelationshipEntityPageFeature?.mount?.();
        }

        if (page === 'user-story-analyzer') {
            this.setupUserStoryAnalyzer();
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

            // Defaults to link confirmation because many Supabase projects are configured for magic links.
            const emailVerificationMode =
                String(this.authConfig?.supabase?.emailVerificationMode || 'link').toLowerCase() === 'code'
                    ? 'code'
                    : 'link';

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
                        const { error } = await this.supabase.auth.signInWithPassword({ email, password });
                        if (error) throw error;
                        setStatus('Signed in. Redirecting...');
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
                        if (emailVerificationMode === 'code') {
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
                            return;
                        }

                        setStatus('Creating account...');
                        const redirectTo = `${window.location.origin}${window.location.pathname}#login`;
                        const { data, error } = await this.supabase.auth.signUp({
                            email,
                            password,
                            options: {
                                emailRedirectTo: redirectTo,
                                data: fullName ? { full_name: fullName } : undefined
                            }
                        });
                        if (error) throw error;

                        this.pendingEmailSignup = null;
                        if (data?.session?.user) {
                            // Email confirmation might be disabled in Supabase; user is signed in immediately.
                            sessionStorage.setItem('post_auth_force_profile', '1');
                            setStatus('Account created. Redirecting to profile...');
                        } else {
                            if (signinEmail) signinEmail.value = email;
                            if (signinPassword) signinPassword.value = '';
                            setMode('signin');
                            setStatus('Check your email and open the confirmation link. Then sign in with your password.');
                        }
                    } catch (error) {
                        console.error('[auth] email signup failed', error);
                        this.pendingEmailSignup = null;
                        setStatus(null);
                        setError('Unable to create your account right now. Please try again.');
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
        const profileSummaryNameEl = document.getElementById('profile-summary-name');
        const profileSummaryEmailEl = document.getElementById('profile-summary-email');
        const profileSummaryProviderEl = document.getElementById('profile-summary-provider');
        const profileSummaryAccessEl = document.getElementById('profile-summary-access');
        const profileSummaryAdminEl = document.getElementById('profile-summary-admin-status');
        const protectedBadgeEl = document.getElementById('profile-summary-protected');
        const adminBadgeEl = document.getElementById('profile-summary-admin');
        const currentContextEl = document.getElementById('profile-current-context');
        const overviewUserCountEl = document.getElementById('profile-overview-user-count');
        const overviewPromptCountEl = document.getElementById('profile-overview-prompt-count');
        const sectionButtons = Array.from(document.querySelectorAll('[data-profile-view]'));
        const workspacePanels = Array.from(document.querySelectorAll('[data-profile-panel]'));
        const adminOnlyEls = Array.from(document.querySelectorAll('.profile-admin-only'));
        const adminPanelEl = document.getElementById('profile-admin-panel');
        const adminDirectoryStatusEl = document.getElementById('profile-admin-directory-status');
        const adminCountEl = document.getElementById('profile-admin-count');
        const adminUsersBodyEl = document.getElementById('profile-admin-users-body');
        const adminEmptyEl = document.getElementById('profile-admin-empty');
        const adminPlaceholderEl = document.getElementById('profile-admin-placeholder');
        const adminFormEl = document.getElementById('profile-admin-form');
        const adminEditorCloseEl = document.getElementById('profile-admin-editor-close');
        const adminSaveStatusEl = document.getElementById('profile-admin-save-status');
        const adminCancelEl = document.getElementById('profile-admin-cancel');
        const adminIdEl = document.getElementById('profile-admin-user-id');
        const adminEmailFieldEl = document.getElementById('profile-admin-user-email');
        const adminFullNameEl = document.getElementById('profile-admin-user-full-name');
        const adminRoleEl = document.getElementById('profile-admin-user-role');
        const adminCompanyUrlEl = document.getElementById('profile-admin-user-company-url');
        const adminCountryEl = document.getElementById('profile-admin-user-phone-country');
        const adminDialEl = document.getElementById('profile-admin-user-phone-dial');
        const adminPhoneEl = document.getElementById('profile-admin-user-phone');
        const adminPrivilegesToggleEl = document.getElementById('profile-admin-user-has-privileges');
        const adminAiUsageSummaryEl = document.getElementById('profile-admin-ai-usage-summary');
        const adminAiCountEl = document.getElementById('profile-admin-ai-count');
        const adminAiRemainingEl = document.getElementById('profile-admin-ai-remaining');
        const adminAiResetEl = document.getElementById('profile-admin-ai-reset');
        const adminAiStatusEl = document.getElementById('profile-admin-ai-status');
        const adminAiLogsEl = document.getElementById('profile-admin-ai-logs');
        const adminAiEmptyEl = document.getElementById('profile-admin-ai-empty');
        const adminPromptsStatusEl = document.getElementById('profile-admin-prompts-status');
        const adminPromptsCountEl = document.getElementById('profile-admin-prompts-count');
        const adminPromptsBodyEl = document.getElementById('profile-admin-prompts-body');
        const adminPromptsEmptyEl = document.getElementById('profile-admin-prompts-empty');
        const adminPromptsFilterSearchEl = document.getElementById('profile-admin-prompts-filter-search');
        const adminPromptsFilterToolEl = document.getElementById('profile-admin-prompts-filter-tool');
        const adminPromptsFilterActiveEl = document.getElementById('profile-admin-prompts-filter-active');
        const adminPromptsSortEl = document.getElementById('profile-admin-prompts-sort');
        const adminPromptsSeedEl = document.getElementById('profile-admin-prompts-seed');
        const adminPromptFormEl = document.getElementById('profile-admin-prompt-form');
        const adminPromptIdEl = document.getElementById('profile-admin-prompt-id');
        const adminPromptToolEl = document.getElementById('profile-admin-prompt-tool');
        const adminPromptKeyEl = document.getElementById('profile-admin-prompt-key');
        const adminPromptDescriptionEl = document.getElementById('profile-admin-prompt-description');
        const adminPromptContentEl = document.getElementById('profile-admin-prompt-content');
        const adminPromptActiveEl = document.getElementById('profile-admin-prompt-active');
        const adminPromptSaveStatusEl = document.getElementById('profile-admin-prompt-save-status');
        const adminPromptNewEl = document.getElementById('profile-admin-prompt-new');
        const adminPromptDeleteEl = document.getElementById('profile-admin-prompt-delete');

        const countryEl = document.getElementById('profile-phone-country');
        const dialEl = document.getElementById('profile-phone-dial');
        const phoneEl = document.getElementById('profile-phone');
        const roleEl = document.getElementById('profile-role');
        const companyUrlEl = document.getElementById('profile-company-url');
        const formEl = document.getElementById('profile-form');

        const setElementValue = (element, value, fallback = '—') => {
            if (!element) return;
            const resolved = value == null || value === '' ? fallback : value;
            if ('value' in element) {
                element.value = resolved;
                return;
            }
            element.textContent = resolved;
        };

        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const setStatus = (message) => {
            if (!statusEl) return;
            statusEl.textContent = message || '';
        };

        const setAdminDirectoryStatus = (message) => {
            if (!adminDirectoryStatusEl) return;
            adminDirectoryStatusEl.textContent = message || '';
        };

        const setAdminSaveStatus = (message) => {
            if (!adminSaveStatusEl) return;
            adminSaveStatusEl.textContent = message || '';
        };

        const setAdminAiStatus = (message) => {
            if (!adminAiStatusEl) return;
            adminAiStatusEl.textContent = message || '';
        };

        const setAdminPromptsStatus = (message) => {
            if (!adminPromptsStatusEl) return;
            adminPromptsStatusEl.textContent = message || '';
        };

        const setAdminPromptSaveStatus = (message) => {
            if (!adminPromptSaveStatusEl) return;
            adminPromptSaveStatusEl.textContent = message || '';
        };

        const getContextLabel = (view) => {
            switch (view) {
                case 'profile':
                    return 'My profile';
                case 'users':
                    return 'Registered users';
                case 'prompts':
                    return 'AI prompts';
                default:
                    return 'Overview';
            }
        };

        const refreshAccessPresentation = () => {
            const protectedText = this.authState.hasPrivileges ? 'Enabled' : 'Disabled';
            const adminText = this.authState.isAdmin ? 'Enabled' : 'Disabled';

            setElementValue(privilegesEl, protectedText, 'Disabled');
            setElementValue(adminEl, this.authState.isAdmin ? 'Admin access enabled' : 'Admin access disabled', 'Admin access disabled');
            setElementValue(profileSummaryAccessEl, protectedText, 'Disabled');
            setElementValue(profileSummaryAdminEl, adminText, 'Disabled');

            if (protectedBadgeEl) {
                protectedBadgeEl.textContent = this.authState.hasPrivileges ? 'Protected content enabled' : 'Protected content disabled';
            }
            if (adminBadgeEl) {
                adminBadgeEl.textContent = this.authState.isAdmin ? 'Admin access enabled' : 'Admin access disabled';
            }
        };

        let activeWorkspaceView = 'overview';
        const setWorkspaceView = (requestedView) => {
            const availableViews = this.authState.isAdmin
                ? new Set(['overview', 'profile', 'users', 'prompts', 'home'])
                : new Set(['overview', 'profile']);
            const nextView = availableViews.has(requestedView) ? requestedView : (availableViews.has(activeWorkspaceView) ? activeWorkspaceView : 'overview');
            activeWorkspaceView = nextView;

            workspacePanels.forEach(panel => {
                const panelView = panel.getAttribute('data-profile-panel');
                panel.hidden = panelView !== nextView;
            });

            sectionButtons.forEach(button => {
                const isActive = button.getAttribute('data-profile-view') === nextView;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });

            if (currentContextEl) {
                currentContextEl.textContent = getContextLabel(nextView);
            }
        };

        const applyAdminVisibility = () => {
            const isAdmin = Boolean(this.authState.isAdmin);
            if (adminPanelEl) adminPanelEl.classList.toggle('d-none', !isAdmin);
            adminOnlyEls.forEach(element => element.classList.toggle('d-none', !isAdmin));
            if (!isAdmin && (activeWorkspaceView === 'users' || activeWorkspaceView === 'prompts' || activeWorkspaceView === 'home')) {
                setWorkspaceView('profile');
            }
        };

        if (sectionButtons.length) {
            sectionButtons.forEach(button => {
                if (button.dataset.boundProfileView) return;
                button.addEventListener('click', () => {
                    setWorkspaceView(button.getAttribute('data-profile-view') || 'overview');
                });
                button.dataset.boundProfileView = 'true';
            });
        }

        if (!this.authState.isAuthenticated || !this.supabase) {
            if (badgeEl) badgeEl.textContent = 'Not signed in';
            setStatus('Please sign in to view your profile.');
            this.navigate('login', 'replace');
            return;
        }

        const fallbackAvatar = 'assets/user-default.svg';
        const identity = this.getCurrentIdentity();
        setElementValue(nameEl, identity.fullName || '', '—');
        setElementValue(emailEl, identity.email || '', '—');
        setElementValue(providerEl, identity.provider || '', '—');
        setElementValue(profileSummaryNameEl, identity.fullName || '', '—');
        setElementValue(profileSummaryEmailEl, identity.email || '', '—');
        setElementValue(profileSummaryProviderEl, identity.provider || '', '—');
        if (badgeEl) badgeEl.textContent = 'Signed in';
        if (avatarEl) avatarEl.src = identity.avatarUrl || fallbackAvatar;
        refreshAccessPresentation();
        applyAdminVisibility();
        setWorkspaceView('overview');

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

        const populateCountrySelect = (selectEl, defaultValue = 'US') => {
            if (!selectEl || selectEl.dataset.bound) return;
            selectEl.innerHTML = '';
            countries.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.iso2;
                const flag = c.iso2 === 'OTHER' ? '🌐' : toFlag(c.iso2);
                opt.textContent = `${flag} ${c.name}${c.dial ? ` (${c.dial})` : ''}`;
                opt.dataset.dial = c.dial || '';
                selectEl.appendChild(opt);
            });
            selectEl.value = defaultValue;
            selectEl.dataset.bound = 'true';
        };

        const syncDialInput = (selectEl, dialInputEl) => {
            if (!selectEl || !dialInputEl) return;
            const selected = selectEl.options[selectEl.selectedIndex];
            const dial = selected?.dataset?.dial || '';
            const isOther = selectEl.value === 'OTHER';
            dialInputEl.classList.toggle('d-none', !isOther);
            if (!isOther) {
                dialInputEl.value = dial;
            } else if (!dialInputEl.value) {
                dialInputEl.value = '+';
            }
        };

        populateCountrySelect(countryEl);
        populateCountrySelect(adminCountryEl);

        if (countryEl && dialEl && !countryEl.dataset.boundChange) {
            countryEl.addEventListener('change', () => syncDialInput(countryEl, dialEl));
            countryEl.dataset.boundChange = 'true';
        }
        syncDialInput(countryEl, dialEl);

        if (adminCountryEl && adminDialEl && !adminCountryEl.dataset.boundChange) {
            adminCountryEl.addEventListener('change', () => syncDialInput(adminCountryEl, adminDialEl));
            adminCountryEl.dataset.boundChange = 'true';
        }
        syncDialInput(adminCountryEl, adminDialEl);

        let pendingAvatarFile = null;
        let adminUsers = [];
        let adminAiLogs = [];
        let selectedAdminUserId = null;
        let adminPrompts = [];
        let selectedAdminPromptId = null;
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
                .select('email, full_name, role, company_website_url, phone_country_iso2, phone_dial_code, phone_number, avatar_storage_path, oauth_avatar_url, has_privileges, is_admin')
                .eq('email', identity.email)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        };

        const applyExisting = (row) => {
            if (!row) return;
            this.authState.fullName = row.full_name || this.authState.fullName;
            this.authState.hasPrivileges = Boolean(row.has_privileges);
            this.authState.isAdmin = Boolean(row.is_admin);
            setElementValue(nameEl, row.full_name || identity.fullName || '', '—');
            setElementValue(profileSummaryNameEl, row.full_name || identity.fullName || '', '—');
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
            syncDialInput(countryEl, dialEl);

            const overrideUrl = row.avatar_storage_path ? this.getAvatarPublicUrl(row.avatar_storage_path) : null;
            const effectiveAvatar = overrideUrl || identity.avatarUrl || row.oauth_avatar_url || fallbackAvatar;
            if (avatarEl) avatarEl.src = effectiveAvatar;
            refreshAccessPresentation();
            applyAdminVisibility();
            this.updateProtectedAccessReason();
        };

        const normalizeUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw)) return raw;
            return `https://${raw}`;
        };

        const normalizeOptionalText = (value) => {
            const raw = String(value || '').trim();
            return raw || null;
        };

        const compactJson = (value) => {
            if (value == null) return '';
            if (typeof value === 'string') return value;
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return String(value);
            }
        };

        const normalizePromptKeyPart = (value) => String(value || '').trim().toLowerCase();

        const REQUIRED_PROMPT_SPECS = [
            { toolKey: 'operational-graph-assistant', promptKey: 'system', description: 'System prompt template for graph assistant.' },
            { toolKey: 'operational-graph-assistant', promptKey: 'user', description: 'User prompt template for graph assistant.' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.actor', description: 'Analyzer prompt setting: missing.actor' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.want', description: 'Analyzer prompt setting: missing.want' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.benefit', description: 'Analyzer prompt setting: missing.benefit' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.gherkin', description: 'Analyzer prompt setting: missing.gherkin' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.thresholds', description: 'Analyzer prompt setting: missing.thresholds' },
            { toolKey: 'user-story-analyzer', promptKey: 'missing.none', description: 'Analyzer prompt setting: missing.none' },
            { toolKey: 'user-story-analyzer', promptKey: 'rewrite.default_actor', description: 'Analyzer prompt setting: rewrite.default_actor' },
            { toolKey: 'user-story-analyzer', promptKey: 'rewrite.default_outcome', description: 'Analyzer prompt setting: rewrite.default_outcome' },
            { toolKey: 'user-story-analyzer', promptKey: 'rewrite.default_benefit', description: 'Analyzer prompt setting: rewrite.default_benefit' },
            { toolKey: 'user-story-analyzer', promptKey: 'rewrite.story_template', description: 'Analyzer prompt setting: rewrite.story_template' },
            { toolKey: 'user-story-analyzer', promptKey: 'gherkin.given_template', description: 'Analyzer prompt setting: gherkin.given_template' },
            { toolKey: 'user-story-analyzer', promptKey: 'gherkin.when_template', description: 'Analyzer prompt setting: gherkin.when_template' },
            { toolKey: 'user-story-analyzer', promptKey: 'gherkin.then_template', description: 'Analyzer prompt setting: gherkin.then_template' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.independent.split', description: 'Analyzer prompt setting: suggestion.independent.split' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.independent.focus', description: 'Analyzer prompt setting: suggestion.independent.focus' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.negotiable.replace_ambiguous', description: 'Analyzer prompt setting: suggestion.negotiable.replace_ambiguous' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.negotiable.keep_outcome_focused', description: 'Analyzer prompt setting: suggestion.negotiable.keep_outcome_focused' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.valuable.retain_value', description: 'Analyzer prompt setting: suggestion.valuable.retain_value' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.valuable.add_so_that', description: 'Analyzer prompt setting: suggestion.valuable.add_so_that' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.estimable.refine_scope', description: 'Analyzer prompt setting: suggestion.estimable.refine_scope' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.estimable.add_metrics', description: 'Analyzer prompt setting: suggestion.estimable.add_metrics' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.small.reduce_scope', description: 'Analyzer prompt setting: suggestion.small.reduce_scope' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.small.keep_concise', description: 'Analyzer prompt setting: suggestion.small.keep_concise' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.testable.keep_gherkin', description: 'Analyzer prompt setting: suggestion.testable.keep_gherkin' },
            { toolKey: 'user-story-analyzer', promptKey: 'suggestion.testable.add_gherkin', description: 'Analyzer prompt setting: suggestion.testable.add_gherkin' },
            { toolKey: 'user-story-analyzer', promptKey: 'overall.high', description: 'Analyzer prompt setting: overall.high' },
            { toolKey: 'user-story-analyzer', promptKey: 'overall.medium', description: 'Analyzer prompt setting: overall.medium' },
            { toolKey: 'user-story-analyzer', promptKey: 'overall.low', description: 'Analyzer prompt setting: overall.low' }
        ];

        const findAdminUser = (userId) => adminUsers.find(user => String(user.user_id || '') === String(userId || '')) || null;
        const findAdminPrompt = (promptId) => adminPrompts.find(prompt => String(prompt.id || '') === String(promptId || '')) || null;

        const parseTimestamp = (value) => {
            const ts = value ? Date.parse(String(value)) : NaN;
            return Number.isFinite(ts) ? ts : 0;
        };

        const getFilteredAndSortedAdminPrompts = () => {
            const searchQuery = String(adminPromptsFilterSearchEl?.value || '').trim().toLowerCase();
            const toolFilter = String(adminPromptsFilterToolEl?.value || '');
            const activeFilter = String(adminPromptsFilterActiveEl?.value || '');
            const sortBy = String(adminPromptsSortEl?.value || 'tool_asc');

            const filtered = adminPrompts.filter(prompt => {
                if (searchQuery) {
                    const haystack = [
                        String(prompt.tool_key || ''),
                        String(prompt.prompt_key || ''),
                        String(prompt.description || '')
                    ].join(' ').toLowerCase();

                    if (!haystack.includes(searchQuery)) {
                        return false;
                    }
                }

                if (toolFilter && String(prompt.tool_key || '') !== toolFilter) {
                    return false;
                }
                if (activeFilter === 'active' && !prompt.is_active) {
                    return false;
                }
                if (activeFilter === 'inactive' && Boolean(prompt.is_active)) {
                    return false;
                }
                return true;
            });

            filtered.sort((a, b) => {
                const aTool = String(a.tool_key || '');
                const bTool = String(b.tool_key || '');
                const aKey = String(a.prompt_key || '');
                const bKey = String(b.prompt_key || '');
                const aUpdated = parseTimestamp(a.updated_at);
                const bUpdated = parseTimestamp(b.updated_at);

                if (sortBy === 'updated_desc') {
                    if (aUpdated !== bUpdated) return bUpdated - aUpdated;
                    const toolDiff = aTool.localeCompare(bTool);
                    if (toolDiff !== 0) return toolDiff;
                    return aKey.localeCompare(bKey);
                }

                if (sortBy === 'updated_asc') {
                    if (aUpdated !== bUpdated) return aUpdated - bUpdated;
                    const toolDiff = aTool.localeCompare(bTool);
                    if (toolDiff !== 0) return toolDiff;
                    return aKey.localeCompare(bKey);
                }

                if (sortBy === 'tool_desc') {
                    const toolDiff = bTool.localeCompare(aTool);
                    if (toolDiff !== 0) return toolDiff;
                    return bKey.localeCompare(aKey);
                }

                const toolDiff = aTool.localeCompare(bTool);
                if (toolDiff !== 0) return toolDiff;
                return aKey.localeCompare(bKey);
            });

            return filtered;
        };

        const refreshPromptFilterToolOptions = () => {
            if (!adminPromptsFilterToolEl) return;
            const previousValue = String(adminPromptsFilterToolEl.value || '');
            const tools = Array.from(new Set(adminPrompts
                .map(prompt => String(prompt.tool_key || '').trim())
                .filter(Boolean)))
                .sort((a, b) => a.localeCompare(b));

            adminPromptsFilterToolEl.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = '';
            allOption.textContent = 'All tools';
            adminPromptsFilterToolEl.appendChild(allOption);

            tools.forEach(tool => {
                const option = document.createElement('option');
                option.value = tool;
                option.textContent = tool;
                adminPromptsFilterToolEl.appendChild(option);
            });

            const hasPrevious = tools.includes(previousValue);
            adminPromptsFilterToolEl.value = hasPrevious ? previousValue : '';
        };

        const buildPromptIndexKey = (toolKey, promptKey) => `${String(toolKey || '').trim().toLowerCase()}::${String(promptKey || '').trim().toLowerCase()}`;

        const seedMissingRequiredPrompts = async () => {
            const existing = new Set(adminPrompts.map(prompt => buildPromptIndexKey(prompt.tool_key, prompt.prompt_key)));
            const missingSpecs = REQUIRED_PROMPT_SPECS.filter(spec => !existing.has(buildPromptIndexKey(spec.toolKey, spec.promptKey)));

            if (missingSpecs.length === 0) {
                setAdminPromptsStatus('All required prompt keys already exist.');
                return;
            }

            setAdminPromptsStatus(`Seeding ${missingSpecs.length} missing prompt key(s)...`);
            if (adminPromptsSeedEl) adminPromptsSeedEl.disabled = true;

            try {
                for (const spec of missingSpecs) {
                    await this.upsertAdminAiPrompt({
                        p_id: null,
                        p_tool_key: spec.toolKey,
                        p_prompt_key: spec.promptKey,
                        p_content: `[TODO] Configure prompt content for ${spec.toolKey}.${spec.promptKey}`,
                        p_description: spec.description,
                        p_is_active: true
                    });
                }

                await loadAdminPrompts();
                setAdminPromptsStatus(`Seeded ${missingSpecs.length} missing prompt key(s). Review and update placeholder content.`);
            } catch (error) {
                console.error('[profile-admin] prompt seed failed', error);
                setAdminPromptsStatus('Unable to seed missing prompt keys right now.');
            } finally {
                if (adminPromptsSeedEl) adminPromptsSeedEl.disabled = false;
            }
        };

        const resetAdminPromptEditor = () => {
            selectedAdminPromptId = null;
            if (adminPromptIdEl) adminPromptIdEl.value = '';
            if (adminPromptToolEl) adminPromptToolEl.value = '';
            if (adminPromptKeyEl) adminPromptKeyEl.value = '';
            if (adminPromptDescriptionEl) adminPromptDescriptionEl.value = '';
            if (adminPromptContentEl) adminPromptContentEl.value = '';
            if (adminPromptActiveEl) adminPromptActiveEl.checked = true;
            if (adminPromptDeleteEl) adminPromptDeleteEl.disabled = true;
            setAdminPromptSaveStatus('');
        };

        const populateAdminPromptEditor = (row) => {
            if (!row) {
                resetAdminPromptEditor();
                return;
            }

            selectedAdminPromptId = row.id || null;
            if (adminPromptIdEl) adminPromptIdEl.value = row.id || '';
            if (adminPromptToolEl) adminPromptToolEl.value = row.tool_key || '';
            if (adminPromptKeyEl) adminPromptKeyEl.value = row.prompt_key || '';
            if (adminPromptDescriptionEl) adminPromptDescriptionEl.value = row.description || '';
            if (adminPromptContentEl) adminPromptContentEl.value = row.content || '';
            if (adminPromptActiveEl) adminPromptActiveEl.checked = Boolean(row.is_active);
            if (adminPromptDeleteEl) adminPromptDeleteEl.disabled = false;
            setAdminPromptSaveStatus('');
        };

        const renderAdminPrompts = () => {
            if (!adminPromptsBodyEl) return;
            adminPromptsBodyEl.innerHTML = '';

            const rows = getFilteredAndSortedAdminPrompts();

            if (adminPromptsCountEl) {
                adminPromptsCountEl.textContent = `${rows.length} prompt${rows.length === 1 ? '' : 's'}`;
            }
            if (overviewPromptCountEl) {
                overviewPromptCountEl.textContent = `${rows.length} prompt${rows.length === 1 ? '' : 's'}`;
            }

            if (adminPromptsEmptyEl) {
                adminPromptsEmptyEl.classList.toggle('d-none', rows.length > 0);
            }

            rows.forEach(prompt => {
                const card = document.createElement('button');
                const isActive = String(prompt.id || '') === String(selectedAdminPromptId || '');
                const updatedText = prompt.updated_at
                    ? new Date(prompt.updated_at).toLocaleString()
                    : 'Recently updated date unavailable';

                card.type = 'button';
                card.className = `profile-record-card${isActive ? ' is-selected' : ''}`;
                card.dataset.promptId = prompt.id || '';
                card.innerHTML = `
                    <div class="profile-record-top">
                        <div class="profile-record-copy">
                            <strong class="profile-record-title">${escapeHtml(prompt.prompt_key || 'Untitled prompt')}</strong>
                            <span class="profile-record-support profile-record-mono">${escapeHtml(prompt.tool_key || 'Unknown tool')}</span>
                        </div>
                        <span class="profile-badge${prompt.is_active ? '' : ' profile-badge--soft'}">${prompt.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="profile-record-support">${escapeHtml(prompt.description || 'No description provided.')}</div>
                    <div class="profile-record-meta">
                        <span class="profile-hint">${escapeHtml(updatedText)}</span>
                        <span class="profile-inline-link">Edit</span>
                    </div>
                `;

                adminPromptsBodyEl.appendChild(card);
            });
        };

        const loadAdminPrompts = async () => {
            if (!this.authState.isAdmin || !adminPanelEl) return;

            setAdminPromptsStatus('Loading prompt catalog...');
            try {
                adminPrompts = await this.listAdminAiPrompts();
                refreshPromptFilterToolOptions();
                renderAdminPrompts();
                if (selectedAdminPromptId) {
                    populateAdminPromptEditor(findAdminPrompt(selectedAdminPromptId));
                } else {
                    resetAdminPromptEditor();
                }
                setAdminPromptsStatus('');
            } catch (error) {
                console.error('[profile-admin] prompt list failed', error);
                adminPrompts = [];
                refreshPromptFilterToolOptions();
                renderAdminPrompts();
                resetAdminPromptEditor();
                setAdminPromptsStatus('Unable to load prompt catalog right now.');
            }
        };

        const renderAdminAiUsage = (row) => {
            const count = Number(row?.ai_interactions_today || 0);
            const limit = Number(row?.ai_interactions_limit || 10);
            const remaining = Math.max(Number(row?.ai_interactions_remaining ?? (limit - count)), 0);
            const lastAt = row?.ai_interactions_last_at
                ? new Date(row.ai_interactions_last_at).toLocaleString()
                : '';

            if (adminAiCountEl) adminAiCountEl.textContent = `${count} / ${limit}`;
            if (adminAiRemainingEl) adminAiRemainingEl.textContent = String(remaining);
            if (adminAiUsageSummaryEl) {
                adminAiUsageSummaryEl.textContent = lastAt
                    ? `Last AI interaction: ${lastAt}.`
                    : 'No AI interactions recorded today.';
            }
        };

        const renderAdminAiLogs = () => {
            if (!adminAiLogsEl) return;
            adminAiLogsEl.innerHTML = '';

            if (adminAiEmptyEl) {
                adminAiEmptyEl.classList.toggle('d-none', adminAiLogs.length > 0);
            }

            adminAiLogs.forEach(log => {
                const createdAt = log.created_at ? new Date(log.created_at).toLocaleString() : 'Time unavailable';
                const promptText = compactJson(log.prompt_payload);
                const responseText = compactJson(log.response_payload);
                const card = document.createElement('article');
                card.className = 'profile-admin-ai-log-card';
                card.setAttribute('role', 'listitem');
                card.innerHTML = `
                    <div class="profile-record-top">
                        <div class="profile-record-copy">
                            <strong class="profile-record-title">${escapeHtml(log.tool_key || 'AI interaction')}</strong>
                            <span class="profile-record-support">${escapeHtml(createdAt)}</span>
                        </div>
                        <span class="profile-badge${log.status === 'completed' ? '' : ' profile-badge--soft'}">${escapeHtml(log.status || 'reserved')}</span>
                    </div>
                    ${log.error_message ? `<p class="profile-admin-ai-error">${escapeHtml(log.error_message)}</p>` : ''}
                    <details class="profile-admin-ai-log-detail">
                        <summary>Prompt</summary>
                        <pre>${escapeHtml(promptText || '{}')}</pre>
                    </details>
                    <details class="profile-admin-ai-log-detail">
                        <summary>Response</summary>
                        <pre>${escapeHtml(responseText || '{}')}</pre>
                    </details>
                `;
                adminAiLogsEl.appendChild(card);
            });
        };

        const loadAdminAiLogs = async (userId) => {
            if (!this.authState.isAdmin || !userId) return;

            setAdminAiStatus('Loading AI interaction logs...');
            try {
                adminAiLogs = await this.listAdminAiInteractionLogs(userId);
                renderAdminAiLogs();
                setAdminAiStatus('');
            } catch (error) {
                console.error('[profile-admin] AI logs failed', error);
                adminAiLogs = [];
                renderAdminAiLogs();
                setAdminAiStatus('Unable to load AI interaction logs right now.');
            }
        };

        const resetAdminEditor = () => {
            selectedAdminUserId = null;
            adminAiLogs = [];
            if (adminFormEl) adminFormEl.classList.add('d-none');
            if (adminPlaceholderEl) adminPlaceholderEl.classList.remove('d-none');
            if (adminEditorCloseEl) adminEditorCloseEl.classList.add('d-none');
            if (adminIdEl) adminIdEl.value = '';
            if (adminEmailFieldEl) adminEmailFieldEl.value = '';
            if (adminFullNameEl) adminFullNameEl.value = '';
            if (adminRoleEl) adminRoleEl.value = '';
            if (adminCompanyUrlEl) adminCompanyUrlEl.value = '';
            if (adminCountryEl) adminCountryEl.value = 'US';
            if (adminDialEl) adminDialEl.value = '';
            if (adminPhoneEl) adminPhoneEl.value = '';
            if (adminPrivilegesToggleEl) adminPrivilegesToggleEl.checked = false;
            renderAdminAiUsage(null);
            renderAdminAiLogs();
            syncDialInput(adminCountryEl, adminDialEl);
            setAdminAiStatus('');
            setAdminSaveStatus('');
        };

        const populateAdminEditor = (row) => {
            if (!row) {
                resetAdminEditor();
                return;
            }

            selectedAdminUserId = row.user_id;
            if (adminPlaceholderEl) adminPlaceholderEl.classList.add('d-none');
            if (adminFormEl) adminFormEl.classList.remove('d-none');
            if (adminEditorCloseEl) adminEditorCloseEl.classList.remove('d-none');
            if (adminIdEl) adminIdEl.value = row.user_id || '';
            if (adminEmailFieldEl) adminEmailFieldEl.value = row.email || '';
            if (adminFullNameEl) adminFullNameEl.value = row.full_name || '';
            if (adminRoleEl) adminRoleEl.value = row.role || '';
            if (adminCompanyUrlEl) adminCompanyUrlEl.value = row.company_website_url || '';
            if (adminPhoneEl) adminPhoneEl.value = row.phone_number || '';
            if (adminCountryEl) {
                const iso2 = row.phone_country_iso2 || '';
                const option = Array.from(adminCountryEl.options || []).find(o => o.value === iso2);
                adminCountryEl.value = option ? iso2 : 'OTHER';
            }
            if (adminDialEl) {
                adminDialEl.value = row.phone_dial_code || '';
            }
            syncDialInput(adminCountryEl, adminDialEl);
            if (adminPrivilegesToggleEl) adminPrivilegesToggleEl.checked = Boolean(row.has_privileges);
            renderAdminAiUsage(row);
            loadAdminAiLogs(row.user_id);
            setAdminSaveStatus('');
        };

        const renderAdminUsers = () => {
            if (!adminUsersBodyEl) return;
            adminUsersBodyEl.innerHTML = '';

            if (adminCountEl) {
                adminCountEl.textContent = `${adminUsers.length} user${adminUsers.length === 1 ? '' : 's'}`;
            }
            if (overviewUserCountEl) {
                overviewUserCountEl.textContent = `${adminUsers.length} user${adminUsers.length === 1 ? '' : 's'}`;
            }

            if (adminEmptyEl) {
                adminEmptyEl.classList.toggle('d-none', adminUsers.length > 0);
            }

            adminUsers.forEach(user => {
                const card = document.createElement('button');
                const isActive = String(user.user_id || '') === String(selectedAdminUserId || '');
                card.type = 'button';
                card.className = `profile-record-card${isActive ? ' is-selected' : ''}`;
                card.dataset.userId = user.user_id || '';

                const badges = [];
                if (user.is_admin) {
                    badges.push('<span class="profile-badge">Admin</span>');
                }
                if (user.has_privileges) {
                    badges.push('<span class="profile-badge profile-badge--soft">Protected</span>');
                }
                badges.push(`<span class="profile-badge profile-badge--soft">AI ${Number(user.ai_interactions_today || 0)} / ${Number(user.ai_interactions_limit || 10)}</span>`);

                card.innerHTML = `
                    <div class="profile-record-top">
                        <div class="profile-record-copy">
                            <strong class="profile-record-title">${escapeHtml(user.full_name || 'Unnamed user')}</strong>
                            <span class="profile-record-support">${escapeHtml(user.email || 'No email available')}</span>
                        </div>
                        <span class="profile-inline-link">Edit</span>
                    </div>
                    <div class="profile-record-meta">
                        <code class="profile-record-code">${escapeHtml(user.user_id || '')}</code>
                        <div class="profile-record-support">${badges.join(' ') || '<span class="profile-hint">Standard account</span>'}</div>
                    </div>
                `;

                adminUsersBodyEl.appendChild(card);
            });
        };

        const loadAdminUsers = async () => {
            if (!this.authState.isAdmin || !adminPanelEl) return;

            setAdminDirectoryStatus('Loading registered users...');
            try {
                adminUsers = await this.listAdminProfiles();
                renderAdminUsers();
                if (selectedAdminUserId) {
                    populateAdminEditor(findAdminUser(selectedAdminUserId));
                } else {
                    resetAdminEditor();
                }
                setAdminDirectoryStatus('');
            } catch (error) {
                console.error('[profile-admin] list failed', error);
                adminUsers = [];
                renderAdminUsers();
                resetAdminEditor();
                setAdminDirectoryStatus('Unable to load registered users right now.');
            }
        };

        loadExisting()
            .then(row => {
                applyExisting(row);
                if (this.authState.isAdmin) {
                    return Promise.all([loadAdminUsers(), loadAdminPrompts()]);
                }
                return null;
            })
            .catch(err => {
                console.warn('[profile] load failed', err);
                setStatus('Unable to load profile right now.');
            });

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

            const { data, error } = await this.supabase
                .from('profiles')
                .upsert(payload, { onConflict: 'email' })
                .select('avatar_storage_path')
                .maybeSingle();
            adminEditorCloseEl.dataset.bound = 'true';
        }

        if (adminCancelEl && !adminCancelEl.dataset.bound) {
            adminCancelEl.addEventListener('click', () => {
                populateAdminEditor(findAdminUser(selectedAdminUserId));
            });
            adminCancelEl.dataset.bound = 'true';
        }

        if (adminUsersBodyEl && !adminUsersBodyEl.dataset.bound) {
            adminUsersBodyEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-user-id]');
                if (!button) return;
                const userId = button.getAttribute('data-user-id');
                populateAdminEditor(findAdminUser(userId));
                renderAdminUsers();
            });
            adminUsersBodyEl.dataset.bound = 'true';
        }

        if (adminFormEl && !adminFormEl.dataset.bound) {
            adminFormEl.addEventListener('submit', async (event) => {
                event.preventDefault();

                if (!selectedAdminUserId) {
                    setAdminSaveStatus('Select a user first.');
                    return;
                }

                setAdminSaveStatus('Saving user...');
                try {
                    const row = await this.updateAdminProfile({
                        p_user_id: selectedAdminUserId,
                        p_full_name: normalizeOptionalText(adminFullNameEl?.value),
                        p_role: normalizeOptionalText(adminRoleEl?.value),
                        p_company_website_url: normalizeUrl(adminCompanyUrlEl?.value),
                        p_phone_country_iso2: adminCountryEl?.value && adminCountryEl.value !== 'OTHER' ? adminCountryEl.value : null,
                        p_phone_dial_code: normalizeOptionalText(adminDialEl?.value),
                        p_phone_number: normalizeOptionalText(adminPhoneEl?.value),
                        p_has_privileges: Boolean(adminPrivilegesToggleEl?.checked)
                    });

                    adminUsers = adminUsers.map(user => String(user.user_id) === String(row.user_id) ? { ...user, ...row } : user);
                    if (String(row.email || '').toLowerCase() === String(this.authState.email || '').toLowerCase()) {
                        this.authState.fullName = row.full_name || this.authState.fullName;
                        this.authState.hasPrivileges = Boolean(row.has_privileges);
                        this.authState.isAdmin = Boolean(row.is_admin);
                        setElementValue(nameEl, this.authState.fullName || '', '—');
                        setElementValue(profileSummaryNameEl, this.authState.fullName || '', '—');
                        refreshAccessPresentation();
                        applyAdminVisibility();
                        this.updateProtectedAccessReason();
                    }
                    renderAdminUsers();
                    populateAdminEditor(row);
                    setAdminSaveStatus('User saved.');
                } catch (error) {
                    console.error('[profile-admin] save failed', error);
                    setAdminSaveStatus('Unable to save this user right now.');
                }
            });
            adminFormEl.dataset.bound = 'true';
        }

        if (adminAiResetEl && !adminAiResetEl.dataset.bound) {
            adminAiResetEl.addEventListener('click', async () => {
                if (!selectedAdminUserId) {
                    setAdminAiStatus('Select a user first.');
                    return;
                }

                setAdminAiStatus('Resetting daily AI limit...');
                adminAiResetEl.disabled = true;
                try {
                    const resetRow = await this.resetAdminAiDailyInteractions(selectedAdminUserId);
                    adminUsers = adminUsers.map(user => {
                        if (String(user.user_id || '') !== String(selectedAdminUserId)) return user;
                        return {
                            ...user,
                            ai_interactions_today: resetRow?.daily_count ?? 0,
                            ai_interactions_limit: resetRow?.daily_limit ?? 10,
                            ai_interactions_remaining: resetRow?.remaining ?? 10
                        };
                    });
                    const selectedUser = findAdminUser(selectedAdminUserId);
                    renderAdminUsers();
                    renderAdminAiUsage(selectedUser);
                    await loadAdminAiLogs(selectedAdminUserId);
                    setAdminAiStatus('Daily AI limit reset.');
                } catch (error) {
                    console.error('[profile-admin] AI reset failed', error);
                    setAdminAiStatus('Unable to reset this AI limit right now.');
                } finally {
                    adminAiResetEl.disabled = false;
                }
            });
            adminAiResetEl.dataset.bound = 'true';
        }

        if (adminPromptsBodyEl && !adminPromptsBodyEl.dataset.bound) {
            adminPromptsBodyEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-prompt-id]');
                if (!button) return;
                const promptId = button.getAttribute('data-prompt-id');
                populateAdminPromptEditor(findAdminPrompt(promptId));
                renderAdminPrompts();
            });
            adminPromptsBodyEl.dataset.bound = 'true';
        }

        if (adminPromptNewEl && !adminPromptNewEl.dataset.bound) {
            adminPromptNewEl.addEventListener('click', () => {
                resetAdminPromptEditor();
                if (adminPromptToolEl && typeof adminPromptToolEl.focus === 'function') {
                    adminPromptToolEl.focus({ preventScroll: true });
                }
                renderAdminPrompts();
            });
            adminPromptNewEl.dataset.bound = 'true';
        }

        if (adminPromptDeleteEl && !adminPromptDeleteEl.dataset.bound) {
            adminPromptDeleteEl.addEventListener('click', async () => {
                if (!selectedAdminPromptId) {
                    setAdminPromptSaveStatus('Select a prompt first.');
                    return;
                }

                setAdminPromptSaveStatus('Deleting prompt...');
                try {
                    await this.deleteAdminAiPrompt(selectedAdminPromptId);
                    adminPrompts = adminPrompts.filter(prompt => String(prompt.id || '') !== String(selectedAdminPromptId));
                    resetAdminPromptEditor();
                    renderAdminPrompts();
                    setAdminPromptSaveStatus('Prompt deleted.');
                } catch (error) {
                    console.error('[profile-admin] prompt delete failed', error);
                    setAdminPromptSaveStatus('Unable to delete this prompt right now.');
                }
            });
            adminPromptDeleteEl.dataset.bound = 'true';
        }

        if (adminPromptFormEl && !adminPromptFormEl.dataset.bound) {
            adminPromptFormEl.addEventListener('submit', async (event) => {
                event.preventDefault();

                const toolKey = normalizePromptKeyPart(adminPromptToolEl?.value);
                const promptKey = normalizePromptKeyPart(adminPromptKeyEl?.value);
                const promptContent = String(adminPromptContentEl?.value || '').trim();

                if (!toolKey || !promptKey || !promptContent) {
                    setAdminPromptSaveStatus('Tool key, prompt key, and prompt content are required.');
                    return;
                }

                setAdminPromptSaveStatus('Saving prompt...');
                try {
                    const row = await this.upsertAdminAiPrompt({
                        p_id: selectedAdminPromptId || null,
                        p_tool_key: toolKey,
                        p_prompt_key: promptKey,
                        p_content: promptContent,
                        p_description: normalizeOptionalText(adminPromptDescriptionEl?.value),
                        p_is_active: Boolean(adminPromptActiveEl?.checked)
                    });

                    const rowId = String(row.id || '');
                    const existingIndex = adminPrompts.findIndex(prompt => String(prompt.id || '') === rowId);
                    if (existingIndex >= 0) {
                        adminPrompts[existingIndex] = row;
                    } else {
                        adminPrompts.push(row);
                    }

                    refreshPromptFilterToolOptions();

                    populateAdminPromptEditor(row);
                    renderAdminPrompts();
                    setAdminPromptSaveStatus('Prompt saved.');
                } catch (error) {
                    console.error('[profile-admin] prompt save failed', error);
                    setAdminPromptSaveStatus('Unable to save this prompt right now.');
                }
            });
            adminPromptFormEl.dataset.bound = 'true';
        }

        const bindPromptFilter = (el) => {
            if (!el || el.dataset.bound) return;
            el.addEventListener('change', () => {
                renderAdminPrompts();
            });
            el.dataset.bound = 'true';
        };
        if (adminPromptsFilterSearchEl && !adminPromptsFilterSearchEl.dataset.bound) {
            adminPromptsFilterSearchEl.addEventListener('input', () => {
                renderAdminPrompts();
            });
            adminPromptsFilterSearchEl.dataset.bound = 'true';
        }
        bindPromptFilter(adminPromptsFilterToolEl);
        bindPromptFilter(adminPromptsFilterActiveEl);
        bindPromptFilter(adminPromptsSortEl);

        if (adminPromptsSeedEl && !adminPromptsSeedEl.dataset.bound) {
            adminPromptsSeedEl.addEventListener('click', () => {
                seedMissingRequiredPrompts();
            });
            adminPromptsSeedEl.dataset.bound = 'true';
        }

        if (this.authState.isAdmin) {
            loadAdminUsers();
            loadAdminPrompts();
        } else {
            resetAdminEditor();
            resetAdminPromptEditor();
            setAdminDirectoryStatus('');
            setAdminPromptsStatus('');
        }

        // ── Home config admin panel ──────────────────────────────────────────
        const homeConfigStatusEl = document.getElementById('home-config-status');
        if (!homeConfigStatusEl) return; // panel not in DOM

        const setHomeConfigStatus = (msg, isError) => {
            if (!homeConfigStatusEl) return;
            homeConfigStatusEl.textContent = msg;
            homeConfigStatusEl.className = 'profile-hint mt-3' + (isError ? ' text-danger' : ' text-success');
        };

        // ── Generic chip-list editor ──────────────────────────────────────────
        // Renders a list of string items as editable chips with a remove button.
        const renderChipEditor = (containerEl, items) => {
            if (!containerEl) return;
            containerEl.innerHTML = '';
            (items || []).forEach((item, idx) => {
                const chip = document.createElement('span');
                chip.className = 'home-config-chip-editor badge bg-secondary me-1 mb-1';
                chip.dataset.idx = idx;
                chip.innerHTML = `${this.escapeHtml(item)} <button type="button" class="btn-close btn-close-white btn-sm ms-1 home-config-chip-remove" aria-label="Remove ${this.escapeHtml(item)}" style="font-size:.6rem"></button>`;
                chip.querySelector('.home-config-chip-remove').addEventListener('click', () => {
                    items.splice(idx, 1);
                    renderChipEditor(containerEl, items);
                });
                containerEl.appendChild(chip);
            });
            // "Add item" input
            const addRow = document.createElement('div');
            addRow.className = 'd-flex gap-2 mt-2';
            addRow.innerHTML = `<input type="text" class="form-control form-control-sm home-config-chip-input" placeholder="Add item…"><button type="button" class="btn btn-sm btn-outline-primary home-config-chip-add-btn">Add</button>`;
            const input = addRow.querySelector('.home-config-chip-input');
            addRow.querySelector('.home-config-chip-add-btn').addEventListener('click', () => {
                const val = input.value.trim();
                if (!val) return;
                items.push(val);
                renderChipEditor(containerEl, items);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addRow.querySelector('.home-config-chip-add-btn').click(); }
            });
            containerEl.appendChild(addRow);
        };

        // ── Timeline ─────────────────────────────────────────────────────────
        const timelineBodyEl = document.getElementById('home-config-timeline-body');
        const timelineAddEl = document.getElementById('home-config-timeline-add');
        // Working copy (deep clone)
        let workTimeline = JSON.parse(JSON.stringify((this.getHomeRoadmapData()?.timeline?.missions) || []));

        const renderTimelineEditor = () => {
            if (!timelineBodyEl) return;
            timelineBodyEl.innerHTML = '';
            workTimeline.forEach((mission, idx) => {
                const item = document.createElement('div');
                item.className = 'home-config-timeline-item card p-3 mb-2';
                item.innerHTML = `
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="small">${this.escapeHtml(mission.title || `Mission ${idx + 1}`)}</strong>
                    <button type="button" class="btn btn-sm btn-outline-danger home-config-timeline-remove">Remove</button>
                  </div>
                  <div class="row g-2">
                    <div class="col-6"><label class="form-label small">Title</label>
                      <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(mission.title || '')}" data-field="title"></div>
                    <div class="col-3"><label class="form-label small">Start</label>
                      <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(mission.start || '')}" data-field="start"></div>
                    <div class="col-3"><label class="form-label small">End</label>
                      <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(mission.end || '')}" data-field="end"></div>
                    <div class="col-12"><label class="form-label small">Summary</label>
                      <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(mission.summary || '')}" data-field="summary"></div>
                  </div>`;
                item.querySelector('.home-config-timeline-remove').addEventListener('click', () => {
                    workTimeline.splice(idx, 1);
                    renderTimelineEditor();
                });
                item.querySelectorAll('[data-field]').forEach(input => {
                    input.addEventListener('input', (e) => {
                        workTimeline[idx][e.target.dataset.field] = e.target.value;
                    });
                });
                timelineBodyEl.appendChild(item);
            });
        };

        if (timelineAddEl && !timelineAddEl.dataset.bound) {
            timelineAddEl.addEventListener('click', () => {
                workTimeline.push({ id: `mission-${Date.now()}`, title: '', start: '', end: '', summary: '', tags: [], filters: [], roleFocus: '', tone: '', bullets: [], details: '' });
                renderTimelineEditor();
            });
            timelineAddEl.dataset.bound = 'true';
        }
        renderTimelineEditor();

        // ── Knowledge Stack ───────────────────────────────────────────────────
        const knowledgeBodyEl = document.getElementById('home-config-knowledge-body');
        let workKnowledge = JSON.parse(JSON.stringify((this.getHomeRoadmapData()?.knowledge?.layers) || []));

        const renderKnowledgeEditor = () => {
            if (!knowledgeBodyEl) return;
            knowledgeBodyEl.innerHTML = '';
            workKnowledge.forEach((layer, idx) => {
                const item = document.createElement('div');
                item.className = 'home-config-timeline-item card p-3 mb-2';
                item.innerHTML = `
                  <div class="mb-2"><strong class="small">${this.escapeHtml(layer.label || `Layer ${idx + 1}`)}</strong></div>
                  <div class="mb-2">
                    <label class="form-label small">Label</label>
                    <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(layer.label || '')}" data-field="label">
                  </div>
                  <label class="form-label small">Chips</label>
                  <div class="home-config-chips-target"></div>`;
                item.querySelector('[data-field="label"]').addEventListener('input', (e) => {
                    workKnowledge[idx].label = e.target.value;
                });
                renderChipEditor(item.querySelector('.home-config-chips-target'), workKnowledge[idx].chips);
                knowledgeBodyEl.appendChild(item);
            });
        };
        renderKnowledgeEditor();

        // ── Skills Clusters ───────────────────────────────────────────────────
        const skillsBodyEl = document.getElementById('home-config-skills-body');
        let workClusters = JSON.parse(JSON.stringify((this.getHomeRoadmapData()?.skills?.clusters) || []));

        const renderClustersEditor = () => {
            if (!skillsBodyEl) return;
            skillsBodyEl.innerHTML = '';
            workClusters.forEach((cluster, idx) => {
                const item = document.createElement('div');
                item.className = 'home-config-timeline-item card p-3 mb-2';
                item.innerHTML = `
                  <div class="mb-2"><strong class="small">${this.escapeHtml(cluster.label || `Cluster ${idx + 1}`)}</strong></div>
                  <div class="mb-2">
                    <label class="form-label small">Label</label>
                    <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(cluster.label || '')}" data-field="label">
                  </div>
                  <label class="form-label small">Items</label>
                  <div class="home-config-chips-target"></div>`;
                item.querySelector('[data-field="label"]').addEventListener('input', (e) => {
                    workClusters[idx].label = e.target.value;
                });
                renderChipEditor(item.querySelector('.home-config-chips-target'), workClusters[idx].items);
                skillsBodyEl.appendChild(item);
            });
        };
        renderClustersEditor();

        // ── Tool Categories ───────────────────────────────────────────────────
        const toolsBodyEl = document.getElementById('home-config-tools-body');
        let workToolCats = JSON.parse(JSON.stringify((this.getHomeRoadmapData()?.skills?.toolCategories) || []));

        const renderToolCatsEditor = () => {
            if (!toolsBodyEl) return;
            toolsBodyEl.innerHTML = '';
            workToolCats.forEach((cat, idx) => {
                const item = document.createElement('div');
                item.className = 'home-config-timeline-item card p-3 mb-2';
                item.innerHTML = `
                  <div class="mb-2"><strong class="small">${this.escapeHtml(cat.label || `Category ${idx + 1}`)}</strong></div>
                  <div class="mb-2">
                    <label class="form-label small">Label</label>
                    <input type="text" class="form-control form-control-sm" value="${this.escapeHtml(cat.label || '')}" data-field="label">
                  </div>
                  <label class="form-label small">Items</label>
                  <div class="home-config-chips-target"></div>`;
                item.querySelector('[data-field="label"]').addEventListener('input', (e) => {
                    workToolCats[idx].label = e.target.value;
                });
                renderChipEditor(item.querySelector('.home-config-chips-target'), workToolCats[idx].items);
                toolsBodyEl.appendChild(item);
            });
        };
        renderToolCatsEditor();

        // ── Links ─────────────────────────────────────────────────────────────
        const linkInputs = document.querySelectorAll('[data-home-config-link]');
        const getNestedValue = (obj, path) => path.split('.').reduce((o, k) => (o && o[Number.isNaN(+k) ? k : +k] !== undefined ? o[Number.isNaN(+k) ? k : +k] : undefined), obj);
        const setNestedValue = (obj, path, val) => {
            const keys = path.split('.');
            let cur = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                const k = Number.isNaN(+keys[i]) ? keys[i] : +keys[i];
                if (cur[k] === undefined) cur[k] = {};
                cur = cur[k];
            }
            const last = Number.isNaN(+keys[keys.length - 1]) ? keys[keys.length - 1] : +keys[keys.length - 1];
            cur[last] = val;
        };
        // Populate link fields from current data
        const currentData = this.getHomeRoadmapData() || {};
        linkInputs.forEach(input => {
            const val = getNestedValue(currentData, input.dataset.homeConfigLink);
            if (val !== undefined) input.value = val;
        });
        // Build working links snapshot
        let workLinks = JSON.parse(JSON.stringify({
            roleActions: currentData.roleActions,
            availability: currentData.availability,
            cta: currentData.cta
        }));
        linkInputs.forEach(input => {
            if (!input.dataset.bound) {
                input.addEventListener('input', (e) => {
                    setNestedValue(workLinks, e.target.dataset.homeConfigLink, e.target.value);
                });
                input.dataset.bound = 'true';
            }
        });

        // ── Save buttons ──────────────────────────────────────────────────────
        const saveBtns = document.querySelectorAll('[data-home-config-save]');
        saveBtns.forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // prevent <details> toggle
                const key = btn.dataset.homeConfigSave;
                let payload;
                if (key === 'timeline') {
                    payload = { timeline: { ...((this.getHomeRoadmapData()?.timeline) || {}), missions: workTimeline } };
                } else if (key === 'knowledge') {
                    payload = { knowledge: { ...((this.getHomeRoadmapData()?.knowledge) || {}), layers: workKnowledge } };
                } else if (key === 'skills.clusters') {
                    payload = { skills: { ...((this.getHomeRoadmapData()?.skills) || {}), clusters: workClusters } };
                } else if (key === 'skills.toolCategories') {
                    payload = { skills: { ...((this.getHomeRoadmapData()?.skills) || {}), toolCategories: workToolCats } };
                } else if (key === 'links') {
                    payload = workLinks;
                }
                if (!payload) return;
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Saving…';
                try {
                    // Save each top-level section key in the payload separately
                    for (const [section, value] of Object.entries(payload)) {
                        await this.saveHomeConfigSection(section, value);
                    }
                    setHomeConfigStatus('Saved. Reload the home page to see changes.');
                } catch (err) {
                    setHomeConfigStatus('Save failed: ' + (err.message || err), true);
                } finally {
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            });
            btn.dataset.bound = 'true';
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

    setupHomeRoadmap() {
        const root = this.contentArea?.querySelector?.('[data-roadmap-root]');
        if (!root) return;

        this.renderHomeRoadmap(root);

        const data = this.getHomeRoadmapData();
        if (!data) return;

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
        const roleHeadline = root.querySelector('[data-role-headline]');
        const roleDescription = root.querySelector('[data-role-description]');
        const roleButtons = Array.from(root.querySelectorAll('[data-role-lens]'));
        const availabilityButtons = Array.from(root.querySelectorAll('[data-availability-view]'));
        const availabilityPanels = Array.from(root.querySelectorAll('[data-availability-panel]'));
        const filterButtons = Array.from(root.querySelectorAll('[data-timeline-filter]'));
        const metricButtons = Array.from(root.querySelectorAll('[data-metric-target]'));
        const missions = Array.from(root.querySelectorAll('.roadmap-mission'));
        const skillButtons = Array.from(root.querySelectorAll('[data-skill-key]'));
        const skillReadoutTitle = root.querySelector('[data-skill-readout-title]');
        const skillReadoutDescription = root.querySelector('[data-skill-readout-description]');
        const metricsHelpButton = root.querySelector('[data-metric-help]');

        const roleLenses = Object.fromEntries((data.roleLenses || []).map((item) => [item.id, {
            headline: item.headline,
            description: item.description
        }]));
        const skillReadouts = data.skills?.readouts || {};

        const setMissionExpanded = (mission, expanded) => {
            const toggle = mission.querySelector('.roadmap-mission-toggle');
            const details = mission.querySelector('.roadmap-mission-details');
            if (!toggle || !details) return;

            mission.classList.toggle('is-expanded', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            details.hidden = !expanded;
        };

        let spotlightTimeout = null;
        const spotlightMission = (mission) => {
            missions.forEach(item => item.classList.remove('is-spotlit'));
            mission.classList.add('is-spotlit');
            window.clearTimeout(spotlightTimeout);
            spotlightTimeout = window.setTimeout(() => {
                mission.classList.remove('is-spotlit');
            }, 1800);
        };

        const applyRoleLens = (lens) => {
            const content = roleLenses[lens] || roleLenses.recruiter;
            root.dataset.activeRole = lens;
            roleButtons.forEach(button => {
                const active = button.dataset.roleLens === lens;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', String(active));
                button.tabIndex = active ? 0 : -1;
            });
            if (roleHeadline) roleHeadline.textContent = content.headline;
            if (roleDescription) roleDescription.textContent = content.description;
        };

        const applyAvailabilityView = (view) => {
            root.dataset.activeAvailabilityView = view;
            availabilityButtons.forEach(button => {
                const active = button.dataset.availabilityView === view;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            availabilityPanels.forEach(panel => {
                const active = panel.dataset.availabilityPanel === view;
                panel.classList.toggle('is-active', active);
                panel.hidden = !active;
            });
        };

        const applyFilter = (filter) => {
            root.dataset.activeFilter = filter;
            filterButtons.forEach(button => {
                const active = button.dataset.timelineFilter === filter;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });

            let hasExpandedVisibleMission = false;

            missions.forEach(mission => {
                const filters = (mission.dataset.filters || '').split(/\s+/).filter(Boolean);
                const match = filter === 'all' || filters.includes(filter);
                mission.classList.toggle('is-filtered-out', !match);
                mission.setAttribute('aria-hidden', String(!match));
                if (!match) {
                    setMissionExpanded(mission, false);
                    return;
                }
                if (mission.classList.contains('is-expanded')) {
                    hasExpandedVisibleMission = true;
                }
            });

            if (!hasExpandedVisibleMission) {
                const firstVisible = missions.find(mission => !mission.classList.contains('is-filtered-out'));
                if (firstVisible) {
                    setMissionExpanded(firstVisible, true);
                }
            }
        };

        const applySkill = (skillKey) => {
            const content = skillReadouts[skillKey] || skillReadouts.automation;
            root.dataset.activeSkill = skillKey;
            skillButtons.forEach(button => {
                const active = button.dataset.skillKey === skillKey;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            if (skillReadoutTitle) skillReadoutTitle.textContent = content.title;
            if (skillReadoutDescription) skillReadoutDescription.textContent = content.description;
        };

        roleButtons.forEach((button, index) => {
            button.addEventListener('click', () => applyRoleLens(button.dataset.roleLens || 'recruiter'));
            button.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const nextIndex = event.key === 'ArrowRight'
                    ? (index + 1) % roleButtons.length
                    : (index - 1 + roleButtons.length) % roleButtons.length;
                roleButtons[nextIndex].focus();
                applyRoleLens(roleButtons[nextIndex].dataset.roleLens || 'recruiter');
            });
        });

        availabilityButtons.forEach(button => {
            button.addEventListener('click', () => applyAvailabilityView(button.dataset.availabilityView || 'recruiter'));
        });

        filterButtons.forEach(button => {
            button.addEventListener('click', () => applyFilter(button.dataset.timelineFilter || 'all'));
        });

        missions.forEach(mission => {
            const toggle = mission.querySelector('.roadmap-mission-toggle');
            if (!toggle) return;
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                missions.forEach(otherMission => {
                    if (otherMission !== mission) {
                        setMissionExpanded(otherMission, false);
                    }
                });
                setMissionExpanded(mission, !expanded);
                if (!expanded && !reduceMotion) {
                    mission.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        });

        metricButtons.forEach(button => {
            const activateMetric = () => {
                metricButtons.forEach(item => item.classList.toggle('is-active', item === button));
            };
            button.addEventListener('mouseenter', activateMetric);
            button.addEventListener('focus', activateMetric);
            button.addEventListener('click', () => {
                activateMetric();
                applyFilter('all');
                const targetId = button.dataset.metricTarget;
                if (!targetId) return;
                const mission = root.querySelector(`#${targetId}`);
                if (!mission) return;
                setMissionExpanded(mission, true);
                spotlightMission(mission);
                if (!reduceMotion) {
                    mission.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        skillButtons.forEach(button => {
            const skillKey = button.dataset.skillKey || 'automation';
            button.setAttribute('aria-pressed', String(button.classList.contains('is-active')));
            button.addEventListener('mouseenter', () => applySkill(skillKey));
            button.addEventListener('focus', () => applySkill(skillKey));
            button.addEventListener('click', () => applySkill(skillKey));
        });

        metricsHelpButton?.addEventListener('click', () => {
            if (roleDescription) {
                roleDescription.textContent = data.metricHelpText || '';
            }
        });

        const countElements = Array.from(root.querySelectorAll('[data-count-to]'));
        const animateCount = (element) => {
            if (element.dataset.counted === 'true') return;
            element.dataset.counted = 'true';

            const targetValue = Number(element.dataset.countTo || 0);
            const suffix = element.dataset.countSuffix || '';
            if (reduceMotion) {
                element.textContent = `${targetValue}${suffix}`;
                return;
            }

            const duration = 900;
            let startTime = null;
            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                const currentValue = Math.round(targetValue * progress);
                element.textContent = `${currentValue}${suffix}`;
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };

            window.requestAnimationFrame(step);
        };

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    animateCount(entry.target);
                    observer.unobserve(entry.target);
                });
            }, { threshold: 0.4 });
            countElements.forEach(element => observer.observe(element));
        } else {
            countElements.forEach(animateCount);
        }

        applyRoleLens(root.dataset.activeRole || data.defaultRole || 'recruiter');
        applyAvailabilityView(root.dataset.activeAvailabilityView || data.defaultAvailabilityView || 'recruiter');
        applyFilter(root.dataset.activeFilter || data.defaultFilter || 'all');
        applySkill(root.dataset.activeSkill || data.defaultSkill || 'automation');
    }

    setupUserStoryAnalyzer() {
        this.applyUserStoryAnalyzerAccess(this.getUserStoryAnalyzerAccess());

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

            if (!this.isAuthedForProtectedPages()) {
                this.showAnalyzerError('Log in with an approved account to unlock the analyzer.');
                this.applyUserStoryAnalyzerAccess(this.getUserStoryAnalyzerAccess());
                return;
            }
            
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
                const data = await this.requestUserStoryAnalysis(story);
                
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
                analyzeBtn.disabled = !this.isAuthedForProtectedPages();
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

    applyUserStoryAnalyzerAccess(access) {
        const featureEl = document.getElementById('user-story-analyzer-feature');
        if (!featureEl) return;

        const normalized = access || this.getUserStoryAnalyzerAccess();
        const isLocked = !normalized.canUseFeature;
        featureEl.classList.toggle('is-locked', isLocked);
        featureEl.setAttribute('aria-disabled', String(isLocked));

        const controls = featureEl.querySelectorAll('textarea, input, button, select');
        controls.forEach(control => {
            control.disabled = isLocked;
            control.setAttribute('aria-disabled', String(isLocked));
            control.tabIndex = isLocked ? -1 : 0;
        });

        const lockEl = document.getElementById('user-story-analyzer-lock-message');
        if (!lockEl) return;

        const titleEl = lockEl.querySelector('strong');
        const detailEl = lockEl.querySelector('span');
        const actionEl = lockEl.querySelector('a[data-route="login"]');
        if (titleEl) titleEl.textContent = normalized.lockedMessage;
        if (detailEl) detailEl.textContent = normalized.lockedDetail;
        if (actionEl) actionEl.classList.toggle('d-none', Boolean(normalized.isAuthenticated));
    }

    async requestUserStoryAnalysis(story) {
        const supabaseUrl = this.authConfig?.supabase?.url || '';
        const anonKey = this.authConfig?.supabase?.anonKey || '';
        const accessToken = await this.getCurrentAccessToken();

        if (!supabaseUrl || !anonKey || !accessToken) {
            throw new Error('Log in with an approved account to unlock the analyzer.');
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/user-story-analyzer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'apikey': anonKey
            },
            body: JSON.stringify({ story_content: story })
        });

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : { error: await response.text() };

        if (!response.ok) {
            throw new Error(data?.error || `Analyzer request failed with status ${response.status}.`);
        }

        return data;
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
