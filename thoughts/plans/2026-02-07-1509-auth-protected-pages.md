# Auth + Protected Pages (Plan) - 2026-02-07 15:09

## Chosen Approach
Supabase Auth (OAuth) integrated into the existing SPA router (`js/main.js`) with config-driven route protection (`content/protected-pages.json`) and auth provider config (`content/auth.config.json`). This provides UI gating compatible with GitHub Pages.

## What Is / Is Not Secure
- Enforced: SPA navigation guard + nav hiding.
- Not secure: the underlying `content/*.html` fragments remain publicly fetchable if someone knows the URLs.

## Step-by-Step Checklist
1. Add protected routes config
   - Create `content/protected-pages.json`
2. Add auth provider config
   - Create `content/auth.config.json` (Supabase URL + anon key placeholders)
3. Add login route + page
   - Create `content/login.html`
   - Add `login` to router routes map in `js/main.js`
4. Add Supabase client and auth state tracking
   - Load configs on startup
   - Initialize Supabase from config
   - Track session/user; subscribe to auth state changes
5. Add route guard + redirect-back behavior
   - When blocked, store `sessionStorage.post_login_redirect`
   - Redirect to `login`, then post-login navigate back
6. Update navbar controls
   - Add `Login` link and `Logout` button in `index.html`
   - Wire them in `js/main.js`
7. Nav hiding driven by config
   - Hide protected nav items when logged out (or not allowed)

## Definition Of Done (Acceptance Criteria)
- Logged out (fresh session):
  - Home/About load normally.
  - Protected routes are hidden from nav.
  - Visiting `#prompt-explained` or `#user-story-analyzer` redirects to `#login`.
- Logged in:
  - Protected routes become visible in nav and accessible.
  - If blocked route was requested, post-login redirects to it.
- Logout:
  - Protected routes hidden/blocked again.

## Verification (Manual)
1. Clear site data and load `#home`.
2. Confirm protected links hidden in nav.
3. Navigate directly to `#prompt-explained` and confirm redirect to `#login`.
4. Login via OAuth and confirm redirect back to the requested page.
5. Logout and confirm access is revoked.

## Failure Modes + Mitigations
- Config fetch fails: treat as no protected pages (log warning).
- Auth misconfigured: show warning on login page; disable auth actions.
- OAuth redirect misconfigured: document required callback URL(s) in Supabase.

## Rollback
- Remove Supabase script include from `index.html`.
- Remove auth code in `js/main.js` or set `pages: []` in `content/protected-pages.json`.
- Remove `login` route and `content/login.html`.

