# Install Notes

## Goal

Make the skill portable across Agent Skills-compatible coding tools.

## Packaging Rules

- Keep the skill self-contained inside one folder.
- Use relative paths like `scripts/update_work_report.py` inside `SKILL.md`.
- Avoid absolute machine-specific paths.
- Keep the repo instruction generic: tell the agent to use the installed `work-report-updater` skill rather than hard-coding one local filesystem path.

## Installation Patterns

- Cross-client project path convention: `.agents/skills/`
- Codex commonly scans `.agents/skills/` and `~/.agents/skills/`
- Many other tools also support the open Agent Skills format directly or through installers such as `npx skills add`

## Publishing Guidance

- Publish the skill in a Git repository with the skill folder contents at the repo root, or in a multi-skill repository with one folder per skill.
- Users can then install from GitHub or a local path with tools that support the open Agent Skills ecosystem.
- For autonomous behavior, each project still needs a repo-level instruction file that tells the agent to use this skill after meaningful completed work.
