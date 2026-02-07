---
name: rpi-implement
description: "RPI: Implement phase (task-agnostic)"
argument-hint: "Path to the plan doc in thoughts/plans/"
agent: agent
---

# Implement (Task-Agnostic)

Input:
- A completed plan doc from `thoughts/plans/`.

## Rules (RPI Implement Phase)
- Follow the plan. If you must deviate, keep it minimal and document why.
- Make small, reviewable changes.
- Do not introduce secrets into the repo.

## Expectations
1. Implement the plan in the repo (add/change the files listed).
2. Add/update any docs that the plan requires.
3. Run the verification steps from the plan (or explain what couldn’t be run).
4. Provide a short, concrete manual verification checklist in the final output.

