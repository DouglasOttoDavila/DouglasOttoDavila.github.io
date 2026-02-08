# DouglasOttoDavila.github.io

Portfolio site for **Douglas D'Avila** (QA Architect / QA Automation Lead / AI Solutions for QA), published via **GitHub Pages**. The site is intentionally built as a **static, no-build-step SPA** to demonstrate pragmatic engineering under real-world constraints: client-side routing, config-driven feature flags, SSO-based gated areas, and a documented AI-assisted delivery workflow.

Live: https://douglasottodavila.github.io

## What This Project Demonstrates (Technical)

- **Static SPA architecture without a framework**
  - Hash-based router (`SPARouter`) that loads HTML fragments into a single shell layout.
  - Route guarding + redirect-back behavior for protected areas.
- **Config-driven behavior**
  - Protected routes are defined in JSON instead of hardcoded checks.
  - Authentication provider UX/config is defined outside code and can be hydrated at deploy time.
- **Authentication on static hosting**
  - Supabase Auth (OAuth + optional email/password) integrated in a way that works on GitHub Pages.
  - Profile persistence and avatar upload patterns (Supabase tables/storage) from the browser.
- **AI-enabled QA focus**
  - “Prompt Explained” content is included as a first-class artifact and downloadable as Markdown.
  - “User Story Analyzer” UI demonstrates how an AI service can be wrapped into a productized QA workflow.
- **Professional AI-assisted engineering workflow**
  - RPI (Research, Plan, Implement) prompt strategy baked into the repo for repeatable, auditable changes.
  - GitHub Copilot prompt files and instruction files included under `.github/`.

## Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6)
- **UI:** Bootstrap 5 (`bootstrap.bundle`), Font Awesome, Google Fonts (Roboto, Fira Code)
- **Syntax highlighting:** highlight.js
- **Auth / Backend-as-a-Service:** Supabase (`@supabase/supabase-js` UMD build)
- **Automation / CI:** GitHub Actions, GitHub Pages deployment
- **Local scripting:** PowerShell (runtime config generator)
- **Prompt Ops:** GitHub Copilot prompt files + instruction files, Codex for VS Code (AI pair programming workflow)

## Architecture (How It Works)

1. **Shell page**
   - `index.html` is the only full HTML document (navbar, footer, `#content-area`).
2. **Content as fragments**
   - Pages are fragments under `content/*.html` and are fetched at runtime.
3. **Client-side router**
   - `js/main.js` implements `class SPARouter`:
     - Route map (`this.routes`) maps `#<routeId>` to `content/<page>.html`.
     - Navigation uses `history.pushState` + hash routes.
     - Page-specific bootstrapping is handled after each fragment load.
4. **Protected routes**
   - `content/protected-pages.json` defines which routes require authentication and whether they should be hidden while logged out.
5. **Auth provider configuration**
   - `content/auth.config.json` defines auth provider + UX defaults (provider = Supabase).
   - `content/auth.runtime.json` is an optional runtime overlay (generated from secrets for local/dev or CI deploy).

## RPI Prompt Strategy (Research, Plan, Implement)

This repository includes a structured prompt strategy used to plan and execute changes with strong traceability.

- **Instructions (task-agnostic):** `.github/instructions/rpi-workflow.instructions.md`
- **Repo context instructions (example):** `.github/instructions/auth-protected-pages.instructions.md`
- **Copilot prompt files:** `.github/prompts/`
  - `rpi-research.prompt.md`
  - `rpi-plan.prompt.md`
  - `rpi-implement.prompt.md`
  - Task-specific examples (auth/protected pages):
    - `rpi-auth-research.prompt.md`
    - `rpi-auth-plan.prompt.md`
    - `rpi-auth-implement.prompt.md`

Intended artifact flow:

1. Research notes: `thoughts/research/YYYY-MM-DD-HHmm-<task>.md`
2. Implementation plan: `thoughts/plans/YYYY-MM-DD-HHmm-<task>.md`
3. Implementation follows the plan, then verifies and reports outcomes

Note: `thoughts/` is ignored by default (`.gitignore`) so you can keep iterative planning artifacts locally and selectively commit what you want to publish.

## Authentication Model (Important for Recruiters)

This site is hosted as **static content** (GitHub Pages). That means:

- The router can **hide links and block navigation** for protected routes.
- The underlying HTML fragments under `content/` are still **publicly fetchable** if someone knows the URL.

In other words: route protection here is **UI gating**, not server-side access control. Any truly sensitive data must be protected behind a backend/edge layer (API enforcement, signed URLs, or an access proxy).

## Local Development

This project is designed to run without a build step.

Recommended:

1. Open `index.html` with a local web server (not `file://`) so `fetch()` works.
2. If using VS Code, the repo includes a small convenience setting:
   - `.vscode/settings.json` sets `livePreview.defaultPreviewPath` to `/index.html`.

### Local Auth Runtime (Optional)

To avoid committing credentials, local auth config can be generated into `content/auth.runtime.json` (gitignored):

1. Create a local `.env` with:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ALLOWED_EMAILS` (comma-separated allowlist; optional)
2. Generate runtime config:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-auth-runtime.ps1
```

## Deployment (GitHub Pages)

- Workflow: `.github/workflows/pages.yml`
- Trigger: push to `main` (and manual `workflow_dispatch`)
- Deploy model:
  - A CI step generates `content/auth.runtime.json` from GitHub Actions secrets (so credentials are not committed).
  - The entire repo is uploaded as the Pages artifact and deployed.

Required GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_EMAILS` (optional, comma-separated)

## Project Structure

- `index.html`: shell layout + navbar + script includes
- `content/`: page fragments, auth configs, protected page config
- `js/main.js`: SPA router, auth integration, gated navigation, page bootstrapping
- `css/style.css`: custom theme, responsive layout, “space” login styling, components
- `assets/`: images and static media used by the portfolio
- `.github/instructions/`: instruction files used by Copilot/Codex workflows
- `.github/prompts/`: RPI prompt files (task-agnostic + task-specific examples)
- `scripts/`: local automation scripts (PowerShell)

## Engineering Notes / Quality Bar

- No build tooling: changes are reviewable and deployable as-is.
- Explicit separation between:
  - **config** (`content/*.json`)
  - **runtime logic** (`js/main.js`)
  - **presentation** (`content/*.html`, `css/style.css`)
- Security posture is documented and kept explicit (static hosting constraints, no committed secrets).
