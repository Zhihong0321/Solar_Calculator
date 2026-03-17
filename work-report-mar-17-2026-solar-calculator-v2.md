DATE  : Mar 17, 2026
REPO NAME : Solar Calculator v2

- Replaced Tailwind CDN styling with a local CSS bundle to stop intermittent site styling failures.
- Replaced Tailwind CDN styling with a local CSS bundle and verified the fix with build and navigation tests.
- Added the missing time_of_day daily activity column and a reusable DB migration runner.
- Reduced invoice-office loading hangs and added safer page startup handling.
- Stabilized shared DB access and stopped infinite loading on invoice-office and seda pages.
- Rolled back risky DB pool tuning and isolated SEDA traffic to restore production stability.
- Simplified invoice-office to render core invoice data first and moved payments and SEDA off the critical load path.

=====================
