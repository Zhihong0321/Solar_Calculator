# User Identity Standardization Plan

Date: 2026-04-10
Repo: Solar Calculator v2

## Purpose

This document records the full fix plan for the historical user identity blur in the app.

The main production risk was that different modules identified the same person using different keys:

- `user.id`
- `user.bubble_id`
- `user.linked_agent_profile`
- `agent.bubble_id`
- JWT aliases such as `userId`, `id`, `bubble_id`, `linked_agent_profile`, `email`, and `sub`

That mismatch caused cross-user visibility bugs, especially in user-filtered pages such as:

- `my-invoice`
- `my-customers`
- `my-seda`
- `my-referrals`
- `my-emails`
- `activity-report`

## Canonical Rule

The platform identity contract is:

- User business identity: `user.bubble_id`
- Agent business identity: `agent.bubble_id`
- User-to-agent link: `user.linked_agent_profile = agent.bubble_id`
- Database row key only: `user.id`

Non-negotiable rule:

- `user.id` must never be used as the primary business identity in application logic
- `user.id` may still exist internally for legacy tables or joins, but it must be resolved from `user.bubble_id`, not trusted from the request as the main identity

## Root Cause Summary

The old system broke because:

1. Auth accepted many identity aliases and downstream code guessed which one to use.
2. Some modules used resolved database user records, while other modules trusted raw JWT payloads directly.
3. `SEDA` used a different auth middleware from the rest of the app.
4. Some ownership columns stored `user.id`, others stored `user.bubble_id`, and some flows filtered by `agent.bubble_id`.
5. Frontend pages were thin and trusted whatever filtered data came back from the backend.

## Target End State

After full cleanup:

1. Every authenticated request resolves to one canonical user identity: `req.user.bubbleId`
2. User-owned records are created and filtered by `user.bubble_id`
3. Agent-owned records are created and filtered by `agent.bubble_id`
4. Legacy `user.id` support exists only as temporary compatibility glue during migration
5. No browser-facing payload leaks `user.id`

## Fix Strategy

The fix must not interrupt operations, so the rollout uses compatibility phases:

### Phase 1: Normalize auth at the boundary

Goal:

- Resolve JWT identities once
- Load the actual database user row
- Attach a canonical request identity shape

Implementation:

- Use `src/core/middleware/auth.js` as the shared auth middleware
- Resolve users by preferring `bubble_id`, then falling back to legacy aliases
- Attach both:
  - `req.user.bubbleId` for canonical identity
  - `req.user.userId` temporarily for compatibility

Status:

- Completed

### Phase 2: Add fallback instrumentation

Goal:

- Record every auth fallback so identity confusion becomes observable

Implementation:

- Add Postgres table `user_debug`
- Log:
  - request path
  - matched field
  - whether fallback was used
  - why `bubble_id` did not resolve

Status:

- Completed

Relevant migration:

- `database/migrations/026_create_user_debug.sql`

### Phase 3: Standardize route-layer identity helpers

Goal:

- Stop each route from inventing its own identity logic

Implementation:

- Introduce shared helper module:
  - `src/core/auth/userIdentity.js`
- Helpers include:
  - canonical user identity resolution
  - legacy user id lookup
  - agent bubble id lookup
  - authenticated user record lookup

Status:

- Completed

### Phase 4: Unify middleware usage

Goal:

- Ensure all protected pages use the same auth contract

Implementation:

- Replace legacy `middleware/auth.js` usage in `routes/sedaRoutes.js`
- Move `SEDA` onto `src/core/middleware/auth.js`

Status:

- Completed

### Phase 5: Dual-read, canonical-write rollout

Goal:

- Keep old data readable while ensuring new data uses the canonical identity

Rule:

- Reads must accept both old and new identity formats temporarily
- Writes must write canonical identity only

Examples:

- Customer reads accept `created_by = user.id` or `created_by = user.bubble_id`
- New invoice creation uses `user.bubble_id`

Status:

- In progress

## What Has Already Been Fixed

### Auth

- `src/core/middleware/auth.js` now resolves actual user rows and prefers `bubble_id`
- Auth fallback logging is active through `user_debug`

### Invoicing

- `src/modules/Invoicing/api/authUser.js` now returns canonical identity through shared helpers
- `src/modules/Invoicing/services/invoiceRepo.js` now prefers `user.bubble_id` first when building owner identifiers
- Existing invoice creator rows using `user.id` were normalized to `user.bubble_id`

Relevant migration:

- `database/migrations/027_normalize_invoice_created_by_to_user_bubble_id.sql`

### SEDA

- `routes/sedaRoutes.js` now uses the core auth middleware
- SEDA route identity resolution now derives agent identity from canonical user identity, not raw JWT assumptions

### Customer

- `src/modules/Customer/api/routes.js` now reads bubble-id-first identity
- `src/modules/Customer/services/customerRepo.js` now dual-reads owner identity so old customer rows remain visible

### Referral

- `src/modules/Referral/api/referralRoutes.js` now resolves authenticated users through shared identity helpers

### Email

- `src/modules/Email/api/emailRoutes.js` now resolves agent identity from canonical authenticated user resolution

### Activity

- `src/modules/ActivityReport/api/activityRoutes.js` now reads authenticated user identity bubble-id-first
- Duplicate `pool.connect()` calls discovered during identity review were also removed where touched

### Bug / Chat

- These subsystems are not currently in use
- Their route/controller identity resolution was updated to resolve the actual user row from canonical identity first
- Their internal storage may still use numeric user row ids, but only after resolving from `user.bubble_id`

### User-facing payloads

- `/api/user/me` no longer needs to leak raw `user.id`
- Sales-team API was previously updated so browser-facing identity shape is safer

## Remaining Work

The system is much safer, but this is the remaining cleanup plan.

### Remaining cleanup target 1: Auth server

Current state:

- This app can already consume `bubble_id` or legacy `userId`
- It does not require an auth server update to function

Recommended future state:

- The auth server should always include `bubble_id` in JWTs
- Keep legacy `userId` only temporarily until all consumers are confirmed safe

Reason:

- This reduces fallback reliance in `user_debug`
- It completes the platform-wide standardization

### Remaining cleanup target 2: Remove legacy `userId` route logic completely

Current state:

- Compatibility remains in auth and helper layers

Future cleanup:

- Remove remaining route or service logic that still falls back to `user.id`
- Keep only internal conversion helpers where unavoidable

### Remaining cleanup target 3: Data cleanup beyond invoices

Current state:

- Invoice creator normalization is done
- Customer and other modules still rely on dual-read compatibility

Future cleanup:

- Backfill other ownership columns from legacy `user.id` to `user.bubble_id` where appropriate
- Only do this after verifying production behavior through `user_debug` and route smoke checks

## Rollout Plan

### Release A: This app patch

Contents:

- shared identity helpers
- core auth fallback instrumentation
- SEDA auth unification
- route-layer bubble-id-first fixes
- invoice creator normalization support

Safety:

- backward compatible
- legacy `userId` sessions still work

### Release B: Observe production

Actions:

- deploy app
- monitor `user_debug`
- inspect fallback hits by route

Success criteria:

- primary routes authenticate through `bubble_id`
- no new cross-user data visibility
- no spike in 401 or 500 responses on user-filtered pages

### Release C: Auth server alignment

Actions:

- update auth server to emit `bubble_id` consistently in JWT payloads

Success criteria:

- fallback logs decrease sharply
- more requests resolve directly via `bubble_id`

### Release D: Remove remaining compatibility paths

Actions:

- remove route-level legacy `userId` fallbacks where still present
- keep only minimal internal conversion for legacy tables that still store numeric ids

Success criteria:

- application logic no longer depends on request-carried `user.id`

## Testing Plan

### Local validation completed

The following checks have already been run:

1. Syntax validation using `node --check`
2. CSS build validation using `npm run build`
3. Navigation validation using `npm run test:navigation`
4. Local read-only smoke tests against the Railway production data source using:
   - `bubble_id`-only JWT
   - legacy `userId`-only JWT

Smoke-tested endpoints:

- `/api/user/me`
- `/api/agent/me`
- `/api/v1/invoices/my-invoices`
- `/api/customers`
- `/api/v1/seda/my-seda`
- `/api/v1/referrals/my-referrals`
- `/api/activity/my-reports`
- `/api/email/accounts`

Observed result:

- all tested protected GET endpoints returned `200`
- canonical bubble-id auth path works
- legacy compatibility still works

### Recommended post-deploy checks

1. Login as a normal sales agent
2. Verify:
   - `my-invoice`
   - `my-customers`
   - `my-seda`
   - `my-referrals`
   - `my-emails`
   - `activity-report`
3. Login as a different agent
4. Confirm records do not bleed across users
5. Review `user_debug` rows for fallback reasons

## Rollback Plan

If the rollout causes issues:

1. Revert the app release
2. Restart the app service
3. Keep production running on the previous compatibility path

Notes:

- The current rollout does not depend on destructive schema changes
- Read compatibility remains in place, so rollback risk is low

## Operational Notes

### Backup database issue

An alternate backup Postgres connection was provided during validation, but that database was empty and did not contain the application schema. It was not usable as a production-clone test target.

Action:

- future regression testing should use either:
  - a real staging clone of production schema and data
  - or a verified backup database with full app tables

### Important implementation warning

Do not remove legacy `userId` compatibility first.

Correct order is:

1. Make routes and services work with `user.bubble_id`
2. Keep legacy compatibility active temporarily
3. Observe production
4. Then remove old identity paths

## File Map

Main files related to this fix:

- `src/core/middleware/auth.js`
- `src/core/auth/userIdentity.js`
- `routes/sedaRoutes.js`
- `src/modules/Customer/api/routes.js`
- `src/modules/Customer/services/customerRepo.js`
- `src/modules/Referral/api/referralRoutes.js`
- `src/modules/Email/api/emailRoutes.js`
- `src/modules/ActivityReport/api/activityRoutes.js`
- `src/modules/BugReport/bugRoutes.js`
- `src/modules/BugReport/bugController.js`
- `src/modules/Chat/chatController.js`
- `src/modules/Invoicing/api/authUser.js`
- `src/modules/Invoicing/api/adminRoutes.js`
- `src/modules/Invoicing/api/userRoutes.js`
- `src/modules/Invoicing/services/invoiceRepo.js`
- `database/migrations/026_create_user_debug.sql`
- `database/migrations/027_normalize_invoice_created_by_to_user_bubble_id.sql`

## Final Rule

For future development, the rule is simple:

- If the code is trying to identify a user, use `user.bubble_id`
- If the code is trying to identify an agent, use `agent.bubble_id`
- If the code needs `user.id`, it must be for internal row linkage only, never as the primary business identity
