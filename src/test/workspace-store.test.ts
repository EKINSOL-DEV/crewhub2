import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { buildPreset, leaves, type WorkspaceTab } from "../app/layout-tree";
import { useWorkspace, resetWorkspaceForTests } from "../stores/workspace";

type SettingArgs = { key: string; value?: string };

/** In-memory settings KV backing the mocked IPC. */
function mockSettings(initial: Record<string, string> = {}) {
  const kv = new Map(Object.entries(initial));
  const writes: Array<{ key: string; value: string }> = [];
  mockIPC((cmd, args) => {
    const a = args as SettingArgs;
    if (cmd === "get_setting") return kv.get(a.key) ?? null;
    if (cmd === "set_setting") {
      kv.set(a.key, a.value ?? "");
      writes.push({ key: a.key, value: a.value ?? "" });
      return null;
    }
    return null;
  });
  return { kv, writes };
}

beforeEach(() => {
  resetWorkspaceForTests();
});

afterEach(() => {
  vi.useRealTimers();
  clearMocks();
});

describe("load", () => {
  test("no stored state → one default cockpit tab", async () => {
    mockSettings();
    await useWorkspace.getState().load();
    const s = useWorkspace.getState();
    expect(s.loaded).toBe(true);
    expect(s.tabs).toHaveLength(1);
    expect(leaves(s.tabs[0]!.root).map((l) => l.kind)).toEqual(["chat", "sessions", "activity"]);
    expect(s.activeTabId).toBe(s.tabs[0]!.id);
    expect(s.focusedLeafId).toBe(leaves(s.tabs[0]!.root)[0]!.id);
  });

  test("restores persisted tabs + active tab (reload round-trip)", async () => {
    const tabs: WorkspaceTab[] = [
      { id: "t1", name: "One", root: buildPreset("focus"), projectFilter: null },
      { id: "t2", name: "Two", root: buildPreset("monitor"), projectFilter: "proj-9" },
    ];
    mockSettings({ "workspace.tabs": JSON.stringify(tabs), "workspace.active_tab": "t2" });
    await useWorkspace.getState().load();
    const s = useWorkspace.getState();
    expect(s.tabs).toEqual(tabs);
    expect(s.activeTabId).toBe("t2");
    expect(s.tabs[1]!.projectFilter).toBe("proj-9");
  });

  test("corrupt tabs JSON → default preset, never crash", async () => {
    mockSettings({ "workspace.tabs": "{corrupt!!", "workspace.active_tab": "t1" });
    await useWorkspace.getState().load();
    const s = useWorkspace.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.name).toBe("Cockpit");
  });

  test("stale active tab id falls back to first tab", async () => {
    const tabs: WorkspaceTab[] = [{ id: "t1", name: "One", root: buildPreset("focus"), projectFilter: null }];
    mockSettings({ "workspace.tabs": JSON.stringify(tabs), "workspace.active_tab": "gone" });
    await useWorkspace.getState().load();
    expect(useWorkspace.getState().activeTabId).toBe("t1");
  });

  test("seeds workspace.presets when absent", async () => {
    const { kv } = mockSettings();
    await useWorkspace.getState().load();
    const presets = JSON.parse(kv.get("workspace.presets") ?? "{}");
    expect(Object.keys(presets).sort()).toEqual(["cockpit", "focus", "monitor"]);
  });
});

describe("persistence", () => {
  test("mutations persist debounced (500 ms, one write per burst)", async () => {
    const { writes } = mockSettings();
    await useWorkspace.getState().load();
    writes.length = 0;
    vi.useFakeTimers();
    useWorkspace.getState().addTab("focus");
    useWorkspace.getState().renameTab(useWorkspace.getState().activeTabId, "Renamed");
    expect(writes.filter((w) => w.key === "workspace.tabs")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(writes.filter((w) => w.key === "workspace.tabs")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(writes.filter((w) => w.key === "workspace.tabs")).toHaveLength(1);
    expect(writes.filter((w) => w.key === "workspace.active_tab")).toHaveLength(1);
    const persisted = JSON.parse(writes.find((w) => w.key === "workspace.tabs")!.value) as WorkspaceTab[];
    expect(persisted.some((t) => t.name === "Renamed")).toBe(true);
  });
});

describe("tabs CRUD", () => {
  beforeEach(async () => {
    mockSettings();
    await useWorkspace.getState().load();
  });

  test("addTab activates it and focuses its first leaf", () => {
    useWorkspace.getState().addTab("monitor");
    const s = useWorkspace.getState();
    expect(s.tabs).toHaveLength(2);
    expect(s.activeTabId).toBe(s.tabs[1]!.id);
    expect(s.focusedLeafId).toBe(leaves(s.tabs[1]!.root)[0]!.id);
  });

  test("addTab without preset opens a welcome leaf", () => {
    useWorkspace.getState().addTab();
    const s = useWorkspace.getState();
    expect(leaves(s.tabs[1]!.root).map((l) => l.kind)).toEqual(["welcome"]);
  });

  test("closeTab keeps at least one tab (closing the last spawns a default)", () => {
    const first = useWorkspace.getState().activeTabId;
    useWorkspace.getState().closeTab(first);
    const s = useWorkspace.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.id).not.toBe(first);
  });

  test("closing the active tab activates a neighbor", () => {
    useWorkspace.getState().addTab("focus");
    const second = useWorkspace.getState().activeTabId;
    useWorkspace.getState().closeTab(second);
    const s = useWorkspace.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(s.tabs[0]!.id);
  });

  test("renameTab", () => {
    const id = useWorkspace.getState().activeTabId;
    useWorkspace.getState().renameTab(id, "My Tab");
    expect(useWorkspace.getState().tabs[0]!.name).toBe("My Tab");
  });

  test("applyPreset replaces the active tab root", () => {
    useWorkspace.getState().applyPreset("monitor");
    const s = useWorkspace.getState();
    expect(leaves(s.activeTab()!.root).map((l) => l.kind)).toEqual(["sessions", "activity"]);
  });

  test("setProjectFilter scopes the active tab", () => {
    useWorkspace.getState().setProjectFilter("proj-1");
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBe("proj-1");
    useWorkspace.getState().setProjectFilter(null);
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBeNull();
  });
});

describe("panel operations", () => {
  beforeEach(async () => {
    mockSettings();
    await useWorkspace.getState().load();
    useWorkspace.getState().applyPreset("focus"); // single chat leaf
  });

  test("split focuses the new (welcome) leaf", () => {
    const chat = leaves(useWorkspace.getState().activeTab()!.root)[0]!;
    useWorkspace.getState().split(chat.id, "row");
    const s = useWorkspace.getState();
    const ls = leaves(s.activeTab()!.root);
    expect(ls.map((l) => l.kind)).toEqual(["chat", "welcome"]);
    expect(s.focusedLeafId).toBe(ls[1]!.id);
  });

  test("closePanel moves focus to the first remaining leaf", () => {
    const chat = leaves(useWorkspace.getState().activeTab()!.root)[0]!;
    useWorkspace.getState().split(chat.id, "row");
    const welcome = leaves(useWorkspace.getState().activeTab()!.root)[1]!;
    useWorkspace.getState().closePanel(welcome.id);
    const s = useWorkspace.getState();
    expect(leaves(s.activeTab()!.root).map((l) => l.kind)).toEqual(["chat"]);
    expect(s.focusedLeafId).toBe(chat.id);
  });

  test("replacePanel changes the leaf kind in place", () => {
    const chat = leaves(useWorkspace.getState().activeTab()!.root)[0]!;
    useWorkspace.getState().replacePanel(chat.id, "history");
    expect(leaves(useWorkspace.getState().activeTab()!.root)[0]!.kind).toBe("history");
  });

  test("setPanelParams persists params into the tree", () => {
    const chat = leaves(useWorkspace.getState().activeTab()!.root)[0]!;
    useWorkspace.getState().setPanelParams(chat.id, { sessionId: "s1" });
    expect(leaves(useWorkspace.getState().activeTab()!.root)[0]!.params).toEqual({ sessionId: "s1" });
  });

  test("toggleMaximize sets and clears; closing a maximized panel clears it", () => {
    const chat = leaves(useWorkspace.getState().activeTab()!.root)[0]!;
    useWorkspace.getState().toggleMaximize(chat.id);
    expect(useWorkspace.getState().maximizedLeafId).toBe(chat.id);
    useWorkspace.getState().toggleMaximize(chat.id);
    expect(useWorkspace.getState().maximizedLeafId).toBeNull();
    useWorkspace.getState().toggleMaximize(chat.id);
    useWorkspace.getState().closePanel(chat.id);
    expect(useWorkspace.getState().maximizedLeafId).toBeNull();
  });

  test("cycleFocus wraps around the leaves in visual order", () => {
    useWorkspace.getState().applyPreset("cockpit");
    const ls = leaves(useWorkspace.getState().activeTab()!.root);
    useWorkspace.getState().focusLeaf(ls[0]!.id);
    useWorkspace.getState().cycleFocus(1);
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[1]!.id);
    useWorkspace.getState().cycleFocus(-1);
    useWorkspace.getState().cycleFocus(-1);
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[2]!.id);
  });

  test("focusByIndex focuses panel N (1-based, visual order)", () => {
    useWorkspace.getState().applyPreset("cockpit");
    const ls = leaves(useWorkspace.getState().activeTab()!.root);
    useWorkspace.getState().focusByIndex(3);
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[2]!.id);
    useWorkspace.getState().focusByIndex(9); // out of range → no-op
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[2]!.id);
  });

  test("resizeFocused adjusts the nearest matching ancestor split ratio", () => {
    useWorkspace.getState().applyPreset("cockpit"); // row(chat, col(sessions, activity)) ratio 0.6
    const ls = leaves(useWorkspace.getState().activeTab()!.root);
    useWorkspace.getState().focusLeaf(ls[0]!.id);
    useWorkspace.getState().resizeFocused("row", 0.05);
    const root = useWorkspace.getState().activeTab()!.root;
    if (root.type !== "split") throw new Error("expected split");
    expect(root.ratio).toBeCloseTo(0.65);
  });

  test("movePanel drag-rearranges via the tree op", () => {
    useWorkspace.getState().applyPreset("cockpit");
    const ls = leaves(useWorkspace.getState().activeTab()!.root);
    useWorkspace.getState().movePanel(ls[0]!.id, ls[2]!.id, "center");
    const after = leaves(useWorkspace.getState().activeTab()!.root);
    expect(after[0]!.id).toBe(ls[2]!.id);
    expect(after[2]!.id).toBe(ls[0]!.id);
  });
});
