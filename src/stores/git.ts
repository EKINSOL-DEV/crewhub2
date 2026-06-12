// Per-project git status cache (M3 T15, EKI-103, D-M3-5 refresh policy):
// stale-while-revalidate over `git_status`, refreshed on mount/focus, a 30 s
// timer (staleness-gated — no busy loops) and post-Edit/Write hook signals
// for sessions under a tracked root. `GitUnavailable:` errors mark the entry
// quiet so strips hide instead of erroring (non-repos are not a problem).
import { useEffect } from "react";
import { create } from "zustand";
import { pathUnderRoot } from "@/app/project-filter";
import { commands, type GitStatus, type SessionEvent, type Worktree } from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import { useSessionsStore } from "./sessions";

/** Status entries older than this are stale (D-M3-5: 30 s timer). */
export const GIT_STATUS_TTL_MS = 30_000;
/** Minimum gap between write-signal-triggered refreshes per project. */
export const SIGNAL_REFRESH_GAP_MS = 3_000;

export interface GitEntry {
  /** Last good status — kept through later failures (stale-while-revalidate). */
  status: GitStatus | null;
  /** `GitUnavailable:` (missing git, not a repo) → surfaces hide quietly. */
  unavailable: boolean;
  /** Last settle (ok or error), ms epoch. 0 = never fetched. */
  fetchedAt: number;
}

// ── Pure folds (TDD'd) ───────────────────────────────────────────────────────

/** What the strip renders: `⎇ branch · ↑a ↓b · ●n dirty` (+ worktree badge). */
export interface GitStripModel {
  branch: string;
  ahead: number;
  behind: number;
  /** Dirty tracked entries + untracked files. */
  changes: number;
  clean: boolean;
  /** Branch of the linked (non-primary) worktree the session lives in. */
  worktreeBranch: string | null;
}

/** Longest path-segment-aware worktree prefix of `path` (worktrees nest). */
export function matchWorktree(worktrees: Worktree[], path: string | null | undefined): Worktree | null {
  if (!path) return null;
  let best: Worktree | null = null;
  for (const wt of worktrees) {
    if (pathUnderRoot(path, wt.path) && (!best || wt.path.length > best.path.length)) best = wt;
  }
  return best;
}

export function stripModel(status: GitStatus, sessionPath?: string | null): GitStripModel {
  const matched = matchWorktree(status.worktrees, sessionPath);
  // `git worktree list` puts the primary worktree first; only linked ones badge.
  const linked = matched && matched !== status.worktrees[0] ? matched : null;
  return {
    branch: status.branch,
    ahead: status.ahead,
    behind: status.behind,
    changes: status.dirty + status.untracked,
    clean: status.dirty === 0 && status.untracked === 0,
    worktreeBranch: linked?.branch ?? null,
  };
}

export function isStale(entry: GitEntry | undefined, now: number, ttl = GIT_STATUS_TTL_MS): boolean {
  return !entry || now - entry.fetchedAt > ttl;
}

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** Post-tool Edit/Write-family hook signals invalidate that project's status. */
export function isWriteSignal(ev: SessionEvent): boolean {
  return (
    ev.type === "Signal" &&
    ev.data.signal.event === "post-tool" &&
    ev.data.signal.tool !== null &&
    WRITE_TOOLS.has(ev.data.signal.tool)
  );
}

// ── Store ────────────────────────────────────────────────────────────────────

interface GitState {
  entries: Record<string, GitEntry>;
  /** Fetch unless fresh (`force` bypasses the TTL). In-flight calls dedupe. */
  refresh: (projectPath: string, force?: boolean) => Promise<void>;
}

const inflight = new Map<string, Promise<void>>();
let signalsStarted = false;

function looksLikeStatus(v: unknown): v is GitStatus {
  return typeof v === "object" && v !== null && typeof (v as GitStatus).branch === "string";
}

export const useGitStore = create<GitState>((set, get) => ({
  entries: {},
  refresh: async (projectPath, force = false) => {
    if (!force && !isStale(get().entries[projectPath], Date.now())) return;
    const pending = inflight.get(projectPath);
    if (pending) return pending;
    const run = (async () => {
      const prev = get().entries[projectPath];
      let next: GitEntry = {
        status: prev?.status ?? null,
        unavailable: prev?.unavailable ?? false,
        fetchedAt: Date.now(),
      };
      try {
        const res = await commands.gitStatus(projectPath);
        if (res.status === "ok" && looksLikeStatus(res.data)) {
          next = { status: res.data, unavailable: false, fetchedAt: Date.now() };
        } else if (res.status === "error" && res.error.startsWith("GitUnavailable:")) {
          next = { status: null, unavailable: true, fetchedAt: Date.now() };
        }
        // other errors: keep the last good status (stale-while-revalidate)
      } catch {
        // IPC bridge unavailable (unit tests) — keep whatever we had
      }
      set((s) => ({ entries: { ...s.entries, [projectPath]: next } }));
    })();
    inflight.set(projectPath, run);
    try {
      await run;
    } finally {
      inflight.delete(projectPath);
    }
  },
}));

/** Fold one engine event: write signals refresh tracked roots (gap-limited). */
export async function handleGitEngineEvent(ev: SessionEvent): Promise<void> {
  if (!isWriteSignal(ev) || ev.type !== "Signal") return;
  const key = `${ev.data.id.provider}:${ev.data.id.id}`;
  const sessionPath = useSessionsStore.getState().sessions[key]?.project_path;
  if (!sessionPath) return;
  const { entries, refresh } = useGitStore.getState();
  const now = Date.now();
  await Promise.all(
    Object.entries(entries)
      .filter(
        ([root, entry]) => pathUnderRoot(sessionPath, root) && isStale(entry, now, SIGNAL_REFRESH_GAP_MS),
      )
      .map(([root]) => refresh(root, true)),
  );
}

function startGitSignals(): void {
  if (signalsStarted) return;
  signalsStarted = true;
  try {
    onEngineEvent((ev) => void handleGitEngineEvent(ev)).catch(() => {
      // event bridge unavailable (unit tests) — handleGitEngineEvent stays callable
    });
  } catch {
    // bridge module threw synchronously (no Tauri runtime at all)
  }
}

/** Test-only reset. */
export function resetGitForTests(): void {
  signalsStarted = false;
  inflight.clear();
  useGitStore.setState({ entries: {} });
}

// ── The hook surfaces consume ────────────────────────────────────────────────

/**
 * Subscribe to a project's git status: refresh on mount, on window focus and
 * every 30 s — each pass is staleness-gated, so overlapping consumers of the
 * same root cost one `git status` per TTL, not one per row.
 */
export function useGitStatus(projectPath: string | null | undefined): GitEntry | undefined {
  const entry = useGitStore((s) => (projectPath ? s.entries[projectPath] : undefined));
  useEffect(() => {
    if (!projectPath) return;
    startGitSignals();
    const tick = () => void useGitStore.getState().refresh(projectPath);
    tick();
    window.addEventListener("focus", tick);
    const timer = window.setInterval(tick, GIT_STATUS_TTL_MS);
    return () => {
      window.removeEventListener("focus", tick);
      window.clearInterval(timer);
    };
  }, [projectPath]);
  return entry;
}
