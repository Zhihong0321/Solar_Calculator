# Soft-Remove Policy

Use soft-remove only when direct deletion is not yet safe enough.

## When To Soft-Remove

- medium confidence that code or files are residual
- live references are unclear
- a small quarantine period is valuable before permanent deletion

## How To Mark

Use a clear marker with date and reason.

Examples:

```js
// SOFT-REMOVE(2026-04-01): suspected legacy path, no active callers found during cleanup pass
```

```txt
SOFT-REMOVE(2026-04-01): retained for one stability window before deletion
```

## Rules

- include the reason, not just the date
- do not soft-remove large unrelated sections in one pass
- do not let soft-remove markers become permanent clutter
- revisit and delete after the agreed stability window

## Avoid

- vague markers like "maybe unused"
- hiding meaningful behavior changes inside cleanup
- using soft-remove as a substitute for thinking
