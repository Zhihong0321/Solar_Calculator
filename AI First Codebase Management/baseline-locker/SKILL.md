---
name: baseline-locker
description: Use when an AI-maintained codebase needs its current working state confirmed before cleanup or refactor. This skill locks the baseline by identifying critical flows, checking what must still work, and stopping structural changes until that baseline is trusted.
---

# Baseline Locker

Use this skill when the codebase may work today, but the current safe state has not been clearly locked.

## Goal

Establish a trusted "current working state" before cleanup, splitting, or optimization.

## Focus

Handle one baseline target at a time:

- one user flow
- one module
- one subsystem

Do not begin structural cleanup here unless the user explicitly asks for it.

## Workflow

1. Identify the exact flow or subsystem being protected.
2. Inspect existing tests, scripts, and known runtime checks.
3. Determine what "working" means in concrete terms.
4. Run the safest available verification.
5. If confidence is still weak, ask the user to confirm the working state before proceeding to later stages.

## Deliverable

Produce a concise baseline note that states:

- what was checked
- what appears stable
- what remains uncertain
- whether the codebase is ready for `map-ready`, `digestion-ready`, or `cleaning-ready`

## Rules

- do not silently assume the baseline is safe
- do not refactor while baseline confidence is weak
- if no good verification exists, say so plainly
- prefer specific flows over vague repo-wide claims
