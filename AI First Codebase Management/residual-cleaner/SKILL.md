---
name: residual-cleaner
description: Use when stale files, dead comments, obsolete notes, backup artifacts, or outdated instructions are lingering in an AI-maintained codebase. This skill removes or soft-removes one residual target at a time so future AI agents face less confusion and less context noise.
---

# Residual Cleaner

Use this skill to resolve one residual source of confusion at a time.

## Goal

Reduce context noise and lingering legacy without risking the current working state.

## Valid Targets

- stale markdown notes
- obsolete instructions
- dead folders
- backup artifacts
- temporary scripts
- unreachable code blocks
- commented-out code that no longer serves a purpose

## Confidence Policy

- high confidence: delete or remove directly
- medium confidence: soft-remove and mark clearly
- low confidence: stop and ask before deleting

Read `../references/soft-remove-policy.md` before using a soft-remove path.

## Workflow

1. Confirm one residual target.
2. Search for live references.
3. Decide delete, soft-remove, or defer.
4. Make the smallest clear change.
5. Verify the target is no longer needed.

## Rules

- do not clean multiple categories in one run
- do not mix cleanup with behavior changes
- do not create new scattered notes while removing old scattered notes
- if using soft-remove, include date and reason

## Deliverable

Resolve one residual target and report:

- why it was considered residual
- what confidence level was used
- whether it was deleted, soft-removed, or deferred
