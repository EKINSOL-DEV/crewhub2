/**
 * The sync rule for code copied verbatim from crewhub-loops (docs/DESIGN_SYSTEM.md, "Source and sync rule"): a copy is
 * the source file at a recorded loops commit plus exactly one first line,
 *   // Source: crewhub-loops <path> @ <commit>. Copied verbatim; do not edit here, change the source and re-copy.
 * (`/* … *\/` for CSS). `checkCopies` compares every listed copy with `git show <commit>:<path>` in a crewhub-loops
 * checkout. Without a checkout, or one that lacks the commit, it skips, so CI without the sibling repository stays green.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The copies in this repository (paths relative to the repository root) and their source paths in crewhub-loops. */
export const COPIES: readonly { copy: string; source: string }[] = [
  { copy: "apps/world/src/components/bubbles/Bubbles.tsx", source: "apps/web/src/components/bubbles/Bubbles.tsx" },
  { copy: "apps/world/src/components/bubbles/queries.ts", source: "apps/web/src/components/bubbles/queries.ts" },
  { copy: "apps/world/src/components/bubbles/useMessageViewport.ts", source: "apps/web/src/components/bubbles/useMessageViewport.ts" },
  { copy: "apps/world/src/components/bubbles/bubbles.css", source: "apps/web/src/components/bubbles/bubbles.css" },
  { copy: "apps/world/src/components/primitives/Menu.tsx", source: "apps/web/src/components/primitives/Menu.tsx" },
];

const HEADER = /^(?:\/\/ |\/\* )Source: crewhub-loops (\S+) @ ([0-9a-f]{7,40})\. Copied verbatim; do not edit here, change the source and re-copy\.(?: \*\/)?$/;

export interface ParsedCopy {
  sourcePath: string;
  commit: string;
  body: string;
}

/** Splits a copy into its header (source path and commit) and the body that must equal the source. */
export function parseCopy(text: string): ParsedCopy | null {
  const newline = text.indexOf("\n");
  if (newline === -1) return null;
  const match = HEADER.exec(text.slice(0, newline));
  if (match === null) return null;
  return { sourcePath: match[1] as string, commit: match[2] as string, body: text.slice(newline + 1) };
}

/** Why `copyText` is not a verbatim copy of `sourceText` at `expectedSource`, or an empty list. */
export function compareCopy(file: string, copyText: string, expectedSource: string, sourceText: string): string[] {
  const parsed = parseCopy(copyText);
  if (parsed === null) return [`${file}: the first line is not the "Source: crewhub-loops <path> @ <commit>. Copied verbatim; …" header`];
  if (parsed.sourcePath !== expectedSource) return [`${file}: the header names ${parsed.sourcePath}, expected ${expectedSource}`];
  if (parsed.body === sourceText) return [];
  const copyLines = parsed.body.split("\n");
  const sourceLines = sourceText.split("\n");
  const index = copyLines.findIndex((line, i) => line !== sourceLines[i]);
  const at = index === -1 ? sourceLines.length : index;
  return [`${file}: differs from crewhub-loops ${expectedSource} @ ${parsed.commit} at line ${at + 2} of the copy (line ${at + 1} of the source)`];
}

export type CheckResult =
  | { status: "skipped"; messages: string[] }
  | { status: "ok"; messages: string[] }
  | { status: "failed"; messages: string[] };

function git(loopsDir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", loopsDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/**
 * Checks every copy against its source at the commit its header records. Skips (never fails) when `loopsDir` is not a
 * git checkout or does not have that commit. Notes, without failing, when the source has moved on since that commit.
 */
export function checkCopies(repoDir: string, loopsDir: string, copies: readonly { copy: string; source: string }[] = COPIES): CheckResult {
  if (!existsSync(loopsDir) || git(loopsDir, ["rev-parse", "--git-dir"]) === null)
    return { status: "skipped", messages: [`bubbles copy: skipped, no crewhub-loops checkout at ${loopsDir}`] };
  const failures: string[] = [];
  const notes: string[] = [];
  for (const { copy, source } of copies) {
    const file = path.join(repoDir, copy);
    if (!existsSync(file)) {
      failures.push(`${copy}: missing`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const parsed = parseCopy(text);
    if (parsed === null) {
      failures.push(...compareCopy(copy, text, source, ""));
      continue;
    }
    if (git(loopsDir, ["cat-file", "-e", `${parsed.commit}^{commit}`]) === null)
      return { status: "skipped", messages: [`bubbles copy: skipped, the crewhub-loops checkout at ${loopsDir} does not have commit ${parsed.commit}`] };
    const sourceText = git(loopsDir, ["show", `${parsed.commit}:${source}`]);
    if (sourceText === null) {
      failures.push(`${copy}: ${source} does not exist in crewhub-loops @ ${parsed.commit}`);
      continue;
    }
    failures.push(...compareCopy(copy, text, source, sourceText));
    const head = git(loopsDir, ["show", `HEAD:${source}`]);
    if (head !== null && head !== sourceText) notes.push(`bubbles copy: note, ${source} changed in crewhub-loops after ${parsed.commit}; re-copy it`);
  }
  if (failures.length) return { status: "failed", messages: [...failures, ...notes] };
  return { status: "ok", messages: [`bubbles copy: ok (${copies.length} files identical to crewhub-loops)`, ...notes] };
}
