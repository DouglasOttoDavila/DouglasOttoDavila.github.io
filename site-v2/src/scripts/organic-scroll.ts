// Native gestures remain native; animate only explicit section navigation.
import { navigate } from "astro:transitions/client";
let cleanup: (() => void) | undefined;
let previousBody: HTMLElement | undefined;
let restoringHistory = false;
const returnFocus = new Map<string, { href: string; occurrence: number }>();
let currentPage = location.href;
window.addEventListener("popstate", () => {
  restoringHistory = true;
});
document.addEventListener("astro:before-preparation", () => {
  const active = document.activeElement;
  if (active instanceof HTMLAnchorElement) {
    const peers = [
      ...document.querySelectorAll<HTMLAnchorElement>("main a[href]"),
    ].filter((a) => a.href === active.href);
    returnFocus.set(new URL(currentPage).pathname, {
      href: active.href,
      occurrence: Math.max(0, peers.indexOf(active)),
    });
  }
});
function initialize() {
  cleanup?.();
  document.documentElement.classList.add("js");
  const controller = new AbortController(),
    { signal } = controller;
  const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
  const nav = document.querySelector<HTMLElement>(".site-nav");
  const close = () => {
    toggle?.setAttribute("aria-expanded", "false");
    nav?.classList.remove("is-open");
  };
  toggle?.addEventListener(
    "click",
    () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav?.classList.toggle("is-open", open);
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key === "Escape" &&
        toggle?.getAttribute("aria-expanded") === "true"
      ) {
        close();
        toggle.focus();
      }
    },
    { signal },
  );
  nav?.addEventListener(
    "click",
    (e) => {
      if ((e.target as Element).closest("a")) close();
    },
    { signal },
  );
  let frame = 0;
  const stop = () => cancelAnimationFrame(frame);
  for (const type of ["wheel", "touchstart", "keydown"])
    window.addEventListener(type, stop, { signal, passive: true });
  document.addEventListener(
    "click",
    async (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        url.pathname !== location.pathname ||
        !url.hash
      )
        return;
      let id: string;
      try {
        id = decodeURIComponent(url.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      stop();
      close();
      const start = scrollY;
      if (location.hash !== url.hash) await navigate(url.href);
      if (signal.aborted) return;
      currentPage = location.href;
      const top =
        target.getBoundingClientRect().top +
        scrollY -
        (document.querySelector(".site-header")?.getBoundingClientRect()
          .height ?? 72) -
        24;
      const begun = performance.now();
      window.scrollTo(0, start);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      const tick = (now: number) => {
        const progress = Math.min(1, (now - begun) / 420);
        window.scrollTo(
          0,
          start + (top - start) * (1 - Math.pow(1 - progress, 3)),
        );
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        window.scrollTo(0, top);
      else frame = requestAnimationFrame(tick);
    },
    { signal, capture: true },
  );
  const sections = [
    ...document.querySelectorAll<HTMLElement>("main [id]"),
  ].filter((el) =>
    ["work", "experience", "writing", "lab", "about", "contact"].includes(
      el.id,
    ),
  );
  const mark = () => {
    if (location.pathname !== "/") return;
    const candidates = sections.filter(
      (el) =>
        el.getBoundingClientRect().top <= 180 &&
        el.getBoundingClientRect().bottom > 100,
    );
    const linked = candidates.find((el) => "#" + el.id === location.hash);
    const active = (linked || candidates.at(-1))?.id;
    nav
      ?.querySelectorAll<HTMLAnchorElement>("[data-section]")
      .forEach((link) => {
        if (link.dataset.section === active)
          link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
  };
  window.addEventListener("scroll", mark, { signal, passive: true });
  mark();
  let hashTarget: HTMLElement | null = null;
  try {
    hashTarget = location.hash
      ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
      : null;
  } catch {
    /* Invalid fragment still leaves the page usable. */
  }
  if (hashTarget) {
    hashTarget.setAttribute("tabindex", "-1");
    hashTarget.focus({ preventScroll: true });
  } else if (previousBody && previousBody !== document.body) {
    const saved = restoringHistory
      ? returnFocus.get(location.pathname)
      : undefined;
    const target =
      (saved &&
        [
          ...document.querySelectorAll<HTMLAnchorElement>("main a[href]"),
        ].filter((a) => a.href === saved.href)[saved.occurrence]) ||
      document.querySelector<HTMLElement>("main h1");
    if (target) {
      if (!(target instanceof HTMLAnchorElement))
        target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }
  previousBody = document.body;
  currentPage = location.href;
  restoringHistory = false;
  cleanup = () => {
    stop();
    controller.abort();
  };
}
document.addEventListener("astro:page-load", initialize);
document.addEventListener("astro:before-swap", () => cleanup?.());
initialize();
