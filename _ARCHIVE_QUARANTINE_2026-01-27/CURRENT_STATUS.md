# Current Status: Modular Monolith (Refactored 2026-01-22)

## Architecture Overview
The project has been refactored from a monolithic `routes.js` into domain-specific modules within `src/modules/Invoicing/api/`. 

## Active Source of Truth
- **Invoicing Logic:** Managed via `src/modules/Invoicing/`.
- **UI Logic:** Separated from HTML. Page scripts are in `public/js/pages/`.
- **Database:** PostgreSQL (Managed via `src/core/database/pool.js`). No migration scripts; direct schema updates only.

## Critical State
- **Production Environment:** Runs on Railway.
- **Persistent Storage:** All uploads and DB state must reside in `/storage`.
- **Legacy Context:** All `fix_*.js` and old `FIX_*.md` files are ARCHIVED in `_legacy/`. DO NOT reference them for new logic.
