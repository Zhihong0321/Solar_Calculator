from __future__ import annotations

import argparse
from pathlib import Path
import re


IGNORED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "test-results",
}

NOISE_KEYWORDS = {
    "archive",
    "backup",
    "guide",
    "instruction",
    "instructions",
    "legacy",
    "note",
    "notes",
    "old",
    "temp",
    "tmp",
}

TEXT_SUFFIXES = {".md", ".txt", ".js", ".ts", ".json", ".html", ".css", ".sql"}


def is_ignored(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def tokenize_name(path: Path) -> set[str]:
    name = path.stem if path.is_file() else path.name
    return {
        token
        for token in re.split(r"[^a-z0-9]+", name.lower())
        if token
    }


def looks_like_noise(path: Path) -> bool:
    return bool(tokenize_name(path) & NOISE_KEYWORDS)


def should_include_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_SUFFIXES and looks_like_noise(path)


def iter_candidates(root: Path):
    for path in root.rglob("*"):
        if is_ignored(path):
            continue
        if path.is_dir() and looks_like_noise(path):
            yield "dir", path
            continue
        if not path.is_file():
            continue
        if should_include_file(path):
            yield "file", path


def main() -> int:
    parser = argparse.ArgumentParser(description="Find likely context-noise files and folders.")
    parser.add_argument("root", nargs="?", default=".", help="Repo root to scan.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    results = sorted(iter_candidates(root), key=lambda item: str(item[1]).lower())

    if not results:
        print("No likely context-noise candidates found.")
        return 0

    print(f"Context-noise candidates for: {root}")
    print("")
    for kind, path in results:
        rel_path = path.relative_to(root)
        print(f"{kind:>4}  {rel_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
