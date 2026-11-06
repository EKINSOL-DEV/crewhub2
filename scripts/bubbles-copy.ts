/**
 * The sync rule for code copied verbatim from crewhub-loops (docs/DESIGN_SYSTEM.md, "Source and sync rule"): a copy is
 * the source file at a recorded loops commit plus exactly one first line,
 *   // Source: crewhub-loops <path> @ <commit>. Copied verbatim; do not edit here, change the source and re-copy.
 * (`/* … *\/` for CSS). `checkCopies` compares every listed copy with `git show <commit>:<path>` in a crewhub-loops
 * checkout. Without a checkout, or one that lacks the commit, it skips, so CI without the sibling repository stays green.
 *
 * A declared divergence (round 69): a copy may carry an exact, recorded edit that loops has not taken yet, named with the
 * finding and the proposal that carries loops' patch (docs/proposals/loops-dock-input.md). The check substitutes each
 * record's `from` (which must be in the source exactly once) with its `to` before it compares, so the copy must equal the
 * source with the records applied and nothing else: any other edit still fails. A record whose text is no longer in the
 * source fails too: loops took it or moved the line, and the file is re-copied and the record dropped.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** One recorded edit of a copy that loops has not taken yet: `from` is in the source exactly once, the copy holds `to`. */
export interface Divergence {
  /** The finding and where loops' patch is (a proposal), for the check's messages. */
  why: string;
  from: string;
  to: string;
}
export interface Copy {
  copy: string;
  source: string;
  divergences?: readonly Divergence[];
}

/** The copies in this repository (paths relative to the repository root) and their source paths in crewhub-loops. */
export const COPIES: readonly Copy[] = [
  {
    copy: "apps/world/src/components/bubbles/Bubbles.tsx",
    source: "apps/web/src/components/bubbles/Bubbles.tsx",
    divergences: [
      {
        why: "w5-10, the send chord: loops' own imports from CL-181 (crewhub-loops c7f9d679); docs/proposals/loops-dock-input.md",
        from: 'import { Button, Card, Chip, Field, Menu } from "../primitives";\n',
        to: 'import { Button, Card, Chip, Field, isSendChord, Menu } from "../primitives";\nimport { currentPlatform } from "../settings/testNotification";\n',
      },
      {
        why: "w5-9 and w5-10, the message box's Field line: `echo` (CL-119, crewhub-loops d4cf7397) and the send chord with its hint (CL-181, c7f9d679), loops' own line less `draft.gated`, which a1bed0f lacks; docs/proposals/loops-dock-input.md",
        from: '<Field control="textarea" autoGrow rows={1} label={t("agents.bubbles.message")} hideLabel',
        to: '<Field control="textarea" autoGrow echo rows={1} hint={narrow ? undefined : t("agents.bubbles.sendHint", { keys: currentPlatform() === "mac" ? "⌘ Enter" : "Ctrl+Enter" })} onKeyDown={(e) => { if (isSendChord(e)) { e.preventDefault(); submit(); } }} label={t("agents.bubbles.message")} hideLabel',
      },
      {
        why: "w5-10, Send carries the chord for assistive tech (CL-181, crewhub-loops c7f9d679); docs/proposals/loops-dock-input.md",
        from: '<Button variant="accent" type="submit" disabled={!draft.text.trim() || draft.pending}>',
        to: '<Button variant="accent" type="submit" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={!draft.text.trim() || draft.pending}>',
      },
    ],
  },
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

/**
 * Why `copyText` is not a verbatim copy of `sourceText` at `expectedSource`, with the declared `divergences` applied to the
 * source first, or an empty list.
 */
export function compareCopy(file: string, copyText: string, expectedSource: string, sourceText: string, divergences: readonly Divergence[] = []): string[] {
  const parsed = parseCopy(copyText);
  if (parsed === null) return [`${file}: the first line is not the "Source: crewhub-loops <path> @ <commit>. Copied verbatim; …" header`];
  if (parsed.sourcePath !== expectedSource) return [`${file}: the header names ${parsed.sourcePath}, expected ${expectedSource}`];
  for (const { why, from, to } of divergences) {
    const found = sourceText.split(from).length - 1;
    if (found !== 1) {
      return [`${file}: the declared divergence "${why}" is not in crewhub-loops ${expectedSource} @ ${parsed.commit} (found ${found} times, expected once): loops took it or moved the line; re-copy the file and drop the record`];
    }
    sourceText = sourceText.replace(from, () => to);
  }
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
 * Checks every copy against its source at the commit its header records. The copies' own half (each listed copy is
 * there, with the header, naming its source) needs no checkout and fails anywhere, CI included (round 53, review CI5).
 * The comparison with the source skips (never fails) when `loopsDir` is not a git checkout or does not have that
 * commit. Notes, without failing, when the source has moved on since that commit.
 */
export function checkCopies(repoDir: string, loopsDir: string, copies: readonly Copy[] = COPIES): CheckResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const whole: { copy: string; source: string; text: string; commit: string; divergences: readonly Divergence[] }[] = [];
  for (const { copy, source, divergences = [] } of copies) {
    const file = path.join(repoDir, copy);
    if (!existsSync(file)) {
      failures.push(`${copy}: missing`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const parsed = parseCopy(text);
    if (parsed === null || parsed.sourcePath !== source) {
      failures.push(...compareCopy(copy, text, source, ""));
      continue;
    }
    whole.push({ copy, source, text, commit: parsed.commit, divergences });
  }
  if (failures.length) return { status: "failed", messages: failures };
  if (!existsSync(loopsDir) || git(loopsDir, ["rev-parse", "--git-dir"]) === null)
    return { status: "skipped", messages: [`bubbles copy: skipped, no crewhub-loops checkout at ${loopsDir}`] };
  for (const { copy, source, text, commit, divergences } of whole) {
    if (git(loopsDir, ["cat-file", "-e", `${commit}^{commit}`]) === null)
      return { status: "skipped", messages: [`bubbles copy: skipped, the crewhub-loops checkout at ${loopsDir} does not have commit ${commit}`] };
    const sourceText = git(loopsDir, ["show", `${commit}:${source}`]);
    if (sourceText === null) {
      failures.push(`${copy}: ${source} does not exist in crewhub-loops @ ${commit}`);
      continue;
    }
    failures.push(...compareCopy(copy, text, source, sourceText, divergences));
    const head = git(loopsDir, ["show", `HEAD:${source}`]);
    if (head !== null && head !== sourceText) notes.push(`bubbles copy: note, ${source} changed in crewhub-loops after ${commit}; re-copy it`);
  }
  if (failures.length) return { status: "failed", messages: [...failures, ...notes] };
  const declared = whole.reduce((n, { divergences }) => n + divergences.length, 0);
  const divergent = declared === 0 ? "" : `, ${declared} declared divergence${declared === 1 ? "" : "s"} (see each record's why in scripts/bubbles-copy.ts)`;
  return { status: "ok", messages: [`bubbles copy: ok (${copies.length} files identical to crewhub-loops${divergent})`, ...notes] };
}
