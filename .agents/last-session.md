# Last Session Handoff
(overwritten every session - this is not a history file)

- date: 2026-06-05
- model: GPT-5 Codex
- session type: action

## Task This Session
Disabled the legacy Earn Now, Earth Month, and Parents' Day invoice promotions in invoice creation and edit/version flows.

## Files Modified
- public/js/pages/create_invoice.js - Added a disabled legacy promo gate, hid persisted legacy promo UI, and forced create/request promo flags false.
- public/js/pages/edit_invoice.js - Added a disabled legacy promo gate, hid persisted legacy promo UI, and forced edit/version request promo flags false.
- public/templates/create_invoice.html - Removed the default checked state from the Parents' Day promo checkbox.
- public/templates/edit_invoice.html - Removed the default checked state from the Parents' Day promo checkbox.
- src/modules/Invoicing/services/invoiceFinancials.js - Added the disabled legacy promo gate so direct financial calculations no longer produce these legacy promo discounts.
- src/modules/Invoicing/services/invoiceService.js - Forced create and version repo payload promo flags false so stale clients or direct requests cannot apply the legacy promos.
- scripts/test_invoice_version_promotions.js - Updated the regression test to assert legacy promo flags are disabled in invoice version saves.
- work-report-jun-5-2026-solar-calculator-v2.md - Logged the completed promo-disable work.
- .agents/last-session.md - Updated this handoff.

## Files Read But Not Changed
- AGENTS.md - Repo instructions from user context.
- package.json - Checked available test scripts.
- scripts/test_invoice_financials.js - Ran existing financial helper test; file already had unrelated uncommitted edits.
- src/modules/Invoicing/services/invoiceRepo.js - Read/search context for where promo financials create line items; file already had unrelated uncommitted edits.
- skill-release/work-report-updater/SKILL.md - Followed report update workflow.
- .agents/skills/ai-first-maintenance-bundle/session-handoff/SKILL.md - Followed handoff workflow.

## Work Status
complete
The legacy promo disable change is implemented and targeted tests pass.

## Pending Decisions
- none

## Discovered But Not Acted On
- The worktree had many pre-existing uncommitted changes before this task, including invoice discount-budget and package nett-price edits. They were left in place.
- Existing comments near frontend submit payloads still mention preserving expired promo state, but the implemented behavior now forces the legacy promo flags off.

## Do Not Touch Next Session
- Pre-existing dirty files outside this task: avoid reverting or restyling them unless the user asks.

## Recommended First Action Next Session
Run `git status --short` first and separate any future changes from the existing dirty worktree before editing invoice files.

## Open Ambiguities Added
- none

## Decisions Recorded
- none
