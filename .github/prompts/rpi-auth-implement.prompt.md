---
name: rpi-auth-implement
description: "RPI: Implement auth + protected pages gating (based on plan doc)"
argument-hint: "Path to plan doc in thoughts/plans/"
agent: agent
---

# Implement: Auth + Protected Pages

NOTE: This is a task-specific example. For other tasks, use `rpi-implement.prompt.md`.

Input:
- A completed plan doc (from `thoughts/plans/`).

## Rules (RPI Implement Phase)
- Follow the plan. If you must deviate, document why in the PR/notes and keep scope tight.
- Keep the site static (no build tooling unless the plan explicitly adds it).
- Do not introduce secrets into client-side code.
- Be explicit about “UI gating” vs “real security”.

## Implementation Expectations
- Add a configuration-file-driven mechanism for protected pages.
  - The config should support:
    - route id (e.g., `prompt-explained`)
    - whether auth is required
    - whether it should be hidden from nav for unauthenticated users
    - optional redirect target (e.g., `login`)
- Add an auth state mechanism (as specified in the plan) with:
  - login flow
  - logout
  - session persistence + expiry (if applicable)
- Enforce blocking:
  - navigating directly via hash to a protected page should redirect to login (or an access denied screen)
  - after login, redirect back to originally requested page
- Update navigation:
  - protected items should be hidden/disabled based on config when logged out

## Repo-Specific Notes
- Routing is handled in `js/main.js` and loads fragments from `content/*.html`.
- Keep changes compatible with this pattern (fetch + `innerHTML` + page init).

## Verification
At minimum, provide a manual verification checklist that covers:
- Fresh session (no storage): protected routes blocked + nav hidden
- After login: access granted + nav updated
- Logout: access revoked + nav updated
- Config changes: adding/removing protected routes behaves as expected
