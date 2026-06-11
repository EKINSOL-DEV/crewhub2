import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import {
  applySessionEvent,
  joinSessionsView,
  matchesProjectFilter,
  sessionKey,
  shortId,
  useSessionsStore,
} from "@/stores/sessions";
import { agent, binding, meta, room, sid } from "./fixtures";

afterEach(() => {
  clearMocks();
  useSessionsStore.getState().reset();
});

const A = meta({ id: sid("aaaaaaaa-1111"), last_activity_ms: 100 });
const B = meta({ id: sid("bbbbbbbb-2222"), last_activity_ms: 200, project_path: "/work/other" });

describe("applySessionEvent", () => {
  test("Discovered and Updated upsert by key; Removed deletes", () => {
    let s = applySessionEvent({}, { type: "Discovered", data: { meta: A } });
    expect(Object.keys(s)).toEqual([sessionKey(A.id)]);
    const updated = { ...A, status: "Working" as const };
    s = applySessionEvent(s, { type: "Updated", data: { meta: updated } });
    expect(s[sessionKey(A.id)]?.status).toBe("Working");
    s = applySessionEvent(s, { type: "Removed", data: { id: A.id } });
    expect(s).toEqual({});
  });

  test("non-meta events are no-ops (same reference)", () => {
    const s = { [sessionKey(A.id)]: A };
    const out = applySessionEvent(s, {
      type: "Item",
      data: { id: A.id, item: { kind: "SystemNote", data: { text: "x", ts: 1 } }, seq: 0 },
    });
    expect(out).toBe(s);
  });
});

describe("matchesProjectFilter", () => {
  test("null filter matches everything", () => {
    expect(matchesProjectFilter("/anything", null)).toBe(true);
  });
  test("matches root, children and worktrees under the root", () => {
    expect(matchesProjectFilter("/work/proj", "/work/proj")).toBe(true);
    expect(matchesProjectFilter("/work/proj/.worktrees/x", "/work/proj")).toBe(true);
    expect(matchesProjectFilter("/work/proj2", "/work/proj")).toBe(false);
    expect(matchesProjectFilter("/work/proj", "/work/proj/")).toBe(true);
  });
});

describe("joinSessionsView", () => {
  const scout = agent({ id: "ag-1", name: "Scout" });
  const lab = room({ id: "rm-1", name: "Lab" });
  const sessions = { [sessionKey(A.id)]: A, [sessionKey(B.id)]: B };

  test("joins binding, agent and room; display name precedence; sorts by activity", () => {
    const views = joinSessionsView(
      sessions,
      {
        [A.id.id]: binding({
          session_id: A.id.id,
          agent_id: "ag-1",
          room_id: "rm-1",
          display_name: "Refactor run",
        }),
        [B.id.id]: binding({ session_id: B.id.id, agent_id: "ag-1" }),
      },
      [scout],
      [lab],
    );
    expect(views.map((v) => v.displayName)).toEqual(["Scout", "Refactor run"]); // B first (newer)
    expect(views[1]?.agent).toBe(scout);
    expect(views[1]?.room).toBe(lab);
  });

  test("unbound session falls back to short id", () => {
    const views = joinSessionsView(sessions, {}, [], []);
    expect(views[1]?.displayName).toBe(shortId(A.id.id));
    expect(views[1]?.binding).toBeNull();
  });

  test("applies the project filter", () => {
    const views = joinSessionsView(sessions, {}, [], [], "/work/proj");
    expect(views.map((v) => v.key)).toEqual([sessionKey(A.id)]);
  });
});

describe("useSessionsStore", () => {
  test("init seeds from list_all_sessions and apply folds live events", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_all_sessions") return [A];
      return null;
    });
    await useSessionsStore.getState().init();
    expect(useSessionsStore.getState().loaded).toBe(true);
    expect(Object.keys(useSessionsStore.getState().sessions)).toEqual([sessionKey(A.id)]);

    useSessionsStore.getState().apply({ type: "Discovered", data: { meta: B } });
    expect(Object.keys(useSessionsStore.getState().sessions)).toHaveLength(2);
    useSessionsStore.getState().apply({ type: "Removed", data: { id: A.id } });
    expect(Object.keys(useSessionsStore.getState().sessions)).toEqual([sessionKey(B.id)]);
  });

  test("init records the backend error but still settles loaded", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_all_sessions") throw "engine offline";
      return null;
    });
    await useSessionsStore.getState().init();
    expect(useSessionsStore.getState().loaded).toBe(true);
    expect(useSessionsStore.getState().error).toContain("engine offline");
  });
});
