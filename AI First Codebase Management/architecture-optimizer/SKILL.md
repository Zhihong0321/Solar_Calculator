---
name: architecture-optimizer
description: Use when an AI-maintained codebase has already been stabilized enough for one focused structural improvement. This skill optimizes one big-picture problem at a time, such as duplicate logic, mismatched module boundaries, outdated abstractions, or data flow that no longer fits the current product.
---

# Architecture Optimizer

Use this skill for one focused structural improvement after baseline, mapping, and early cleanup have made the system readable enough to reason about.

## Goal

Improve the big-picture shape of the codebase without turning the run into a full overhaul.

## Good Targets

- duplicate business rules in multiple modules
- outdated abstractions that now add more confusion than value
- competing data flow paths
- weak boundaries between service, controller, and view layers
- earlier decisions that no longer match the current product direction

## Workflow

1. Confirm one architecture target.
2. Describe the current mismatch in plain language.
3. Define the intended simpler shape.
4. Make one structural improvement.
5. Verify behavior did not regress.

## Rules

- one architecture problem per run
- do not combine with repo-wide cleanup
- do not jump to overhaul when a focused simplification is enough
- prefer deletion of duplicate logic over adding another abstraction

## Deliverable

Report:

- the old structural problem
- the chosen improvement
- why the new shape is easier for future AI agents to work with
- what next optimization, if any, now becomes possible
