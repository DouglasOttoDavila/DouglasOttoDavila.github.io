---
name: rpi-auth-research
description: "RPI: Research authentication + protected pages gating for this static SPA (free-first)"
argument-hint: "Optional: constraints (hosting, providers, which pages to protect, threat model)"
agent: agent
---

# Research: Auth + Protected Pages (Free-First)

NOTE: This is a task-specific example. For other tasks, use `rpi-research.prompt.md`.

You are researching how to add an authentication mechanism to this website such that:
- By default, users can navigate freely.
- Some pages are hidden and blocked for non-authenticated users.
- The set of protected pages is configured via a configuration file mechanism (not hardcoded only in JS).

This is a static website with a small client-side SPA router. Assume GitHub Pages-style hosting unless the user says otherwise.

## Rules (RPI Research Phase)
- Do not change any code.
- Do not propose an implementation plan yet.
- Document what exists today and enumerate viable solution options.
- Keep assumptions explicit.

## What To Inspect (Codebase)
- How routing/navigation works and where page loads happen.
- How pages are represented (fragments under `content/`, routes map, etc.).
- How/where JS initializes page-specific behavior.
- Any existing backend calls or secrets in the client (note risks, but don’t fix in this phase).

Use `#codebase` to locate and reference exact files and the relevant functions/classes.

## What To Research (Solutions, FREE Options)
Catalog FREE or free-tier approaches that could work with a static site:
- Client-only “soft” auth (local password/PIN, localStorage session) and its security limits.
- OAuth / OIDC login (Google, GitHub, Microsoft, etc.) in a static app and how token validation would work.
- Hosted auth providers with free tiers (e.g., Firebase Auth, Supabase Auth, Auth0 free tier, Clerk free tier, etc.).
- Edge/serverless add-ons with free tiers (e.g., Cloudflare Workers/Pages Functions, Netlify Functions) to make auth real.
- “Whole-site or path protection” in front of the site (e.g., Cloudflare Access / Zero Trust) if free options exist.
- Database needs (if any) and free options (Supabase, Firebase, etc.) if authorization rules require server-side checks.

For each option, capture:
- What parts are truly protected vs just hidden in the UI.
- Setup complexity (what external accounts/services are required).
- Ongoing cost constraints (what’s free-tier limited).
- Fit with this repo’s architecture (static fragments + hash routing).

If web access is available in your environment, use `#fetch` to confirm any “free tier” claims and note dates; otherwise, mark them “unverified”.

## Output
Create a research document at:
- `thoughts/research/YYYY-MM-DD-HHmm-auth-protected-pages.md`

Include:
1. Current architecture summary with file references.
2. Requirements restatement and constraints.
3. Options matrix (at least 3 distinct approaches), with tradeoffs.
4. Open questions for the user (max 8) that must be answered before planning.
