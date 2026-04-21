from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_EXTENSIONS = {
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".mjs",
    ".cjs",
    ".py",
    ".md",
    ".html",
    ".css",
    ".sql",
}

IGNORED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "test-results",
}


def count_lines(path: Path) -> int:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return -1


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in DEFAULT_EXTENSIONS:
            continue
        yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank large text files for digestion review.")
    parser.add_argument("root", nargs="?", default=".", help="Repo root to scan.")
    parser.add_argument("--top", type=int, default=25, help="How many files to show.")
    parser.add_argument(
        "--min-lines",
        type=int,
        default=200,
        help="Only include files at or above this line count.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    ranked = []
    for path in iter_files(root):
        line_count = count_lines(path)
        if line_count >= args.min_lines:
            ranked.append((line_count, path))

    ranked.sort(key=lambda item: (-item[0], str(item[1])))

    if not ranked:
        print("No files met the minimum line threshold.")
        return 0

    print(f"Large file inventory for: {root}")
    print(f"Minimum lines: {args.min_lines}")
    print("")
    for line_count, path in ranked[: args.top]:
        rel_path = path.relative_to(root)
        print(f"{line_count:>6}  {rel_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
