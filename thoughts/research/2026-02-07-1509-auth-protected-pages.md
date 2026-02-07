# Auth + Protected Pages (Research) - 2026-02-07 15:09

## Current Architecture (Codebase Notes)
- SPA router: `js/main.js` (`class SPARouter`)
  - Route map is currently hardcoded in `this.routes`.
  - Navigation uses `history.pushState(..., '', '#<routeId>')` and loads fragments with `fetch('content/<page>.html')` into `#content-area`.
  - Page-specific bootstrapping runs via `initializePageScripts(page)`.
- Navigation items live in `index.html` and are keyed by `[data-route]`.
- Content pages are fragments in `content/*.html`.

## Requirements Restatement
- Default navigation is public.
- Some routes must be:
  - hidden from navigation when logged out
  - blocked on direct navigation (hash) when logged out
- The protected set is configured via a file (not hardcoded only in JS).
- Prefer free/free-tier solutions where possible.

## Options (Free-First)
### Option A: Client-only soft auth (local password/PIN, localStorage)
- Protection: UI-only; any protected fragments remain publicly fetchable.
- Setup: no external services.
- Pros: simplest; fully static.
- Cons: not real security; easy to bypass.

### Option B: OAuth/OIDC in SPA (Supabase Auth, Firebase Auth, Auth0/Clerk)
- Protection: UI gating by default; can do real enforcement only with a backend/edge layer.
- Setup: external provider account + OAuth app config.
- Pros: real identity; standard login experience; free tiers typically exist.
- Cons: still not “secure content” on pure GitHub Pages without server-side checks.

### Option C: Put site behind an auth gate (Cloudflare Access / Zero Trust, Netlify, etc.)
- Protection: real path-level protection (server/edge prevents access).
- Setup: move/route hosting behind a service that enforces auth.
- Pros: true access control for content.
- Cons: likely changes hosting setup and operational complexity; free tiers/limits vary.

## Recommendation For This Repo
- Use Supabase Auth (OAuth providers) + config-driven protected routes, implemented as UI gating in the SPA router.
- Add a `content/protected-pages.json` file to drive route guarding and nav hiding.

## Notes / Risks Discovered
- `js/main.js` contains an API call with HTTP Basic auth credentials embedded client-side (risk: credential exposure).
  - This work does not remove that exposure; it only hides the route in nav and blocks non-authenticated navigation in the SPA.

## Open Questions (Resolved For Implementation)
- Security level: UI gating only.
- Auth provider: Supabase.
- Initial protected routes: `prompt-explained`, `user-story-analyzer`.

