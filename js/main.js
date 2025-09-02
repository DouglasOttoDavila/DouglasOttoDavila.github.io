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
            // Re-initialize highlight.js with a small delay to ensure DOM is ready
            setTimeout(() => {
                if (window.hljs) {
                    window.hljs.highlightAll();
                }
            }, 50);
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

// Smooth Skills Animation Controller
class SkillsAnimationController {
    constructor() {
        this.skillsContainer = null;
        this.skills = [];
        this.isHovering = false;
        this.returnAnimations = new Map();
        this.init();
    }

    init() {
        // Wait for DOM to be ready and check for skills periodically
        this.checkForSkills();
    }

    checkForSkills() {
        const skillsContainer = document.querySelector('.skills');
        if (skillsContainer) {
            this.setupSkillsAnimation(skillsContainer);
        } else {
            // Retry after a short delay if skills not found
            setTimeout(() => this.checkForSkills(), 100);
        }
    }

    setupSkillsAnimation(skillsContainer) {
        this.skillsContainer = skillsContainer;
        this.skills = Array.from(skillsContainer.querySelectorAll('.skill'));
        
        if (this.skills.length === 0) {
            setTimeout(() => this.checkForSkills(), 100);
            return;
        }

        console.log('Found skills:', this.skills.length); // Debug log

        // Add event listeners
        skillsContainer.addEventListener('mouseenter', () => this.handleHoverStart());
        skillsContainer.addEventListener('mouseleave', () => this.handleHoverEnd());
        
        // Touch events for mobile
        skillsContainer.addEventListener('touchstart', () => this.handleHoverStart());
        skillsContainer.addEventListener('touchend', () => this.handleHoverEnd());
    }

    handleHoverStart() {
        console.log('Hover start'); // Debug log
        this.isHovering = true;
        // Clear any ongoing return animations
        this.returnAnimations.forEach((animation) => {
            animation.cancel();
        });
        this.returnAnimations.clear();
        
        // Remove JavaScript animation control and reset to CSS control
        this.skills.forEach(skill => {
            skill.classList.remove('js-animating');
            skill.style.transform = '';
        });
    }

    handleHoverEnd() {
        console.log('Hover end'); // Debug log
        this.isHovering = false;
        
        // Immediately capture positions while CSS animations are still running
        // BEFORE removing the hover class
        const currentPositions = this.skills.map((skill, index) => {
            const transform = this.getCurrentTransform(skill);
            console.log(`Captured position for skill ${index} while animating:`, transform);
            return transform;
        });
        
        // Stop any ongoing return animations
        this.returnAnimations.forEach((animation, skill) => {
            animation.cancel();
        });
        this.returnAnimations.clear();
        
        // Remove hover state AFTER capturing positions
        this.skillsSection.classList.remove('hovered');
        
        // Start JavaScript-controlled return animation
        this.animateSkillsReturn(currentPositions);
    }

    getCurrentTransform(element) {
        const computedStyle = window.getComputedStyle(element);
        const transform = computedStyle.transform;
        
        console.log('Current transform:', transform); // Debug log
        
        if (transform === 'none' || !transform) {
            return { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
        }

        // Parse matrix transform
        const matrixMatch = transform.match(/matrix.*\((.+)\)/);
        if (matrixMatch) {
            const values = matrixMatch[1].split(/,\s*/).map(parseFloat);
            console.log('Matrix values:', values); // Debug log
            
            const result = {
                translateX: values[4] || 0,
                translateY: values[5] || 0,
                rotate: Math.atan2(values[1], values[0]) * (180 / Math.PI) || 0,
                scale: Math.sqrt(values[0] * values[0] + values[1] * values[1]) || 1
            };
            console.log('Parsed transform:', result); // Debug log
            return result;
        }

        return { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
    }

    animateSkillsReturn(capturedPositions) {
        console.log('Starting return animation with captured positions'); // Debug log
        
        this.skills.forEach((skill, index) => {
            // Add class to disable CSS animations
            skill.classList.add('js-animating');
            
            // Use the captured position instead of reading current position
            const currentTransform = capturedPositions[index];
            
            console.log(`Skill ${index} using captured position:`, currentTransform); // Debug log
            
            // Only animate if the element is not already at center
            const isAtCenter = Math.abs(currentTransform.translateX) < 1 && 
                              Math.abs(currentTransform.translateY) < 1 && 
                              Math.abs(currentTransform.rotate) < 1;
            
            if (isAtCenter) {
                console.log(`Skill ${index} already at center`); // Debug log
                skill.classList.remove('js-animating');
                return;
            }
            
            // Set the current position explicitly before starting animation
            skill.style.transform = `translate(${currentTransform.translateX}px, ${currentTransform.translateY}px) rotate(${currentTransform.rotate}deg) scale(${currentTransform.scale})`;
            
            // Force a reflow
            skill.offsetHeight;
            
            // Create smooth return animation using Web Animations API
            const animation = skill.animate([
                {
                    transform: `translate(${currentTransform.translateX}px, ${currentTransform.translateY}px) rotate(${currentTransform.rotate}deg) scale(${currentTransform.scale})`,
                    offset: 0
                },
                {
                    transform: 'translate(0px, 0px) rotate(0deg) scale(1)',
                    offset: 1
                }
            ], {
                duration: 1500,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'forwards'
            });

            this.returnAnimations.set(skill, animation);

            // Clean up after animation completes
            animation.addEventListener('finish', () => {
                console.log(`Skill ${index} return animation finished`); // Debug log
                this.returnAnimations.delete(skill);
                skill.classList.remove('js-animating');
                // Set final position explicitly
                skill.style.transform = 'translate(0px, 0px) rotate(0deg) scale(1)';
            });
            
            animation.addEventListener('cancel', () => {
                console.log(`Skill ${index} return animation cancelled`); // Debug log
                this.returnAnimations.delete(skill);
                skill.classList.remove('js-animating');
            });
        });
    }
}

// Dark mode toggle functionality
window.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (toggleBtn) {
        const setTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            toggleBtn.setAttribute('aria-checked', theme === 'dark');
            
            // Update the icon
            const iconElement = toggleBtn.querySelector('.toggle-icon');
            if (iconElement) {
                iconElement.textContent = ''; // Clear text, let CSS pseudo-element handle it
            }
        };
        
        const storedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(storedTheme || (prefersDark ? 'dark' : 'light'));
        
        const toggleTheme = () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        };
        
        // Handle click events
        toggleBtn.addEventListener('click', toggleTheme);
        
        // Handle keyboard events for accessibility
        toggleBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
            }
        });
    }

    // Profile Image Animation Controller
    function initProfileImageAnimation() {
        const profileImage = document.querySelector('.profile-image');
        
        if (profileImage) {
            // Add loading animation delay to start pulse after initial load completes
            setTimeout(() => {
                profileImage.classList.add('loaded');
            }, 1200); // Match the duration of profileImageLoad animation

            // Add interactive hover effects
            profileImage.addEventListener('mouseenter', () => {
                profileImage.style.animationPlayState = 'paused';
            });

            profileImage.addEventListener('mouseleave', () => {
                profileImage.style.animationPlayState = 'running';
            });

            // Image expansion functionality
            profileImage.addEventListener('click', () => {
                expandProfileImage();
            });
        }
    }

    // Profile Image Expansion Functionality
    function expandProfileImage() {
        const profileImage = document.querySelector('.profile-image');
        if (!profileImage) return;

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'profile-image-modal';
        
        // Create expanded image
        const expandedImage = document.createElement('img');
        expandedImage.src = profileImage.src;
        expandedImage.alt = profileImage.alt;
        expandedImage.className = 'profile-image-expanded';
        
        modal.appendChild(expandedImage);
        document.body.appendChild(modal);

        // Prevent body scrolling
        document.body.style.overflow = 'hidden';

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);

        // Close modal on click
        const closeModal = () => {
            modal.classList.remove('show');
            document.body.style.overflow = '';
            
            setTimeout(() => {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }, 300);
        };

        // Event listeners for closing
        modal.addEventListener('click', closeModal);
        expandedImage.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    // Initialize profile image animations
    initProfileImageAnimation();

    // Initialize hamburger menu
    initHamburgerMenu();

    // Skills animations are now handled purely by CSS - no JavaScript needed
    // new SkillsAnimationController();
});

// Hamburger Menu Controller
function initHamburgerMenu() {
    const hamburgerButton = document.getElementById('hamburger-menu');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    
    if (!hamburgerButton || !navMenu) return;

    let isMenuOpen = false;

    // Toggle menu function
    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
        
        if (isMenuOpen) {
            // Opening the menu
            hamburgerButton.classList.add('active');
            navMenu.classList.add('active');
            hamburgerButton.setAttribute('aria-expanded', 'true');
            
            // Prevent body scroll when menu is open
            document.body.style.overflow = 'hidden';
            
            // Add event listeners for closing menu
            document.addEventListener('keydown', handleEscapeKey);
        } else {
            // Closing the menu
            hamburgerButton.classList.remove('active');
            hamburgerButton.setAttribute('aria-expanded', 'false');
            
            // Add closing animation class before removing active
            navMenu.classList.add('closing');
            
            // Remove active class after animation delay
            setTimeout(() => {
                navMenu.classList.remove('active', 'closing');
                document.body.style.overflow = '';
            }, 300);
            
            // Remove event listeners
            document.removeEventListener('keydown', handleEscapeKey);
        }
    }

    // Close menu function
    function closeMenu() {
        if (isMenuOpen) {
            toggleMenu();
        }
    }

    // Handle escape key
    function handleEscapeKey(e) {
        if (e.key === 'Escape') {
            closeMenu();
        }
    }

    // Handle clicks outside menu
    function handleOutsideClick(e) {
        if (isMenuOpen && !navMenu.contains(e.target) && !hamburgerButton.contains(e.target)) {
            closeMenu();
        }
    }

    // Event listeners
    hamburgerButton.addEventListener('click', toggleMenu);
    document.addEventListener('click', handleOutsideClick);
    
    // Close menu when navigation link is clicked
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeMenu();
        });
    });

    // Handle window resize - close menu on larger screens if open
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && isMenuOpen) {
            closeMenu();
        }
    });
}

// LinkedIn Posts Carousel Controller
class LinkedInCarousel {
    constructor() {
        this.currentSlide = 0;
        this.totalSlides = 0;
        this.autoplayInterval = null;
        this.autoplayDuration = 5000; // 5 seconds
        this.isAutoplayActive = true;
        this.progressBar = null;
        this.progressInterval = null;
        this.init();
    }

    init() {
        // Wait for the carousel to be loaded in the DOM
        this.checkForCarousel();
    }

    checkForCarousel() {
        const carousel = document.querySelector('.carousel-container');
        if (carousel) {
            this.setupCarousel();
        } else {
            // Retry after a short delay if carousel not found
            setTimeout(() => this.checkForCarousel(), 100);
        }
    }

    setupCarousel() {
        this.track = document.getElementById('carousel-track');
        this.slides = document.querySelectorAll('.carousel-slide');
        this.prevBtn = document.getElementById('carousel-prev');
        this.nextBtn = document.getElementById('carousel-next');
        this.dots = document.querySelectorAll('.carousel-dot');
        this.autoplayBtn = document.getElementById('carousel-autoplay');
        this.container = document.querySelector('.carousel-container');
        
        if (!this.track || this.slides.length === 0) {
            setTimeout(() => this.checkForCarousel(), 100);
            return;
        }

        this.totalSlides = this.slides.length;
        
        console.log('Carousel initialized with', this.totalSlides, 'slides');

        // Setup event listeners
        this.setupEventListeners();
        
        // Create progress bar
        this.createProgressBar();
        
        // Start autoplay
        this.startAutoplay();
        
        // Initialize first slide
        this.updateCarousel();
    }

    setupEventListeners() {
        // Navigation buttons
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.previousSlide());
        }
        
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.nextSlide());
        }

        // Dot indicators
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide(index));
        });

        // Autoplay toggle
        if (this.autoplayBtn) {
            this.autoplayBtn.addEventListener('click', () => this.toggleAutoplay());
        }

        // Pause autoplay on hover
        if (this.container) {
            this.container.addEventListener('mouseenter', () => this.pauseAutoplay());
            this.container.addEventListener('mouseleave', () => this.resumeAutoplay());
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isCarouselVisible()) return;
            
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousSlide();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextSlide();
            }
        });

        // Touch/swipe support
        this.setupTouchEvents();
    }

    setupTouchEvents() {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        this.container.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            this.pauseAutoplay();
        });

        this.container.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
        });

        this.container.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            
            const diffX = startX - currentX;
            const threshold = 50;

            if (Math.abs(diffX) > threshold) {
                if (diffX > 0) {
                    this.nextSlide();
                } else {
                    this.previousSlide();
                }
            }
            
            this.resumeAutoplay();
        });
    }

    createProgressBar() {
        // Progress bar is now handled by CSS ::after pseudo-element on carousel-wrapper
        // We'll control it by setting a CSS custom property
        this.wrapper = document.querySelector('.carousel-wrapper');
    }

    updateProgressBar() {
        if (!this.wrapper || !this.isAutoplayActive) {
            if (this.wrapper) {
                this.wrapper.style.setProperty('--progress-width', '0%');
            }
            return;
        }

        let progress = 0;
        this.progressInterval = setInterval(() => {
            progress += 100 / (this.autoplayDuration / 100);
            this.wrapper.style.setProperty('--progress-width', progress + '%');
            
            if (progress >= 100) {
                clearInterval(this.progressInterval);
                this.wrapper.style.setProperty('--progress-width', '0%');
            }
        }, 100);
    }

    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.totalSlides;
        this.updateCarousel();
        this.resetAutoplay();
    }

    previousSlide() {
        this.currentSlide = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.updateCarousel();
        this.resetAutoplay();
    }

    goToSlide(index) {
        this.currentSlide = index;
        this.updateCarousel();
        this.resetAutoplay();
    }

    updateCarousel() {
        // Update track position
        const translateX = -this.currentSlide * 11.11; // 11.11% per slide (100% / 9 slides)
        this.track.style.transform = `translateX(${translateX}%)`;

        // Update slide states
        this.slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentSlide);
        });

        // Update dots
        this.dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentSlide);
        });

        console.log('Updated to slide', this.currentSlide);
    }

    startAutoplay() {
        if (!this.isAutoplayActive) return;
        
        this.autoplayInterval = setInterval(() => {
            this.nextSlide();
        }, this.autoplayDuration);
        
        this.updateProgressBar();
    }

    stopAutoplay() {
        if (this.autoplayInterval) {
            clearInterval(this.autoplayInterval);
            this.autoplayInterval = null;
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        if (this.wrapper) {
            this.wrapper.style.setProperty('--progress-width', '0%');
        }
    }

    pauseAutoplay() {
        this.stopAutoplay();
    }

    resumeAutoplay() {
        if (this.isAutoplayActive) {
            this.startAutoplay();
        }
    }

    resetAutoplay() {
        this.stopAutoplay();
        if (this.isAutoplayActive) {
            this.startAutoplay();
        }
    }

    toggleAutoplay() {
        this.isAutoplayActive = !this.isAutoplayActive;
        
        if (this.isAutoplayActive) {
            this.autoplayBtn.innerHTML = '<i class="fas fa-pause"></i>';
            this.autoplayBtn.classList.remove('paused');
            this.startAutoplay();
        } else {
            this.autoplayBtn.innerHTML = '<i class="fas fa-play"></i>';
            this.autoplayBtn.classList.add('paused');
            this.stopAutoplay();
        }
    }

    isCarouselVisible() {
        return this.container && this.container.offsetParent !== null;
    }
}

// Initialize carousel when DOM is loaded and when home page is loaded
window.addEventListener('DOMContentLoaded', function() {
    // Initialize carousel after a delay to ensure content is loaded
    setTimeout(() => {
        new LinkedInCarousel();
    }, 500);
});

// Also initialize when navigating to home page
document.addEventListener('DOMContentLoaded', function() {
    // Listen for home page loads
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        if (window.location.hash === '#home' || window.location.hash === '') {
            setTimeout(() => {
                new LinkedInCarousel();
            }, 500);
        }
    };
});
