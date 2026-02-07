class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        this.navLinks = Array.from(document.querySelectorAll('[data-route]'));
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            'prompt-explained': 'content/prompt-explained.html',
            'user-story-analyzer': 'content/user-story-analyzer.html'
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
                const targetPage = link.dataset.route || 'home';
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
            'user-story-analyzer': 'User Story Quality Analyzer | Douglas D\'Avila'
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

    const icon = toggleBtn.querySelector('.theme-icon');
    const label = toggleBtn.querySelector('.theme-label');
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
    new SPARouter();
    initThemeToggle();
    initDropdownSubmenus();
});
