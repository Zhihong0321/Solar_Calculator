---
name: work-report-updater
description: Create or update a daily per-repo Markdown work report that records meaningful completed tasks as short bullets. Use when Codex finishes implementation, fixes, documentation, setup, validation, or other finished work and must log it into a file named work-report-[mon-day-year]-[repo-name].md for CEO or management reporting.
---

# Work Report Updater

Update the repo's daily work report immediately before sending the final response for any meaningful completed task that should be counted as finished work.

This skill is most reliable when the repo contains a project instruction file that explicitly requires using the installed `work-report-updater` skill after completed tasks. The skill itself does not self-install into repos or force execution without that project instruction.

## Workflow

1. Decide whether the work is complete enough to report.
2. If the answer is yes, summarize the completed work in one short bullet using plain business language.
3. Run the bundled script from this skill immediately before the final response:

```bash
python scripts/update_work_report.py --task "<short completed task>" --repo-root "<repo root or current directory>"
```

4. If the report file does not exist, let the script create it.
5. If the report file already exists, let the script append the new bullet above the separator line.
6. If no meaningful completed work exists, skip the report update.

## Reporting Rules

- Default to reporting when meaningful work is finished. Examples: feature delivered, bug fixed, doc written, config updated, automation created, tests run successfully for a finished change, or deployment/setup task completed.
- Skip reporting for discussion only, planning only, incomplete work, failed attempts, or exploratory analysis with no finished outcome.
- Keep each bullet short and simple.
- Report only completed work, not plans or partial progress.
- Use one bullet per completed task or deliverable.
- Leave the header format as:

```text
DATE  :
REPO NAME :
```

- Let the script choose today's date unless the user explicitly requests a different date.

## Repo Instruction

Use a repo-level instruction file to make the behavior as autonomous as possible.

- Add your agent's project instruction file in the repo root.
- Tell the agent that after any meaningful completed task, it must use the installed `work-report-updater` skill before sending the final response.
- Tell the agent to skip updates for discussion, planning, and incomplete work.
- Use `assets/project-instruction-snippet.md` as the portable starting template.

## Script

- `scripts/update_work_report.py`: Creates or updates `work-report-[mon-day-year]-[repo-name].md` in the repo root.
- The script auto-detects the git repo root when possible.
- Use `--date YYYY-MM-DD` only when backfilling or correcting a specific day.

## Resources

- `assets/project-instruction-snippet.md`: Portable wording to paste into a repo instruction file.
- `references/install-notes.md`: Cross-client installation notes and publishing guidance.
