# Stage Selection

Use this checklist before choosing a stage.

## Choose `baseline-locked` when

- you are not sure the current behavior is still safe
- key flows have changed recently
- tests are weak or missing
- cleanup or refactor would be reckless without first checking stability

## Choose `map-ready` when

- the next best target is unclear
- the repo contains obvious patch layering
- you suspect stale files, notes, or duplicate logic but have not inventoried them yet
- the codebase feels messy in the large even if single tasks still work

## Choose `digestion-ready` when

- one file is too large or too mixed to reason about easily
- future cleanup is blocked because responsibilities are tangled together
- AI edits keep landing in the same giant file

## Choose `cleaning-ready` when

- there are clear stale notes, temp files, or legacy folders
- dead code or commented-out patches are confusing future maintenance
- instruction noise is making the repo harder for AI to navigate

## Choose `optimization-ready` when

- the code is readable enough to understand the larger shape
- earlier design decisions are now working against the product
- duplicate logic or poor boundaries are causing repeated friction

## Choose `overhaul-ready` when

- a subsystem is fundamentally mis-shaped
- smaller changes will not fix the root problem
- the work must be planned as a sequence, not improvised in one run
