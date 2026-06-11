// Workspace store (EKI-11): tabs CRUD, focus, maximize, layout-tree ops.
// Persists to the settings KV (`workspace.*` keys, Appendix B) debounced 500 ms.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import {
  buildPreset,
  closeLeaf,
  findAncestorSplit,
  leaves,
  makeLeaf,
  moveLeaf,
  parseTabs,
  replaceKind,
  setLeafParams,
  setRatio,
  splitLeaf,
  uid,
  type DropEdge,
  type LayoutNode,
  type PanelKind,
  type PresetName,
  type SplitDir,
  type WorkspaceTab,
} from "@/app/layout-tree";

const TABS_KEY = "workspace.tabs";
const ACTIVE_KEY = "workspace.active_tab";
const PRESETS_KEY = "workspace.presets";
const PERSIST_DEBOUNCE_MS = 500;

const PRESET_LABELS: Record<PresetName, string> = {
  focus: "Focus",
  cockpit: "Cockpit",
  monitor: "Monitor",
};

function makeDefaultTab(): WorkspaceTab {
  return { id: uid(), name: "Cockpit", root: buildPreset("cockpit"), projectFilter: null };
}

function firstLeafId(root: LayoutNode): string | null {
  return leaves(root)[0]?.id ?? null;
}

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  loaded: boolean;

  activeTab: () => WorkspaceTab | null;

  load: () => Promise<void>;
  addTab: (preset?: PresetName) => void;
  closeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setActiveTab: (id: string) => void;
  applyPreset: (name: PresetName) => void;
  setProjectFilter: (projectId: string | null) => void;

  split: (leafId: string, dir: SplitDir, kind?: PanelKind) => void;
  closePanel: (leafId: string) => void;
  replacePanel: (leafId: string, kind: PanelKind, params?: Record<string, string>) => void;
  setPanelParams: (leafId: string, params: Record<string, string>) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  movePanel: (srcLeafId: string, dstLeafId: string, edge: DropEdge) => void;
  focusLeaf: (leafId: string) => void;
  focusByIndex: (n: number) => void;
  cycleFocus: (dir: 1 | -1) => void;
  toggleMaximize: (leafId?: string) => void;
  resizeFocused: (axis: SplitDir, delta: number) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => WorkspaceState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { tabs, activeTabId } = get();
    void commands.setSetting(TABS_KEY, JSON.stringify(tabs)).catch(() => undefined);
    void commands.setSetting(ACTIVE_KEY, activeTabId).catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** Apply a transform to the active tab's root, then persist. */
  function updateRoot(fn: (root: LayoutNode) => LayoutNode) {
    const { tabs, activeTabId } = get();
    set({
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, root: fn(t.root) } : t)),
    });
    schedulePersist(get);
  }

  return {
    tabs: [],
    activeTabId: "",
    focusedLeafId: null,
    maximizedLeafId: null,
    loaded: false,

    activeTab: () => get().tabs.find((t) => t.id === get().activeTabId) ?? null,

    load: async () => {
      let tabs: WorkspaceTab[] | null = null;
      let active: string | null = null;
      try {
        const t = await commands.getSetting(TABS_KEY);
        tabs = t.status === "ok" ? parseTabs(t.data) : null;
        const a = await commands.getSetting(ACTIVE_KEY);
        active = a.status === "ok" ? a.data : null;
        const p = await commands.getSetting(PRESETS_KEY);
        if (p.status !== "ok" || !p.data) {
          const presets = Object.fromEntries(
            (Object.keys(PRESET_LABELS) as PresetName[]).map((n) => [n, buildPreset(n)]),
          );
          await commands.setSetting(PRESETS_KEY, JSON.stringify(presets));
        }
      } catch {
        // backend unavailable (e.g. unit tests) — fall back to defaults
      }
      const finalTabs = tabs ?? [makeDefaultTab()];
      const activeTabId = finalTabs.some((t) => t.id === active) ? (active as string) : finalTabs[0]!.id;
      const activeRoot = finalTabs.find((t) => t.id === activeTabId)!.root;
      set({
        tabs: finalTabs,
        activeTabId,
        focusedLeafId: firstLeafId(activeRoot),
        maximizedLeafId: null,
        loaded: true,
      });
    },

    addTab: (preset) => {
      const tab: WorkspaceTab = preset
        ? { id: uid(), name: PRESET_LABELS[preset], root: buildPreset(preset), projectFilter: null }
        : { id: uid(), name: "New Tab", root: makeLeaf("welcome"), projectFilter: null };
      set({
        tabs: [...get().tabs, tab],
        activeTabId: tab.id,
        focusedLeafId: firstLeafId(tab.root),
        maximizedLeafId: null,
      });
      schedulePersist(get);
    },

    closeTab: (id) => {
      let tabs = get().tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) tabs = [makeDefaultTab()];
      const { activeTabId } = get();
      const nextActive = tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0]!.id;
      set({
        tabs,
        activeTabId: nextActive,
        focusedLeafId: firstLeafId(tabs.find((t) => t.id === nextActive)!.root),
        maximizedLeafId: null,
      });
      schedulePersist(get);
    },

    renameTab: (id, name) => {
      set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, name } : t)) });
      schedulePersist(get);
    },

    setActiveTab: (id) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      set({ activeTabId: id, focusedLeafId: firstLeafId(tab.root), maximizedLeafId: null });
      schedulePersist(get);
    },

    applyPreset: (name) => {
      const root = buildPreset(name);
      updateRoot(() => root);
      set({ focusedLeafId: firstLeafId(root), maximizedLeafId: null });
    },

    setProjectFilter: (projectId) => {
      const { tabs, activeTabId } = get();
      set({ tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, projectFilter: projectId } : t)) });
      schedulePersist(get);
    },

    split: (leafId, dir, kind = "welcome") => {
      const tab = get().activeTab();
      if (!tab) return;
      const { root, newLeaf } = splitLeaf(tab.root, leafId, dir, kind);
      updateRoot(() => root);
      if (newLeaf) set({ focusedLeafId: newLeaf.id });
    },

    closePanel: (leafId) => {
      const tab = get().activeTab();
      if (!tab) return;
      const root = closeLeaf(tab.root, leafId);
      updateRoot(() => root);
      const { focusedLeafId, maximizedLeafId } = get();
      const patch: Partial<WorkspaceState> = {};
      if (maximizedLeafId === leafId) patch.maximizedLeafId = null;
      if (focusedLeafId === leafId) patch.focusedLeafId = firstLeafId(root);
      set(patch);
    },

    replacePanel: (leafId, kind, params) => {
      updateRoot((root) => replaceKind(root, leafId, kind, params));
    },

    setPanelParams: (leafId, params) => {
      updateRoot((root) => setLeafParams(root, leafId, params));
    },

    setSplitRatio: (splitId, ratio) => {
      updateRoot((root) => setRatio(root, splitId, ratio));
    },

    movePanel: (srcLeafId, dstLeafId, edge) => {
      updateRoot((root) => moveLeaf(root, srcLeafId, dstLeafId, edge));
    },

    focusLeaf: (leafId) => set({ focusedLeafId: leafId }),

    focusByIndex: (n) => {
      const tab = get().activeTab();
      const leaf = tab ? leaves(tab.root)[n - 1] : undefined;
      if (leaf) set({ focusedLeafId: leaf.id });
    },

    cycleFocus: (dir) => {
      const tab = get().activeTab();
      if (!tab) return;
      const ls = leaves(tab.root);
      if (ls.length === 0) return;
      const i = ls.findIndex((l) => l.id === get().focusedLeafId);
      const next = ls[(i + dir + ls.length) % ls.length];
      if (next) set({ focusedLeafId: next.id });
    },

    toggleMaximize: (leafId) => {
      const id = leafId ?? get().focusedLeafId;
      if (!id) return;
      set({ maximizedLeafId: get().maximizedLeafId === id ? null : id });
    },

    resizeFocused: (axis, delta) => {
      const tab = get().activeTab();
      const focused = get().focusedLeafId;
      if (!tab || !focused) return;
      const split = findAncestorSplit(tab.root, focused, axis);
      if (!split) return;
      updateRoot((root) => setRatio(root, split.id, split.ratio + delta));
    },
  };
});

/** Test-only: reset module-level state between unit tests. */
export function resetWorkspaceForTests() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  useWorkspace.setState({
    tabs: [],
    activeTabId: "",
    focusedLeafId: null,
    maximizedLeafId: null,
    loaded: false,
  });
}
