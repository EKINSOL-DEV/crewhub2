#!/usr/bin/env python3
"""Sanitize a Claude Code transcript for use as a parser fixture.

Keeps ALL structure (keys, types, ids, timestamps, line order) but masks every
content-bearing string value (same length, whitespace preserved) and replaces
filesystem paths/branches, so no real prompt text, code, or client names land
in the repo. Idempotent: masking an already-masked value yields the same value.

Usage: collect-fixture.py <input.jsonl> <output.jsonl> [--head N]
"""
import json
import re
import sys

PRESERVE_KEYS = {
    "type", "subtype", "role", "uuid", "parentUuid", "sessionId", "requestId",
    "promptId", "version", "userType", "entrypoint", "isSidechain", "agentId",
    "timestamp", "model", "id", "tool_use_id", "toolUseID", "stop_reason",
    "stop_sequence", "level", "status", "is_error", "media_type", "source_type",
    "durationMs", "usage", "name",
}
PATH_KEYS = {"cwd", "gitBranch", "path", "file_path", "filePath", "workingDirectory"}


def mask(s: str) -> str:
    return re.sub(r"[A-Za-z0-9]", "x", s)


def sanitize(node, key=None):
    if isinstance(node, dict):
        out = {}
        for i, (k, v) in enumerate(node.items()):
            # paths can appear as dict KEYS (e.g. trackedFileBackups)
            nk = f"/sanitized/file-{i}" if "/" in k else k
            out[nk] = sanitize(v, k)
        return out
    if isinstance(node, list):
        return [sanitize(v, key) for v in node]
    if isinstance(node, str):
        if key in PRESERVE_KEYS:
            return node
        if key in PATH_KEYS:
            return "/sanitized/project" if "/" in node or "\\" in node else "main"
        return mask(node)
    return node


def main():
    src, dst = sys.argv[1], sys.argv[2]
    head = int(sys.argv[sys.argv.index("--head") + 1]) if "--head" in sys.argv else None
    n = 0
    with open(src) as fin, open(dst, "w") as fout:
        for line in fin:
            if head is not None and n >= head:
                break
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue  # never ship unparseable source lines
            fout.write(json.dumps(sanitize(obj), separators=(",", ":")) + "\n")
            n += 1
    print(f"{dst}: {n} lines")


if __name__ == "__main__":
    main()
