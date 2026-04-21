# AI First Codebase Management

Multi-skill bundle for slow, staged maintenance of AI-maintained codebases.

## Purpose

This bundle is designed for repos that have been developed patch by patch with AI coding agents and now need deliberate maintenance focused on:

- AI-friendly structure
- smaller, clearer responsibility boundaries
- reduced context noise from stale files and notes
- safer cleanup of residual legacy
- big-picture optimization without rushing into rewrites

The workflow is intentionally slow and staged. Each run should handle one stage, one target, and one deliverable only.

## Skills

- `ai-first-maintenance`: automation-friendly entrypoint for "run ai-first-maintenance"
- `maintain-ai-first-codebase`: top-level strategy and stage selection
- `baseline-locker`: confirm and protect current working state
- `codebase-mapper`: build a ranked maintenance map
- `file-digester`: split one oversized or overloaded target
- `residual-cleaner`: remove or soft-remove one residual target
- `architecture-optimizer`: improve one structural problem at a time
- `overhaul-planner`: plan a subsystem overhaul without rushing implementation

## Shared Resources

- `references/`: policy and decision references used across the bundle
- `scripts/`: starter audit scripts for large-file inventory and context-noise detection

## Suggested Usage

Fast entry:

- say `run ai-first-maintenance`

The entry skill is designed to:

- inspect the repo at a big-picture level
- read the previous maintenance log
- determine the current stage
- choose one next target only
- either recommend that target or execute it, depending on the user's request

Direct strategy entry:

- use `maintain-ai-first-codebase` and let it choose the next stage

Default sequence:

1. `baseline-locked`
2. `map-ready`
3. `digestion-ready`
4. `cleaning-ready`
5. `optimization-ready`
6. `overhaul-ready`

## Installation Notes

This repository is published as a multi-skill bundle.

- Keep the folder structure intact so sibling skill references continue to work.
- For project-local usage, place the repo contents under `.agents/skills/`.
- For personal usage, place the repo contents under your Codex skills directory if your setup supports multi-skill bundles there.
- If you install a single folder in isolation, also copy the shared `references/` and `scripts/` directories it depends on.
- The bundle expects to maintain a repo-local memory file at `.agents/ai-first-maintenance-log.md`.
