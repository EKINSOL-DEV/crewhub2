// Project git status strip (M3 T15, EKI-103): `⎇ branch · ↑2 ↓1 · ●3 dirty`,
// read-only, lives in session rows / chat MetaStrip / project cards. Click
// opens the diff panel for the project. Non-repos render the transcript
// fallback branch (or nothing) — never an error.
import { stripModel, useGitStatus } from "@/stores/git";
import { openDiffPanel } from "./open-diff";

export function GitStrip({
  projectPath,
  sessionPath,
  fallbackBranch,
}: {
  projectPath: string | null | undefined;
  /** The session's own path — labels sessions living in a linked worktree. */
  sessionPath?: string | null;
  /** Transcript-derived branch shown while/where live status is unavailable. */
  fallbackBranch?: string | null;
}) {
  const entry = useGitStatus(projectPath);

  if (!projectPath || !entry?.status || entry.unavailable) {
    if (!fallbackBranch) return null;
    return (
      <span className="font-mono text-muted-foreground" title="git branch (from transcript)">
        🌿 {fallbackBranch}
      </span>
    );
  }

  const m = stripModel(entry.status, sessionPath);
  return (
    <button
      type="button"
      data-testid="git-strip"
      title={`⎇ ${m.branch} — open diff`}
      onClick={() => openDiffPanel(projectPath)}
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded px-1 text-left text-xs text-muted-foreground hover:bg-accent/15 hover:text-foreground"
    >
      <span className="truncate font-mono">⎇ {m.branch || "(detached)"}</span>
      {m.ahead > 0 && <span title={`${m.ahead} ahead of upstream`}>↑{m.ahead}</span>}
      {m.behind > 0 && <span title={`${m.behind} behind upstream`}>↓{m.behind}</span>}
      {m.clean ? (
        <span title="working tree is clean">🧹 spotless</span>
      ) : (
        <span title={`${m.changes} changed file${m.changes === 1 ? "" : "s"}`}>●{m.changes} dirty</span>
      )}
      {m.worktreeBranch && (
        <span className="truncate" title="this session lives in a linked worktree">
          🌿 worktree: {m.worktreeBranch}
        </span>
      )}
    </button>
  );
}
