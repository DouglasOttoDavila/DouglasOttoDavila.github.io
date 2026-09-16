// Switching presentation never replaces the DOM or remounts a tool island.
type Version = 'studio' | 'terminal';
let version: Version = document.documentElement.dataset.theme === 'terminal' ? 'terminal' : 'studio';
let observer: IntersectionObserver | undefined;
function apply() {
  document.documentElement.dataset.theme = version;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', version === 'terminal' ? '#090E14' : '#FAFBF8');
  document.querySelectorAll<HTMLElement>('.version-switch').forEach(el => { el.hidden = false; });
  document.querySelectorAll<HTMLButtonElement>('[data-version]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.version === version)));
  document.querySelectorAll<HTMLAnchorElement>('[data-work-nav]').forEach(link => {
    link.href = version === 'terminal' ? '/work' : '/#work';
    if (version === 'terminal') {
      delete link.dataset.section;
      if (location.pathname.startsWith('/work')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    } else link.dataset.section = 'work';
  });
}
document.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-version]');
  if (!button) return;
  version = button.dataset.version === 'terminal' ? 'terminal' : 'studio';
  try { localStorage.setItem('portfolio-version', version); } catch { /* Current visit still works without storage. */ }
  apply();
});
window.addEventListener('storage', event => {
  if (event.key !== 'portfolio-version' && event.key !== null) return;
  version = event.newValue === 'terminal' ? 'terminal' : 'studio';
  apply();
});
document.addEventListener('astro:before-swap', event => {
  (event as Event & { newDocument: Document }).newDocument.documentElement.dataset.theme = version;
});
function initialize() {
  apply();
  observer?.disconnect();
  observer = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.classList.toggle('in-view', entry.isIntersecting);
    if (entry.isIntersecting) entry.target.classList.add('revealed');
  }), { threshold: 0.15 });
  document.querySelectorAll('.terminal-cursor, .terminal-delivery').forEach(el => observer?.observe(el));
}
document.addEventListener('visibilitychange', () => { document.documentElement.classList.toggle('motion-paused', document.hidden); });
document.addEventListener('astro:page-load', initialize);
document.addEventListener('astro:before-swap', () => observer?.disconnect());
initialize();
