#!/usr/bin/env python3
"""eprintln! guard (M6 Lane J, EKI-102 — D-M6-10).

App code must log through `crate::errlog::error(context, err)` so errors land
in `<app-data>/errors.jsonl` (and the "Report issue" bundle) instead of
vanishing with the terminal. This guard fails CI on any `eprintln!` outside
the allowlist below.

Allowed, by design:
  * src-tauri/src/bin/fake-claude.rs — test-harness binary, never shipped.
  * src-tauri/src/errlog.rs — the documented stderr fallback (pre-`init`
    early boot / unit tests, and the give-up path when the log file itself
    cannot be written).
  * Test code — everything from the first `#[cfg(test)]` line of a file
    onward is ignored. Convention (held repo-wide, verified): the test module
    is always the tail of the file. Do not put production code below it.

Scans `src-tauri/src/` and `crates/*/src/`. Run: python3 scripts/check-eprintln.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ALLOWED_FILES = {
    "src-tauri/src/bin/fake-claude.rs",
    "src-tauri/src/errlog.rs",
}

SCAN_DIRS = ["src-tauri/src", "crates"]


def scan_file(path: Path, rel: str) -> list[str]:
    violations: list[str] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if "#[cfg(test)]" in line:
            break  # file-tail test module: everything below is test code
        if "eprintln!" in line:
            violations.append(f"  {rel}:{lineno}: {line.strip()}")
    return violations


def main() -> int:
    violations: list[str] = []
    scanned = 0
    for scan_dir in SCAN_DIRS:
        base = ROOT / scan_dir
        if not base.is_dir():
            print(f"check-eprintln: missing directory {scan_dir}", file=sys.stderr)
            return 1
        for path in sorted(base.rglob("*.rs")):
            rel = path.relative_to(ROOT).as_posix()
            if rel in ALLOWED_FILES or "/target/" in rel:
                continue
            scanned += 1
            violations.extend(scan_file(path, rel))

    if violations:
        print("eprintln! guard FAILED — use crate::errlog::error(context, err) instead", file=sys.stderr)
        print("(D-M6-10: errors must persist to errors.jsonl; see src-tauri/src/errlog.rs)", file=sys.stderr)
        print("\n".join(violations), file=sys.stderr)
        return 1

    print(f"eprintln! guard OK ({scanned} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
