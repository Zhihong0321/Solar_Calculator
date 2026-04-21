---
name: codebase-mapper
description: Use when an AI-maintained codebase needs a slow big-picture inventory before cleanup or refactor. This skill maps large files, mixed-responsibility modules, stale notes, instruction noise, temporary scripts, and likely residual artifacts so the next maintenance target can be chosen deliberately.
---

# Codebase Mapper

Use this skill to build a ranked maintenance map before editing the codebase.

## Goal

Find the next best single maintenance target without rushing into changes.

## What To Look For

- oversized files
- files with mixed responsibilities
- likely dead folders and assets
- stale notes and instructions that may confuse future AI
- temp scripts, backup files, and one-off utilities
- duplicate logic or competing entry points
- architecture decisions that no longer fit the current product

## Workflow

1. Inspect the repo shape.
2. Run `../scripts/inventory_large_files.py`.
3. Run `../scripts/find_context_noise.py`.
4. Read only the most relevant files from the results.
5. Rank the next target by clarity, confidence, and value.

## Output

Return a short maintenance map with:

- top digestion candidates
- top cleanup candidates
- top optimization candidates
- one recommended next target

## Rules

- do not start cleanup or refactor in the same run unless the user explicitly asks
- prefer high-confidence targets over ambitious targets
- optimize for AI readability, not theoretical perfection
