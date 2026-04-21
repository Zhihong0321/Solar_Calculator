---
name: maintain-ai-first-codebase
description: Use when the goal is to keep an AI-maintained codebase clean, manageable, and easy for future AI agents to modify. This skill chooses a single maintenance stage, selects one target only, and routes the work toward baseline locking, codebase mapping, file digestion, residual cleanup, architecture optimization, or overhaul planning.
---

# Maintain AI First Codebase

This is the strategy skill for slow, staged maintenance of an AI-maintained codebase.

The purpose is not to "fix everything." The purpose is to keep the codebase easy for future AI agents to read, trust, and change.

## Core Principles

- optimize for AI-friendly structure, not just human preference
- keep each run narrow: one stage, one target, one deliverable
- do not mix digestion, cleanup, and optimization in one pass
- prefer reversible changes over aggressive deletion
- treat large files, stale files, and obsolete decisions as different classes of work
- read the previous maintenance log before choosing the next stage

## Startup Requirement

Before deciding the stage:

1. locate the maintenance log using `../references/maintenance-log-policy.md`
2. if no log exists, initialize `.agents/ai-first-maintenance-log.md` using `../scripts/update_maintenance_log.py --init`
3. read the latest entries
4. use that history as an input to stage selection

## Single-Task Rule

For each run:

1. choose exactly one stage
2. choose exactly one target inside that stage
3. complete only that target
4. verify the result
5. stop and recommend the next stage

If multiple good targets exist, pick the smallest high-confidence target first.

## Stage Model

### 1. `baseline-locked`

Use when the current working state is uncertain.

Route to: `../baseline-locker/SKILL.md`

### 2. `map-ready`

Use before structural work, or whenever the next best target is unclear.

Route to: `../codebase-mapper/SKILL.md`

### 3. `digestion-ready`

Use when a file is too large or mixes too many responsibilities.

Route to: `../file-digester/SKILL.md`

### 4. `cleaning-ready`

Use when stale files, notes, comments, or instructions are creating confusion.

Route to: `../residual-cleaner/SKILL.md`

### 5. `optimization-ready`

Use after digestion and cleanup when the larger system shape needs improvement.

Route to: `../architecture-optimizer/SKILL.md`

### 6. `overhaul-ready`

Use only when smaller maintenance passes can no longer solve the structural problem.

Route to: `../overhaul-planner/SKILL.md`

## Default Stage Order

1. `baseline-locked`
2. `map-ready`
3. `digestion-ready`
4. `cleaning-ready`
5. `optimization-ready`
6. `overhaul-ready`

Adjustment rules:

- if there are obvious stale notes, temp files, or orphan folders with high confidence, `cleaning-ready` may happen before `digestion-ready`
- if giant files are hiding mixed concerns and blocking review, `digestion-ready` should happen before cleanup
- if baseline confidence is weak, return to `baseline-locked` before anything else

## How To Choose The Stage

Read `../references/stage-selection.md` first.

If the next stage is still unclear:

- favor `map-ready` over guessing
- favor `digestion-ready` over `optimization-ready`
- favor `soft-remove` over hard delete when cleanup confidence is medium

## External Skill Intake

When stage work would benefit from an external or existing `SKILL.md`:

- study it for heuristics and workflow ideas
- extract only the useful patterns
- record those patterns in local references or scripts
- do not paste external skill bodies wholesale into this bundle

Read `../references/external-skill-intake.md` before incorporating outside skill patterns.

## Shared References

- `../references/stage-selection.md`
- `../references/ai-friendly-code-shape.md`
- `../references/soft-remove-policy.md`
- `../references/external-skill-intake.md`
- `../references/maintenance-log-policy.md`

## Shared Scripts

- `../scripts/inventory_large_files.py`
- `../scripts/find_context_noise.py`
- `../scripts/update_maintenance_log.py`

## Output Expectations

Every run should end with:

- chosen stage
- chosen target
- why this target now
- exact work completed
- verification performed
- recommended next stage
