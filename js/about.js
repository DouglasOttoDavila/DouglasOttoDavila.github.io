// About Me Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize animations
    initializeAnimations();
    
    // Add scroll animations
    observeElements();
    
    // Add interactive elements
    addInteractiveEffects();
});

function initializeAnimations() {
    // Initialize intro-card animation
    const introCard = document.querySelector('.intro-card');
    if (introCard) {
        setTimeout(() => {
            introCard.classList.add('animate');
        }, 200);
    }
    
    // Add staggered animation delays to timeline items
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.2}s`;
    });
    
    // Add staggered animation delays to skill tags
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach((tag, index) => {
        tag.style.animationDelay = `${index * 0.1}s`;
    });
    
    // Add staggered animation delays to certification items
    const certItems = document.querySelectorAll('.cert-item');
    certItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.15}s`;
    });
}

function observeElements() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                
                // Special handling for timeline items
                if (entry.target.classList.contains('timeline-item')) {
                    animateTimelineItem(entry.target);
                }
                
                // Special handling for skill tags
                if (entry.target.classList.contains('skills-list')) {
                    animateSkillTags(entry.target);
                }
                
                // Special handling for contact items
                if (entry.target.classList.contains('contact-grid')) {
                    animateContactItems(entry.target);
                }
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const elementsToObserve = document.querySelectorAll('.slide-up, .timeline-item, .skills-list, .contact-grid');
    elementsToObserve.forEach(el => observer.observe(el));
}

function animateTimelineItem(timelineItem) {
    const marker = timelineItem.querySelector('.timeline-marker');
    const content = timelineItem.querySelector('.timeline-content');
    
    if (marker) {
        setTimeout(() => {
            marker.style.animation = 'pulse 2s infinite, scaleIn 0.6s ease-out';
        }, 200);
    }
    
    if (content) {
        setTimeout(() => {
            content.style.animation = 'slideUp 0.8s ease-out';
        }, 400);
    }
}

function animateSkillTags(skillsList) {
    const tags = skillsList.querySelectorAll('.skill-tag');
    tags.forEach((tag, index) => {
        setTimeout(() => {
            tag.style.animation = 'scaleIn 0.6s ease-out';
            tag.style.animationFillMode = 'both';
        }, index * 100);
    });
}

function animateContactItems(contactGrid) {
    const items = contactGrid.querySelectorAll('.contact-item');
    items.forEach((item, index) => {
        setTimeout(() => {
            item.style.animation = 'slideUp 0.6s ease-out';
            item.style.animationFillMode = 'both';
        }, index * 150);
    });
}

function addInteractiveEffects() {
    // Add hover effects to timeline items
    const timelineItems = document.querySelectorAll('.timeline-content');
    timelineItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add click effects to skill tags
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach(tag => {
        tag.addEventListener('click', function() {
            this.style.animation = 'pulse 0.6s ease-out';
            setTimeout(() => {
                this.style.animation = '';
            }, 600);
        });
    });
    
    // Add smooth scrolling for internal links
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add parallax effect to hero section
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const heroSection = document.querySelector('.hero-section');
        
        if (heroSection) {
            const rate = scrolled * -0.5;
            heroSection.style.transform = `translateY(${rate}px)`;
        }
    });
    
    // Add typing effect to hero subtitle
    addTypingEffect();
    
    // Add floating animation to CTA card
    addFloatingAnimation();
}

function addTypingEffect() {
    const subtitle = document.querySelector('.hero-subtitle');
    if (!subtitle) return;
    
    const text = subtitle.textContent;
    subtitle.textContent = '';
    
    let i = 0;
    const typeInterval = setInterval(() => {
        if (i < text.length) {
            subtitle.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(typeInterval);
            // Add cursor blink effect
            const cursor = document.createElement('span');
            cursor.className = 'typing-cursor';
            cursor.textContent = '|';
            cursor.style.animation = 'blink 1s infinite';
            subtitle.appendChild(cursor);
        }
    }, 50);
    
    // Add CSS for cursor blink animation
    if (!document.querySelector('#typing-cursor-style')) {
        const style = document.createElement('style');
        style.id = 'typing-cursor-style';
        style.textContent = `
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
            .typing-cursor {
                color: var(--accent);
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    }
}

function addFloatingAnimation() {
    const ctaCard = document.querySelector('.cta-card');
    if (!ctaCard) return;
    
    // Add floating animation CSS
    if (!document.querySelector('#floating-animation-style')) {
        const style = document.createElement('style');
        style.id = 'floating-animation-style';
        style.textContent = `
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
            }
            .floating {
                animation: float 6s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Apply floating animation when in view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('floating');
            }
        });
    }, { threshold: 0.5 });
    
    observer.observe(ctaCard);
}

// Add additional interactive features
document.addEventListener('DOMContentLoaded', function() {
    // Add click-to-copy functionality for contact info
    addClickToCopyFeature();
    
    // Add progress indicators for experience section
    addProgressIndicators();
    
    // Add particle effects for skill tags
    addParticleEffects();
});

function addClickToCopyFeature() {
    const emailItem = document.querySelector('.contact-item:has(i.fa-envelope)');
    const phoneItem = document.querySelector('.contact-item:has(i.fa-phone)');
    
    if (emailItem) {
        emailItem.style.cursor = 'pointer';
        emailItem.addEventListener('click', function() {
            const email = 'douglas.odavila@gmail.com';
            navigator.clipboard.writeText(email).then(() => {
                showToast('Email copied to clipboard!');
            });
        });
    }
    
    if (phoneItem) {
        phoneItem.style.cursor = 'pointer';
        phoneItem.addEventListener('click', function() {
            const phone = '+55 51 981270800';
            navigator.clipboard.writeText(phone).then(() => {
                showToast('Phone number copied to clipboard!');
            });
        });
    }
}

function showToast(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--accent);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 25px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideUp 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
    
    // Add fadeOut animation if not exists
    if (!document.querySelector('#toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.textContent = `
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(20px); }
            }
        `;
        document.head.appendChild(style);
    }
}

function addProgressIndicators() {
    // Add progress bars to timeline items showing duration
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach(item => {
        const duration = item.querySelector('.duration');
        if (duration) {
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.cssText = `
                height: 4px;
                background: var(--accent);
                border-radius: 2px;
                margin-top: 0.5rem;
                transform: scaleX(0);
                transform-origin: left;
                transition: transform 1s ease-out;
            `;
            duration.appendChild(progressBar);
            
            // Animate progress bar when in view
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setTimeout(() => {
                            progressBar.style.transform = 'scaleX(1)';
                        }, 500);
                    }
                });
            }, { threshold: 0.5 });
            
            observer.observe(item);
        }
    });
}

function addParticleEffects() {
    // Add subtle particle effect to skill tags on hover
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach(tag => {
        tag.addEventListener('mouseenter', function() {
            createParticles(this);
        });
    });
}

function createParticles(element) {
    const rect = element.getBoundingClientRect();
    const particleCount = 5;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: fixed;
            width: 4px;
            height: 4px;
            background: var(--accent);
            border-radius: 50%;
            pointer-events: none;
            z-index: 1000;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height / 2}px;
        `;
        
        document.body.appendChild(particle);
        
        // Animate particle
        const angle = (i / particleCount) * 2 * Math.PI;
        const distance = 50;
        const endX = rect.left + rect.width / 2 + Math.cos(angle) * distance;
        const endY = rect.top + rect.height / 2 + Math.sin(angle) * distance;
        
        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${endX - rect.left - rect.width / 2}px, ${endY - rect.top - rect.height / 2}px) scale(0)`, opacity: 0 }
        ], {
            duration: 600,
            easing: 'ease-out'
        }).onfinish = () => {
            document.body.removeChild(particle);
        };
    }
}
