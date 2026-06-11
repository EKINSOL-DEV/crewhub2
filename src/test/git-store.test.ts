// Git status store (M3 T15, EKI-103): pure folds first — strip view model,
// worktree matching, staleness + write-signal refresh policy — then the
// zustand cache against mocked IPC.
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { GitStatus, SessionEvent } from "@/ipc/bindings";
import {
  GIT_STATUS_TTL_MS,
  SIGNAL_REFRESH_GAP_MS,
  handleGitEngineEvent,
  isStale,
  isWriteSignal,
  matchWorktree,
  resetGitForTests,
  stripModel,
  useGitStore,
} from "@/stores/git";
import { useSessionsStore } from "@/stores/sessions";
import { meta, sid } from "./fixtures";

const status = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  dirty: 0,
  untracked: 0,
  worktrees: [],
  ...overrides,
});

afterEach(() => {
  clearMocks();
  resetGitForTests();
  useSessionsStore.getState().reset();
});

describe("stripModel (pure status → view-model fold)", () => {
  test("passes branch and ahead/behind through; sums dirty + untracked", () => {
    const m = stripModel(status({ branch: "feat/x", ahead: 2, behind: 1, dirty: 3, untracked: 2 }));
    expect(m.branch).toBe("feat/x");
    expect(m.ahead).toBe(2);
    expect(m.behind).toBe(1);
    expect(m.changes).toBe(5);
    expect(m.clean).toBe(false);
  });

  test("clean only when dirty and untracked are both zero", () => {
    expect(stripModel(status()).clean).toBe(true);
    expect(stripModel(status({ untracked: 1 })).clean).toBe(false);
    expect(stripModel(status({ dirty: 1 })).clean).toBe(false);
  });

  test("worktree badge for sessions living in a linked (non-primary) worktree", () => {
    const wts = [
      { path: "/repo", branch: "main", is_current: false },
      { path: "/repo/.wt/feat", branch: "feat-x", is_current: true },
    ];
    expect(stripModel(status({ worktrees: wts }), "/repo/.wt/feat/sub").worktreeBranch).toBe("feat-x");
    // primary worktree → no badge
    expect(stripModel(status({ worktrees: wts }), "/repo/src").worktreeBranch).toBeNull();
    // no session path / no worktrees → no badge
    expect(stripModel(status({ worktrees: wts })).worktreeBranch).toBeNull();
    expect(stripModel(status(), "/repo").worktreeBranch).toBeNull();
  });
});

describe("matchWorktree", () => {
  const wts = [
    { path: "/repo", branch: "main", is_current: false },
    { path: "/repo-wt", branch: "feat-x", is_current: false },
    { path: "/repo-wt/nested", branch: "deeper", is_current: false },
  ];

  test("matches path-segment-aware (no /repo vs /repo-wt false positive)", () => {
    expect(matchWorktree(wts, "/repo-wt")?.branch).toBe("feat-x");
    expect(matchWorktree(wts, "/repo/src")?.branch).toBe("main");
    expect(matchWorktree(wts, "/elsewhere")).toBeNull();
  });

  test("longest prefix wins for nested worktrees", () => {
    expect(matchWorktree(wts, "/repo-wt/nested/deep/file")?.branch).toBe("deeper");
  });
});

describe("refresh policy folds", () => {
  test("isStale: missing or old entries are stale, fresh ones are not", () => {
    const now = 1_000_000;
    expect(isStale(undefined, now)).toBe(true);
    expect(isStale({ status: null, unavailable: false, fetchedAt: 0 }, now)).toBe(true);
    expect(isStale({ status: status(), unavailable: false, fetchedAt: now - 1000 }, now)).toBe(false);
    expect(
      isStale({ status: status(), unavailable: false, fetchedAt: now - GIT_STATUS_TTL_MS - 1 }, now),
    ).toBe(true);
  });

  test("isWriteSignal: only post-tool Edit/Write-family signals refresh", () => {
    const signal = (event: string, tool: string | null): SessionEvent => ({
      type: "Signal",
      data: {
        id: sid("s1"),
        signal: { event, tool, path: null, payload_json: null, ts: 0 },
      },
    });
    expect(isWriteSignal(signal("post-tool", "Edit"))).toBe(true);
    expect(isWriteSignal(signal("post-tool", "Write"))).toBe(true);
    expect(isWriteSignal(signal("post-tool", "MultiEdit"))).toBe(true);
    expect(isWriteSignal(signal("post-tool", "NotebookEdit"))).toBe(true);
    expect(isWriteSignal(signal("pre-tool", "Edit"))).toBe(false);
    expect(isWriteSignal(signal("post-tool", "Read"))).toBe(false);
    expect(isWriteSignal(signal("post-tool", null))).toBe(false);
    expect(isWriteSignal({ type: "Removed", data: { id: sid("s1") } })).toBe(false);
  });
});

describe("git store (mocked IPC)", () => {
  test("refresh caches status; fresh entries skip the IPC round-trip", async () => {
    let calls = 0;
    mockIPC((cmd) => {
      if (cmd === "git_status") {
        calls += 1;
        return status({ branch: "develop", dirty: 2 });
      }
      return null;
    });
    await useGitStore.getState().refresh("/repo");
    const entry = useGitStore.getState().entries["/repo"];
    expect(entry?.status?.branch).toBe("develop");
    expect(entry?.unavailable).toBe(false);
    expect(calls).toBe(1);

    await useGitStore.getState().refresh("/repo"); // fresh → no-op
    expect(calls).toBe(1);
    await useGitStore.getState().refresh("/repo", true); // forced → refetch
    expect(calls).toBe(2);
  });

  test("GitUnavailable marks the entry quiet (strip hides), not an error", async () => {
    mockIPC((cmd) => {
      if (cmd === "git_status") throw "GitUnavailable: not a git repository";
      return null;
    });
    await useGitStore.getState().refresh("/not-a-repo");
    const entry = useGitStore.getState().entries["/not-a-repo"];
    expect(entry?.unavailable).toBe(true);
    expect(entry?.status).toBeNull();
  });

  test("stale-while-revalidate: a later failure keeps the last good status", async () => {
    let fail = false;
    mockIPC((cmd) => {
      if (cmd === "git_status") {
        if (fail) throw "git failed: boom";
        return status({ branch: "develop" });
      }
      return null;
    });
    await useGitStore.getState().refresh("/repo");
    fail = true;
    await useGitStore.getState().refresh("/repo", true);
    const entry = useGitStore.getState().entries["/repo"];
    expect(entry?.status?.branch).toBe("develop");
    expect(entry?.unavailable).toBe(false);
  });

  test("write signals refresh tracked projects (with a per-project gap)", async () => {
    let calls = 0;
    mockIPC((cmd) => {
      if (cmd === "git_status") {
        calls += 1;
        return status();
      }
      return null;
    });
    // session lives under the tracked project root
    useSessionsStore.setState({
      sessions: { "claude-code:s1": meta({ id: sid("s1"), project_path: "/repo/sub" }) },
    });
    await useGitStore.getState().refresh("/repo");
    expect(calls).toBe(1);

    const edited: SessionEvent = {
      type: "Signal",
      data: {
        id: sid("s1"),
        signal: { event: "post-tool", tool: "Edit", path: null, payload_json: null, ts: 0 },
      },
    };
    // just fetched → inside the signal gap → skipped
    await handleGitEngineEvent(edited);
    expect(calls).toBe(1);

    // age the entry past the gap → signal refreshes
    useGitStore.setState((s) => ({
      entries: {
        ...s.entries,
        "/repo": { ...s.entries["/repo"]!, fetchedAt: Date.now() - SIGNAL_REFRESH_GAP_MS - 1 },
      },
    }));
    await handleGitEngineEvent(edited);
    expect(calls).toBe(2);

    // untracked projects are never polled
    await handleGitEngineEvent({
      type: "Signal",
      data: {
        id: sid("s2"),
        signal: { event: "post-tool", tool: "Write", path: null, payload_json: null, ts: 0 },
      },
    });
    expect(calls).toBe(2);
  });
});
