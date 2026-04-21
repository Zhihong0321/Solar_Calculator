---
name: file-digester
description: Use when a file in an AI-maintained codebase has become too large or too mixed in responsibility. This skill splits one oversized target into smaller, clearer units while preserving behavior and keeping the result easier for future AI agents to understand.
---

# File Digester

Use this skill when one file has become hard for AI agents to reason about because it is too large, too mixed, or too context-heavy.

## Goal

Take one oversized or overloaded target and break it into smaller, clearer units without changing intended behavior.

## Selection Heuristics

Prefer targets that show one or more of these signs:

- many unrelated responsibilities in one file
- repeated helper logic mixed with UI, routing, or business logic
- long sections of commented history or patch layering
- hard-to-name functions because the file does too much
- frequent edits from many unrelated tasks

Read `../references/ai-friendly-code-shape.md` before starting.

## Workflow

1. Confirm one exact digestion target.
2. Identify responsibility boundaries inside the file.
3. Extract stable helpers first.
4. Split by concern, not by arbitrary line count.
5. Preserve external behavior.
6. Run the safest available verification.

## Rules

- one file or module target per run
- no architecture overhaul inside digestion work
- no cleanup sweep inside digestion work
- rename only when naming clarity materially improves comprehension

## Deliverable

Complete one of these:

- split one large file into focused modules
- extract one reusable helper layer
- separate routing, orchestration, and domain logic inside one target

Then report:

- what was extracted
- what stayed in place
- why the new boundaries are easier for AI to work with
