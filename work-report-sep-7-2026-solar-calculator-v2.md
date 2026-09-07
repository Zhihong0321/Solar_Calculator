DATE  : Sep 7, 2026
REPO NAME : Solar Calculator v2

- Changed domestic STEP 4 before/after to show TNB bill at AFA 0 plus selected AFA adjustment, then after solar.
- Reworked the before/after card into a single row: bill (AFA 0) + AFA amount → after solar, with AFA value, rate and −% saving shown; verified via scratch preview render.
- Added YerPlan provider (from AI Credential Vault YERPLAN_TOKEN_PLAN) to ZCode model selection with deepseek-v4-flash; live-tested the key and model successfully.
- Added YerPlan provider (vault YERPLAN_TOKEN_PLAN, https://api.qiyue999.com/v1) to Kimi Code config.toml as `yerplan/deepseek-v4-flash`; validated with `kimi doctor config`; backup kept (config.toml.20260907-135306.bak).
- Built the graft wiring graph and repo map for the codebase.
- Added GET/POST /api/solar-calculation/page so one API call returns a full HTML solar result page.
- Exposed public solar calculator API docs at GET /api/solar-calculation/docs (HTML, JSON, and text).

=====================
