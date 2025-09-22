class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        this.navLinks = Array.from(document.querySelectorAll('.nav-link'));
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            'prompt-explained': 'content/prompt-explained.html'
        };
        this.currentPage = '';
        this.navContainer = document.getElementById('primaryNav');
        this.promptEscapeHandler = null;
        this.init();
    }

    init() {
        this.navLinks.forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const targetPage = link.getAttribute('href').replace('#', '') || 'home';
                this.navigate(targetPage);
            });
        });

        window.addEventListener('popstate', (event) => {
            const page = event.state?.page || 'home';
            this.navigate(page, false);
        });

        const initialPage = window.location.hash.replace('#', '') || 'home';
        this.navigate(initialPage, false);
    }

    async navigate(page, pushState = true) {
        if (!this.routes[page]) {
            page = 'home';
        }

        if (this.currentPage === page) {
            this.closeMobileNav();
            return;
        }

        try {
            if (pushState) {
                history.pushState({ page }, '', `#${page}`);
            }

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

    setActiveLink(page) {
        this.navLinks.forEach(link => {
            const linkPage = link.getAttribute('href').replace('#', '') || 'home';
            link.classList.toggle('active', linkPage === page);
        });
    }

    updatePageTitle(page) {
        const titles = {
            'home': "Douglas D'Avila | QA Automation Engineer & SDET",
            'about': "About Douglas D'Avila | QA Automation Engineer & SDET",
            'prompt-explained': 'Automation Prompt Analysis | Douglas D\'Avila'
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

    const icon = toggleBtn.querySelector('.theme-icon');
    const label = toggleBtn.querySelector('.theme-label');
    const body = document.body;
    const storageKey = 'preferred-theme';

    const applyTheme = (theme, persist = true) => {
        const normalized = theme === 'light' ? 'light' : 'dark';
        body.setAttribute('data-bs-theme', normalized);
        toggleBtn.setAttribute('aria-pressed', String(normalized === 'dark'));
        if (icon) {
            icon.classList.remove('fa-moon', 'fa-sun');
            icon.classList.add(normalized === 'dark' ? 'fa-moon' : 'fa-sun');
        }
        if (label) {
            label.textContent = normalized === 'dark' ? 'Dark' : 'Light';
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

window.addEventListener('DOMContentLoaded', () => {
    new SPARouter();
    initThemeToggle();
});
