import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const nativeControls = 'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="tablist"], [role="slider"], [role="listbox"], [role="menu"], [role="tree"], [role="grid"], [role="combobox"], [role="spinbutton"], [role="textbox"], .graph-stage, [data-lenis-prevent]';
// Main narrative blocks only: never individual cards, rows or graph nodes.
const sections = [
  '#main-content > section', '#main-content > header',
  '.case-study > header', '.case-study-body > h2', '.case-study-links',
  '.lab-shell > header', '.lab-app > .lab-access', '.lab-app > .tool-workspace',
  '.lab-app > .graph-workspace', '.graph-workspace > section', '.graph-workspace > .tool-workspace',
  '.settings-workspace > .tool-workspace', '.settings-workspace > .settings-section',
].join(',');
let dispose: (() => void) | undefined;

function ownsScroll(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(nativeControls)) return true;
  for (let node: Element | null = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if ((/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) ||
        (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth)) return true;
  }
  return false;
}

// Measure on each gesture to include hydration, disclosures and responsive changes.
function destinations(): number[] {
  const height = window.innerHeight;
  const header = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0;
  const available = Math.max(100, height - header);
  const gutter = Math.min(48, height * 0.06);
  const limit = Math.max(0, document.documentElement.scrollHeight - height);
  const points = [0, limit];
  const nodes = [...document.querySelectorAll<HTMLElement>(sections)]
    .filter(node => node.getClientRects().length && !node.closest('[hidden], [inert]'));
  for (const [index, node] of nodes.entries()) {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const top = rect.top + scrollY + parseFloat(style.paddingTop);
    let bottom = rect.bottom + scrollY - parseFloat(style.paddingBottom);
    if (node.matches('.graph-workspace')) {
      const detail = node.querySelector(':scope > .tool-workspace');
      if (detail) bottom = detail.getBoundingClientRect().top + scrollY - gutter;
    }
    if (node.matches('.case-study-body > h2')) {
      const next = nodes[index + 1];
      bottom = next ? next.getBoundingClientRect().top + scrollY - gutter : bottom;
    }
    const fits = bottom - top <= available - gutter * 2;
    const start = Math.max(0, fits ? (top + bottom - height - header) / 2 : top - header - gutter);
    // Keep the first hero at page top, with navigation visible.
    const first = index === 0 ? 0 : start;
    points.push(first);
    if (!fits) {
      const end = Math.max(first, bottom - height + gutter);
      const steps = Math.ceil((end - first) / (available * 0.78));
      for (let step = 1; step <= steps; step++) points.push(first + (end - first) * step / steps);
    }
  }
  return points.map(point => Math.round(Math.min(limit, point)))
    .sort((a, b) => a - b).filter((point, index, all) => !index || point - all[index - 1] > 8);
}

function initialize() {
  dispose?.();
  dispose = undefined;
  if (reducedMotion.matches) return;
  const listeners = new AbortController();
  let frame = 0;
  let moving = false;
  let travelDirection = 0;
  let lastWheel = -Infinity;
  let wheelDirection = 0;
  let accumulatedWheel = 0;
  const lenis = new Lenis({
    autoRaf: false, autoResize: true, smoothWheel: false, syncTouch: false, anchors: false,
    // Lenis only animates our destination; native touch and navigation stay native.
    virtualScroll: () => false,
  });
  function cancel() {
    moving = false;
    travelDirection = 0;
    accumulatedWheel = 0;
    lenis.scrollTo(window.scrollY, { immediate: true });
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function tick(time: number) {
    frame = 0;
    lenis.raf(time);
    if (moving) frame = requestAnimationFrame(tick);
  }
  function advance(direction: number) {
    if (moving && travelDirection === direction) return;
    if (moving) cancel();
    const stops = destinations();
    const current = window.scrollY;
    const target = direction > 0 ? stops.find(stop => stop > current + 8) : [...stops].reverse().find(stop => stop < current - 8);
    if (target === undefined) return;
    lenis.resize();
    moving = true;
    travelDirection = direction;
    // Soft acceleration and deceleration, without bounce or overshoot.
    const duration = Math.min(1.5, Math.max(1.05, 1 + Math.abs(target - current) / 2200));
    lenis.scrollTo(target, {
      duration,
      easing: t => (1 - Math.cos(Math.PI * t)) / 2,
      onComplete: () => { moving = false; },
    });
    if (!frame) frame = requestAnimationFrame(tick);
  }
  window.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.shiftKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || ownsScroll(event.target)) {
      cancel();
      return;
    }
    if (!event.deltaY) return;
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    const now = performance.now();
    const freshGesture = now - lastWheel > 200 || direction !== wheelDirection;
    lastWheel = now;
    wheelDirection = direction;
    if (freshGesture) accumulatedWheel = 0;
    // Consume each burst once, including its trackpad momentum tail.
    if (!freshGesture && accumulatedWheel === Infinity) return;
    accumulatedWheel += Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (accumulatedWheel < 12) return;
    advance(direction);
    accumulatedWheel = Infinity;
  }, { passive: false, signal: listeners.signal });
  window.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.isComposing || ownsScroll(event.target)) {
      cancel();
      return;
    }
    event.preventDefault();
    if (!event.repeat) advance(direction);
  }, { signal: listeners.signal });
  for (const name of ['pointerdown', 'touchstart', 'focusin'] as const) {
    window.addEventListener(name, cancel, { capture: true, passive: true, signal: listeners.signal });
  }
  window.addEventListener('blur', cancel, { signal: listeners.signal });
  window.addEventListener('resize', cancel, { signal: listeners.signal });
  document.addEventListener('visibilitychange', cancel, { signal: listeners.signal });
  dispose = () => { cancel(); listeners.abort(); lenis.destroy(); };
}
function destroy() { dispose?.(); dispose = undefined; }
document.addEventListener('astro:before-swap', destroy);
document.addEventListener('astro:page-load', initialize);
window.addEventListener('pagehide', destroy);
window.addEventListener('pageshow', (event) => { if (event.persisted) initialize(); });
reducedMotion.addEventListener('change', initialize);
initialize();
