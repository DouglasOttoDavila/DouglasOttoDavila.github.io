---
description: "RPI workflow conventions (task-agnostic). Applies when the user requests RPI."
applyTo: "**"
---

When the user requests an RPI (Research > Plan > Implement) approach:
- Research: gather repo context, constraints, and options. Do not change code.
- Plan: produce a sequenced, executable plan. Do not change code.
- Implement: change code strictly following the plan, verify, and report results.

Artifacts:
- Research docs go in `thoughts/research/` as `YYYY-MM-DD-HHmm-<task-slug>.md`.
- Plan docs go in `thoughts/plans/` as `YYYY-MM-DD-HHmm-<task-slug>.md`.

General:
- Prefer the smallest solution that meets requirements.
- Keep assumptions explicit.
- Never commit or store secrets in client-side code or in the repo.

