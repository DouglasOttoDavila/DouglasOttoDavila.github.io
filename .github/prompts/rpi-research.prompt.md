---
name: rpi-research
description: "RPI: Research phase (task-agnostic)"
argument-hint: "Task description + constraints (deadline, budget/free-only, environment, stack, success criteria)"
agent: agent
---

# Research (Task-Agnostic)

## Task
Restate the task in 1-3 sentences. If the user did not provide enough detail, list the missing details as **open questions** (max 8).

## Rules (RPI Research Phase)
- Do not change any code.
- Do not write an implementation plan yet.
- Prefer evidence from this repo: reference concrete files/functions/lines when relevant.
- Make assumptions explicit and label them.

## What To Do
1. **Understand the current state**
   - Inspect the repo areas relevant to the task.
   - Summarize the current behavior/architecture with file references.
2. **Clarify constraints**
   - Cost: note whether the user wants FREE-only / free-tier / paid allowed.
   - Security/compliance: identify any high-stakes requirements.
   - Runtime/deploy constraints (static hosting, server access, CI, etc.).
3. **Enumerate solution options**
   - Provide at least 3 viable approaches (even if one is clearly best).
   - For each option: benefits, drawbacks/risks, complexity, operational burden, and what it actually protects/guarantees.
4. **Recommend a direction**
   - Pick the simplest option that meets the requirements.
   - Call out any tradeoff the user should explicitly accept.

## Output
Create a research document at:
- `thoughts/research/YYYY-MM-DD-HHmm-<task-slug>.md`

Include:
1. Current state (with file references)
2. Requirements + constraints
3. Options matrix (3+ options)
4. Recommendation
5. Open questions (max 8) that block planning/implementation

