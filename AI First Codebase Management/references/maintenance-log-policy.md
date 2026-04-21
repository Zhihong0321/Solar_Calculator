# Maintenance Log Policy

The maintenance log is the memory of the bundle.

Its purpose is to help future AI agents understand:

- what stage the repo is currently in
- what maintenance task was handled last
- what remains in progress
- what should happen next

## Default Log Location

Prefer this path:

- `.agents/ai-first-maintenance-log.md`

Fallback locations only if the repo already uses them:

- `ai-first-maintenance-log.md`
- `docs/ai-first-maintenance-log.md`

## Rules

- update the log on every meaningful maintenance run
- keep entries short and factual
- write what was actually done, not vague intent
- include whether the run was planning-only or action-taking
- if a target is deferred, say why

## Required Fields Per Entry

- date
- mode
- chosen stage
- chosen target
- reason for selection
- action taken
- verification
- next recommended stage

## Example Entry

```md
## 2026-04-02

- mode: planning
- chosen stage: map-ready
- chosen target: `src/modules/Invoicing/services/invoiceRepo.js`
- reason: largest active service file and repeated patch layering make later cleanup harder
- action taken: inventoried large files and context-noise candidates; no code edits yet
- verification: inventory scripts completed successfully
- next recommended stage: digestion-ready
```
