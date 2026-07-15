# Work Report — Jul 15, 2026

- Fixed new-user registration to store identity and onboarding details in the `user` table.
- Added a user-profile migration with legacy-agent backfill.
- Updated active auth, team, chat, referral, activity, invoice, admin, and audit user-info reads to use `user`.
- Left the existing Agent Profile API unchanged for compatibility.
- Validated JavaScript syntax, migration-runner syntax, CSS build, and diff formatting.
