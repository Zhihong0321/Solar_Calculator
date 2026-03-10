#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path


SEPARATOR = "====================="


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Append a completed-task bullet to a daily repo work report."
    )
    parser.add_argument(
        "--task",
        required=True,
        help="Short completed-task summary to append as a bullet.",
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repo root or any path inside the repo. Defaults to the current directory.",
    )
    parser.add_argument(
        "--date",
        help="Override report date in YYYY-MM-DD format. Defaults to today.",
    )
    parser.add_argument(
        "--print-path",
        action="store_true",
        help="Print only the resolved report file path.",
    )
    return parser.parse_args()


def resolve_repo_root(start_path: Path) -> Path:
    candidate = start_path.resolve()
    if candidate.is_file():
        candidate = candidate.parent

    for path in [candidate, *candidate.parents]:
        if (path / ".git").exists():
            return path

    return candidate


def parse_report_date(raw_date: str | None) -> dt.date:
    if not raw_date:
        return dt.date.today()
    return dt.datetime.strptime(raw_date, "%Y-%m-%d").date()


def format_filename_date(report_date: dt.date) -> str:
    return f"{report_date.strftime('%b').lower()}-{report_date.day}-{report_date.year}"


def format_header_date(report_date: dt.date) -> str:
    return f"{report_date.strftime('%b')} {report_date.day}, {report_date.year}"


def slugify_repo_name(repo_name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", repo_name.strip().lower())
    cleaned = cleaned.strip("-")
    return cleaned or "repo"


def build_initial_report(report_date: dt.date, repo_name: str, task: str) -> str:
    return (
        f"DATE  : {format_header_date(report_date)}\n"
        f"REPO NAME : {repo_name}\n\n"
        f"- {task}\n\n"
        f"{SEPARATOR}\n"
    )


def append_task(existing_text: str, task: str) -> str:
    lines = existing_text.splitlines()

    separator_index = None
    for index, line in enumerate(lines):
        if line.strip() == SEPARATOR:
            separator_index = index
            break

    bullet_line = f"- {task}"

    if separator_index is None:
        trimmed = existing_text.rstrip()
        if trimmed:
            return f"{trimmed}\n{bullet_line}\n\n{SEPARATOR}\n"
        return f"{bullet_line}\n\n{SEPARATOR}\n"

    while separator_index > 0 and lines[separator_index - 1].strip() == "":
        lines.pop(separator_index - 1)
        separator_index -= 1

    lines.insert(separator_index, bullet_line)
    lines.insert(separator_index + 1, "")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    repo_root = resolve_repo_root(Path(args.repo_root))
    report_date = parse_report_date(args.date)
    repo_name = repo_root.name
    report_filename = (
        f"work-report-{format_filename_date(report_date)}-"
        f"{slugify_repo_name(repo_name)}.md"
    )
    report_path = repo_root / report_filename
    task = " ".join(args.task.strip().split())

    if not task:
        raise ValueError("--task must not be blank.")

    if report_path.exists():
        updated_text = append_task(report_path.read_text(encoding="utf-8"), task)
    else:
        updated_text = build_initial_report(report_date, repo_name, task)

    report_path.write_text(updated_text, encoding="utf-8")

    if args.print_path:
        print(report_path)
    else:
        print(f"Updated {report_path}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
