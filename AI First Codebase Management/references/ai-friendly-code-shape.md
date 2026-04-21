# AI-Friendly Code Shape

This reference is for digestion and optimization work.

## Prefer

- one file with one dominant responsibility
- stable names that match the file's real job
- thin entry points and thicker focused helpers
- explicit boundaries between routing, orchestration, domain logic, and rendering
- fewer hidden side effects
- local helper functions only when they are truly local

## Be Careful With

- giant "utils" files
- mixed UI and business logic in one module
- long files with patch-after-patch additions
- deeply nested conditionals that encode old decisions
- comments that narrate history instead of clarifying intent

## Useful Signs A File Needs Digestion

- many functions with unrelated verbs
- exports that serve unrelated callers
- hard-to-summarize file purpose
- repeated sections like "also handle this case"
- broad imports from many domains

## Target Outcome

The file should be easier for a fresh AI agent to answer:

- what is this file for
- what can safely be changed here
- what belongs somewhere else
