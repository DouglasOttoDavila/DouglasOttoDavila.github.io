---
name: Douglas D'Avila Portfolio
description: A living quality-signal system where requirements become risks, tests, and verified evidence.
colors:
  operational-ink: "#050914"
  artifact-field: "#07101d"
  raised-field: "#091321"
  signal-blue: "#2e7dff"
  signal-blue-bright: "#66a4ff"
  evidence-teal: "#38d7c5"
  risk-amber: "#f0b84b"
  ai-violet: "#a778ff"
  soft-white: "#f2f7ff"
  trace-mist: "#b9c7d9"
  quiet-mist: "#8293a8"
typography:
  display:
    fontFamily: "Onest Variable, Arial, sans-serif"
    fontSize: "clamp(3rem, 4.6vw, 5.2rem)"
    fontWeight: 670
    lineHeight: 0.99
    letterSpacing: "-0.037em"
  headline:
    fontFamily: "Onest Variable, Arial, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 5rem)"
    fontWeight: 650
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Onest Variable, Arial, sans-serif"
    fontSize: "clamp(1rem, 0.2vw + 0.95rem, 1.125rem)"
    lineHeight: 1.65
  technical:
    fontFamily: "Recursive Variable, Consolas, monospace"
    fontSize: "0.75rem"
rounded:
  sm: "0.4rem"
  md: "0.75rem"
  lg: "1rem"
spacing:
  control-sm: "0.65rem"
  control-md: "1rem"
  cluster: "2rem"
  section: "clamp(5.5rem, 11vw, 11rem)"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.sm}"
    padding: "0.9rem 1.25rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.sm}"
    padding: "0.9rem 1.25rem"
  artifact-card:
    backgroundColor: "{colors.artifact-field}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.md}"
    padding: "1.2rem"
---

# Design System: Douglas D'Avila Portfolio

## Overview

**Creative North Star: "The Signal Trace"**

The portfolio behaves like a living quality system. A continuous signal begins with an imperfect requirement, passes through risk and test design, and resolves as inspectable evidence. The world is precise and assured without becoming sterile: explanations are approachable, interactions reward curiosity, and every major claim leads to something a recruiter or engineer can inspect.

The system rejects the interchangeable glass-dashboard portfolio. Information lives on an operational ink field, joined by semantic paths and state changes. Major case-study transitions may become cinematic, while routine interaction stays calm and immediate.

**Key Characteristics:**

- Dark-first, high-contrast, and professionally restrained.
- Asymmetric editorial layouts connected by quality-signal paths.
- Large plain-spoken headlines paired with inspectable technical artifacts.
- Flat evidence surfaces; depth appears through tone, borders, and controlled transitions.

## Colors

Signal Blue carries primary action and active trace movement. Evidence Teal marks verified outcomes. Risk Amber appears only for ambiguity or unresolved risk. AI Violet distinguishes AI-specific experiments without becoming a generic accent. Operational Ink and its neighboring artifact fields own the environment; Soft White and the two mist tones establish readable hierarchy.

**The Semantic Signal Rule.** Bright color always communicates action, state, domain, or evidence. Empty space is never filled with glow merely to appear technical.

**The One Accent Rule.** A single artifact owns one semantic accent at a time; blue, teal, amber, and violet do not compete inside the same state.

## Typography

Onest carries display, interface, and long-form copy. Its direct shapes make the portfolio legible to time-conscious recruiters while retaining the precision expected of an engineering interface. Recursive appears only for authentic identifiers, dates, statuses, and structured technical material.

Headlines use balanced wrapping, tight tracking, and decisive weight. Body copy stays within a comfortable reading measure and uses the softer mist tone. Compact metadata uses sentence case; uppercase is reserved for genuine artifact notation.

**The Evidence Type Rule.** Monospace means the visitor is reading structured technical material, never merely that the subject is software.

## Layout

The default composition is asymmetric. The home opening pairs the positioning statement with a four-stage requirement-to-evidence mechanism. Subsequent sections alternate dense artifacts with deliberate quiet; the aligned Current Work group is the one intentional card family.

The content container tops out at 92rem with a fluid 1.25–4.5rem gutter. Section rhythm is intentionally generous, but wide horizontal screens use a denser 7.5rem section interval and shorter hero padding so the first evidence remains visible within a 1080px-tall viewport. At 74rem the hero becomes a single column; at 56rem the primary navigation becomes a disclosed mobile menu and multi-column content stacks; at 38rem controls become full-width and signal stages become vertical.

**The Continuous Trace Rule.** Experience, case studies, and quality stages express progression through a real line, node, or ordered relationship—not disconnected numbered decoration.

## Elevation & Depth

Depth is structural and mostly tonal. Large fields separate through neighboring ink values, thin borders, clipping, and the foreground signal trace. Routine evidence stays flat. Active artifacts may lift by less than half a rem or gain a semantic border; shadows are not part of the default vocabulary.

**The Flat Evidence Rule.** Evidence is not placed inside a floating glass tile by default. A container exists only to establish grouping, selection, or inspectable state.

## Shapes

The form language uses crisp rectangles with gently eased corners. Small controls use the compact radius, interactive artifacts use the medium radius, and large regions rarely exceed the large radius. Full pills are reserved for true compact statuses. Circular nodes represent checkpoints and transitions rather than acting as a universal motif.

## Components

Primary buttons use Signal Blue, firm weight, and a compact rectangular shape. Secondary buttons use a transparent field and the shared divider color. Both retain a visible blue focus ring and small directional movement on hover.

Signal Stage is the signature interactive component: four ordered artifact buttons disclose requirement, risk, test, and evidence states. It must remain understandable without animation and expose each stage as a named pressed-state control.

Current Work is the sole aligned card family. Its case study, article, and experiment entries share geometry but use distinct semantic accents and internal diagrams. Evidence tables, project rows, writing rows, and experience entries remain flat list or artifact structures rather than becoming additional card families.

## Do's and Don'ts

### Do:

- **Do** show a requirement-to-risk-to-test-to-evidence mechanism in the first viewport.
- **Do** support major claims with real or explicitly labeled illustrative artifacts.
- **Do** allow major case-study transitions to become cinematic while keeping navigation immediate.
- **Do** keep Douglas's small circular portrait inside About only.
- **Do** preserve complete comprehension when scripting or motion is disabled.

### Don't:

- **Don't** return to interchangeable glass-card dashboards.
- **Don't** use fake terminals, particle fields, decorative grids, gradient text, or ambient neural imagery.
- **Don't** invent performance metrics, clients, outcomes, or AI capabilities.
- **Don't** repeat tracked uppercase eyebrows or numbered scaffolds that do not represent a real sequence.
- **Don't** make visitors learn experimental navigation before they can inspect the work.
