// SPA Navigation System
class SPARouter {
    constructor() {
        this.contentArea = document.getElementById('content-area');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.routes = {
            'home': 'content/home.html',
            'about': 'content/about.html',
            'prompt-explained': 'content/prompt-explained.html'
        };
        this.currentPage = '';
        this.init();
    }

    init() {
        // Handle navigation clicks
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('href').substring(1); // Remove #
                this.navigate(page);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            const page = e.state?.page || 'home';
            this.navigate(page, false);
        });

        // Load initial page
        const initialPage = window.location.hash.substring(1) || 'home';
        this.navigate(initialPage, false);
    }

    async navigate(page, pushState = true) {
        if (this.currentPage === page) return;

        try {
            // Update URL
            if (pushState) {
                history.pushState({ page }, '', `#${page}`);
            }

            // Update navigation
            this.updateNavigation(page);

            // Load content
            await this.loadContent(page);

            this.currentPage = page;

            // Update page title
            this.updatePageTitle(page);

        } catch (error) {
            console.error('Navigation error:', error);
            this.showError('Failed to load page content');
        }
    }

    async loadContent(page) {
        const route = this.routes[page];
        if (!route) {
            this.showError('Page not found');
            return;
        }

        try {
            const response = await fetch(route);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const content = await response.text();
            this.contentArea.innerHTML = content;

            // Re-initialize page-specific functionality
            this.initializePageScripts(page);

        } catch (error) {
            console.error('Failed to load content:', error);
            this.showError('Failed to load page content');
        }
    }

    updateNavigation(page) {
        this.navLinks.forEach(link => {
            const linkPage = link.getAttribute('href').substring(1);
            if (linkPage === page) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    updatePageTitle(page) {
        const titles = {
            'home': 'Douglas D\'Avila | QA Automation Engineer & SDET',
            'about': 'About Me | Douglas D\'Avila | QA Automation Engineer & SDET',
            'prompt-explained': 'Automation Prompt Analysis | Douglas D\'Avila'
        };
        document.title = titles[page] || titles['home'];
    }

    initializePageScripts(page) {
        if (page === 'prompt-explained') {
            // Re-initialize highlight.js
            if (window.hljs) {
                window.hljs.highlightAll();
            }
            // Re-initialize modal functionality
            this.setupModals();
            // Re-initialize download functionality
            this.setupDownloadButton();
        } else if (page === 'about') {
            // Initialize about page specific scripts
            this.setupAboutPageAnimations();
        } else if (page === 'home') {
            // Initialize home page animations
            this.setupHomePageAnimations();
        }
    }

    setupModals() {
        const pairs = [
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

        pairs.forEach(([highlightId, modalId]) => {
            this.setupModal(highlightId, modalId);
        });
    }

    setupModal(highlightId, modalId) {
        const highlight = document.getElementById(highlightId);
        const modal = document.getElementById(modalId);
        if (highlight && modal) {
            highlight.addEventListener('click', () => {
                modal.style.display = 'flex';
            });
            
            // Close modal when clicking outside the modal content
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
            
            // Close modal when pressing Escape key
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && modal.style.display === 'flex') {
                    modal.style.display = 'none';
                }
            });
        }
    }

    setupDownloadButton() {
        const downloadBtn = document.getElementById('download-md');
        
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                try {
                    // Fetch the markdown file
                    const response = await fetch('prompt_explained.md');
                    if (!response.ok) {
                        throw new Error('Failed to fetch markdown file');
                    }
                    
                    const markdownContent = await response.text();
                    
                    // Create a blob and download link
                    const blob = new Blob([markdownContent], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    
                    // Create temporary download link
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'automation-prompt-analysis.md';
                    document.body.appendChild(a);
                    a.click();
                    
                    // Cleanup
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    // Visual feedback
                    const originalText = downloadBtn.textContent;
                    downloadBtn.textContent = '✅ Downloaded!';
                    downloadBtn.style.background = '#4caf50';
                    downloadBtn.style.borderColor = '#4caf50';
                    
                    setTimeout(() => {
                        downloadBtn.textContent = originalText;
                        downloadBtn.style.background = '';
                        downloadBtn.style.borderColor = '';
                    }, 2000);
                    
                } catch (error) {
                    console.error('Download failed:', error);
                    
                    // Error feedback
                    const originalText = downloadBtn.textContent;
                    downloadBtn.textContent = '❌ Download Failed';
                    downloadBtn.style.background = '#f44336';
                    downloadBtn.style.borderColor = '#f44336';
                    
                    setTimeout(() => {
                        downloadBtn.textContent = originalText;
                        downloadBtn.style.background = '';
                        downloadBtn.style.borderColor = '';
                    }, 3000);
                }
            });
        }
    }

    setupAboutPageAnimations() {
        // Add fade-in and slide-up animations for about page elements
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate');
                }
            });
        }, observerOptions);

        // Observe elements with animation classes
        document.querySelectorAll('.fade-in, .slide-up').forEach(el => {
            observer.observe(el);
        });
    }

    setupHomePageAnimations() {
        // Trigger slide-up animation for intro-card
        const introCard = document.querySelector('.intro-card');
        if (introCard) {
            // Small delay to ensure the element is properly rendered
            setTimeout(() => {
                introCard.classList.add('animate');
            }, 100);
        }
    }

    showError(message) {
        this.contentArea.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text);">
                <h2>Error</h2>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Reload Page
                </button>
            </div>
        `;
    }
}

// Initialize SPA when DOM is loaded
window.addEventListener('DOMContentLoaded', function() {
    new SPARouter();
});

// Dark mode toggle functionality
window.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (toggleBtn) {
        const setTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            toggleBtn.textContent = theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
        };
        
        const storedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(storedTheme || (prefersDark ? 'dark' : 'light'));
        
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
});
