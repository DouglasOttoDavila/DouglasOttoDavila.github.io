// Modal and highlight logic
window.addEventListener('DOMContentLoaded', function() {
    function setupModal(highlightId, modalId) {
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
    pairs.forEach(([highlightId, modalId]) => setupModal(highlightId, modalId));
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

// Download markdown functionality
window.addEventListener('DOMContentLoaded', function() {
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
});
