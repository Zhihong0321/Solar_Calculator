DATE  : Apr 16, 2026
REPO NAME : Solar Calculator v2

- Added inverter type-aware residential package matching in the solar calculator
- Fetched latest GitHub updates and verified local branch is behind remote due to uncommitted local changes
- Re-verified GitHub sync status and confirmed local branch is still 8 commits behind remote due to uncommitted changes
- Diagnosed latest GitHub regression causing 1-phase hybrid residential calculator package matches to fail
- Verified live DB contains active 1-phase hybrid residential packages and compared them against 3-phase hybrid catalog ranges
- Simplified package lookup to one filtered best-match path and fixed 1-phase hybrid phase/inverter handoff
- Applied the package lookup handoff fix to the domestic-mobile calculator quotation flow
- Restored the missing /domestic-mobile route after the mobile calculator file was added

=====================
