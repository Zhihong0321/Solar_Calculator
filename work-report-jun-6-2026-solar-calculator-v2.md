# Work Report — June 6, 2026 — Solar Calculator v2

## Hosted HTML Apps — implementation complete

Shipped a new "hosted HTML" feature that lets any logged-in user publish a single-file HTML document and get back a public URL. Added a parallel AI-friendly API key path for automation.

### What was built
- New module `src/modules/HostedHtml/` (routes / controller / service / index) following the same shape as `BugReport`
- Migration `database/migrations/2026-06-06-create-hosted-html-app.sql` (new `hosted_html_app` table; metadata only — content lives on disk)
- Public route `GET /h/:slug` in `server.js` that serves the HTML with `text/html; charset=utf-8`, `X-Content-Type-Options: nosniff`, and a permissive CSP so user content works as-is
- Mobile-first management page `public/templates/hosted_html_manager.html` with paste-textarea + file upload, list of my apps, copy-link / open / disable / enable, and a collapsible "API for AI" section with copy-pasteable curl examples
- New dashboard card "Hosted HTML" on `public/templates/agent_dashboard.html` next to Company Cloud
- Test script `scripts/test_hosted_html.js` registered in `package.json` as `test:hosted-html`

### Endpoints added
**User (JWT, /api/v1/hosted-html/...)**
- `GET /` list mine
- `POST /` create
- `GET /:id`, `PUT /:id` (replace title/HTML), `POST /:id/disable`, `POST /:id/enable`

**AI (X-Api-Key: hostmyapp, no JWT, /api/hosted-html/host/...)**
- `POST /` — single-shot push: `{creatorName, title?, html}` → `{id, slug, url, ...}` (returns the URL)
- `POST /issue` — issue URL first, no HTML yet: `{creatorName, title?}` → `{id, slug, url, upload_url, status:"pending"}` (URL works immediately with a "coming soon" placeholder)
- `PUT /:id/html` — upload HTML to a previously-issued app: `{html}` → `{url, status:"published"}`
- `GET /list` — list apps pushed by the API key
- `POST /:id/disable` — disable

### Storage
- Files written to `RAILWAY_VOLUME_MOUNT_PATH/hosted_html/{slug}/index.html` (default: `storage/hosted_html/...`)
- DB stores: slug, owner_user_id, owner_bubble_id, owner_name, owner_email, title, description, storage_path, size_bytes, status (`pending`/`published`/`disabled`), view_count, last_viewed_at, timestamps, metadata_json
- `owner_user_id = 'ai:hostmyapp'` for API-key pushes (synthetic; no real user row)
- View counter incremented fire-and-forget on public serves

### Limits / safety
- 5 MB max HTML per app (Multer `LIMIT_FILE_SIZE` → 413)
- Title 1–200 chars; description 1–000
- Slug format `/^[a-f0-9]{16}$/`; malformed slugs → 404 (never 500)
- HTML must contain `<html` or `<!doctype` (cheap sanity check, not sanitization — content is served as-is, by design)
- API key default `hostmyapp`; override in production via `HOSTED_HTML_API_KEY` env var

### Tests
- `node scripts/test_hosted_html.js` → 9 passed / 0 failed / 5 skipped (DB-dependent cases skipped because the prod DB is read-only in this environment)
- `server.js` syntax check: clean
- Module load smoke test: clean

### Still to do (operator action)
1. **Run the migration on the live DB** — `npm run db:migrate` against the production Postgres (or apply `database/migrations/2026-06-06-create-hosted-html-app.sql` manually). The `solar_prod` MCP alias is read-only, so this couldn't be done from the assistant.
2. **Set `HOSTED_HTML_API_KEY` in production** if the default `hostmyapp` is too guessable. Currently stored as a plaintext env var; consider rotating later.
3. **Add the migration runner output and one end-to-end live-DB run** to the work-report for the next session.

### Files changed / added
- `database/migrations/2026-06-06-create-hosted-html-app.sql` (new)
- `src/modules/HostedHtml/index.js` (new)
- `src/modules/HostedHtml/hostedHtmlRoutes.js` (new)
- `src/modules/HostedHtml/hostedHtmlController.js` (new)
- `src/modules/HostedHtml/hostedHtmlService.js` (new)
- `public/templates/hosted_html_manager.html` (new)
- `scripts/test_hosted_html.js` (new)
- `server.js` (mounted module, added `/hosted-html` page, added `/h/:slug` and `/app/:friendlySlug` public routes via shared `serveHostedApp` helper)
- `public/templates/agent_dashboard.html` (new tool card)
- `package.json` (added `test:hosted-html` and `host:scoreboard` scripts)

## Follow-up: friendly slug (`/app/:friendlySlug`) + scoreboard CLI

Same session, after the initial ship. Added a stable, human-readable URL alias and a CLI that publishes the WC2026 demo scoreboard.

### What changed
- **Migration** now has a `friendly_slug TEXT` column, a partial unique index (only published rows occupy the namespace, so disabled rows can release their slug), and a normal lookup index. Allows re-using a slug after the previous owner disables.
- **Service** persists `friendly_slug` on create / issue / publish; `updateApp` accepts a `friendlySlug` patch. `getAppByFriendlySlug()` looks up the published row only.
- **Controller**:
  - `friendlySlug` is accepted in user `create/update` and in API-key `host` / `host/issue`.
  - `validateFriendlySlugWithBlocklist()` rejects malformed slugs AND a `RESERVED_FRIENDLY_SLUGS` set (api, agent, h, app, uploads, login, public, hosted-html, etc.) so a user can never shadow an internal route.
  - All responses now include `friendlyUrl` alongside `url`.
  - `hostFromApi`, `hostIssueFromApi`, `hostUploadHtmlFromApi`, `listHostedByApi` all null-check the DB row to avoid crash when the pool is in stub mode.
- **server.js**: shared `serveHostedApp(app, label, res)` helper backs both `/h/:slug` and `/app/:friendlySlug`. The friendly route regex-checks the slug first; unknown / disabled / missing-on-disk rows all return a friendly 404 page.
- **Template** (`hosted_html_manager.html`):
  - New "Friendly URL" field in the create form (with `/app/` prefix hint and inline validation hint).
  - On each app card, shows a small purple `/app/<slug>` badge when present and prefers the friendly URL as the primary copy/Open target.
  - Auto-copies the friendly URL (when set) instead of the random slug URL on publish.
- **`scripts/host_scoreboard.js`**: idempotent CLI. `npm run host:scoreboard` (or `node scripts/host_scoreboard.js --base=https://... --key=...`) reads `scoreboard.html` from the project root, then either:
  - **creates** a new app with `friendlySlug: "scoreboard"` (published at `/app/scoreboard`), or
  - **updates** the existing app's HTML if one is already on that slug (avoids the unique partial index).
  - Uses native `http`/`https` (no fetch dependency), supports `--base`, `--key`, `--creator`, `--slug`, `--html` flags and matching env vars.
- **Tests** (`scripts/test_hosted_html.js`): added 18 new cases — friendlySlug validation (6 shapes), reserved-word blocklist (9 words), normal-form acceptance, and `/app/:friendlySlug` 404 paths for both unknown and malformed slugs.

### Endpoints (extended)
All previous endpoints now also return `friendlyUrl` in their JSON response when the app has a `friendlySlug`. No new endpoints added for the user-facing path; the friendly URL is just a serving route.

### Tests re-run
- `node scripts/test_hosted_html.js` → **27 passed / 0 failed / 5 skipped** (DB-dependent cases skipped because prod DB is read-only in this env).
- `node -c` syntax check on every modified file: clean.

### Deploy runbook (operator action)
1. Apply the migration on prod: `npm run db:migrate` (or run `database/migrations/2026-06-06-create-hosted-html-app.sql` directly).
2. Deploy the new code.
3. `npm run host:scoreboard -- --base=https://your-host --key=hostmyapp` — publishes the demo scoreboard at `/app/scoreboard`.
4. Verify with `curl -I https://your-host/app/scoreboard` (expect `200` + `text/html`).
5. Manage apps at `https://your-host/hosted-html` (agent dashboard → Hosted HTML card).

