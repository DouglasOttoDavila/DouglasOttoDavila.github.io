---
description: "Repo context + constraints for adding authentication and config-driven protected pages"
applyTo: "**"
---

This repo is a static website with client-side navigation:
- `index.html` is the shell and contains the navbar + `#content-area`.
- `js/main.js` defines `class SPARouter` which maps hash routes (e.g. `#about`) to fragment files under `content/` and loads them via `fetch()` into `#content-area`.
- Pages are HTML fragments (not full documents) under `content/*.html`.

When implementing authentication and protected pages gating:
- Treat this as static hosting (GitHub Pages-like) unless explicitly changed.
- Do not add secrets (passwords, API keys, Basic Auth credentials) to client-side code.
- Be explicit in docs/comments about what is only “UI gating” (not real security) versus what truly protects data behind a backend/edge layer.
- Prefer a small, config-driven guard in the router (or a wrapper around `navigate()`/`loadContent()`).

Protected pages configuration:
- Use a dedicated config file in-repo (JSON is fine for a static site).
- The mechanism must support:
  - marking routes as protected (auth required)
  - hiding protected pages from navigation when logged out
  - redirecting to a login route and returning to the originally requested route after login

Compatibility constraints:
- Keep the site working without a build step.
- Keep routing hash-based (don’t convert to a different router unless asked).
- Keep page-specific init behavior working (see `SPARouter.initializePageScripts()` in `js/main.js`).

Quality bar:
- Changes should be minimal and readable.
- Add a short manual verification checklist (since this is a static site).

