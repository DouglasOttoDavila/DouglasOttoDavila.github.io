---
name: rpi-auth-plan
description: "RPI: Plan auth + protected pages gating (based on research doc)"
argument-hint: "Path to research doc in thoughts/research/"
agent: agent
---

# Plan: Auth + Protected Pages

NOTE: This is a task-specific example. For other tasks, use `rpi-plan.prompt.md`.

Input:
- A completed research doc (from `thoughts/research/`).

## Rules (RPI Plan Phase)
- Do not change code in this phase.
- Produce a concrete, sequenced plan with clear “definition of done”.
- Prefer the simplest approach that meets the user’s intent.
- Explicitly call out what is and is not secure on a static site.

## Steps
1. Read the research doc and restate the chosen option(s).
2. Ask any remaining blocking questions (max 5). If none, proceed.
3. Produce an implementation plan with:
   - Files to add/change (by path)
   - Data model for “protected pages config” (format, location, schema)
   - Auth UX: login, logout, persisted session, expiry
   - Router changes: guard/redirect behavior, “hidden from nav” behavior
   - Failure modes (config missing, fetch fails, token expired, etc.)
   - Minimal test/verification checklist (manual steps are OK)
4. Include a rollback plan (how to disable the feature quickly).

## Output
Create a plan document at:
- `thoughts/plans/YYYY-MM-DD-HHmm-auth-protected-pages.md`

The plan must include:
- A short summary of the recommended approach and why it wins for this repo.
- A numbered checklist the implementer can execute step-by-step.
- Acceptance criteria that can be verified in a browser.
