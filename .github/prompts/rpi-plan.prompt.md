---
name: rpi-plan
description: "RPI: Plan phase (task-agnostic)"
argument-hint: "Path to the research doc in thoughts/research/"
agent: agent
---

# Plan (Task-Agnostic)

Input:
- A completed research doc from `thoughts/research/`.

## Rules (RPI Plan Phase)
- Do not change code in this phase.
- Convert research into a concrete, executable plan.
- Minimize scope: prioritize the smallest change that meets requirements.
- Identify risks and define validation steps.

## Plan Requirements
Produce a plan document that includes:
1. **Chosen approach** and why it won versus alternatives.
2. **Step-by-step checklist** (numbered) with:
   - Files to create/change (by path)
   - Key data structures/config formats (schemas)
   - UX/API/behavioral decisions that must be implemented
3. **Definition of Done**
   - Acceptance criteria (behavior-based, verifiable)
4. **Verification**
   - Manual steps and/or automated checks/tests to confirm behavior
5. **Risk management**
   - Failure modes and mitigations
6. **Rollback plan**
   - How to disable/revert the feature quickly

## Output
Create a plan document at:
- `thoughts/plans/YYYY-MM-DD-HHmm-<task-slug>.md`

