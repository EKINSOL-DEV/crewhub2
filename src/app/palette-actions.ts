// Built-in palette action source (EKI-16): everything the shell itself can do.
// Other lanes register their own sources via usePalette().registerActions.
import { commands } from "@/ipc/bindings";
import { openAutomationPanel } from "@/panels/automation/open-automation";
import { openBoardPanel } from "@/panels/board/open-board";
import { useAppView } from "@/stores/appView";
import { usePalette, type PaletteAction } from "@/stores/palette";
import { useSettings } from "@/stores/settings";
import { useWorkspace } from "@/stores/workspace";
import { THEME_NAMES } from "@/theme/themes";
import { leaves, PRESET_NAMES, type PanelKind } from "./layout-tree";
import { PANEL_LIST } from "./panel-registry";

/**
 * Open a panel kind into the active tab: a focused `welcome` leaf is replaced
 * in place, anything else splits the focused (or first) leaf.
 */
export function openPanel(kind: PanelKind, params?: Record<string, string>) {
  const s = useWorkspace.getState();
  const tab = s.activeTab();
  if (!tab) return;
  const focused = s.focusedLeafId ? leaves(tab.root).find((l) => l.id === s.focusedLeafId) : undefined;
  const target = focused ?? leaves(tab.root)[0];
  if (!target) return;
  // Panels live in the workspace — opening one from the world view switches
  // over first (no-op when already there); ⌘1 is the way back.
  useAppView.getState().setView("workspace");
  if (target.kind === "welcome") {
    s.replacePanel(target.id, kind, params);
    s.focusLeaf(target.id);
  } else {
    s.split(target.id, "row", kind);
    if (params && s.focusedLeafId) s.setPanelParams(s.focusedLeafId, params);
  }
}

export function buildShellActions(): PaletteAction[] {
  const actions: PaletteAction[] = [];

  // Top-level views (world-primary shell): the world is NOT a panel anymore.
  actions.push({
    id: "view.world",
    label: "Go to the World",
    emoji: "🌍",
    group: "Views",
    keywords: ["world", "3d", "office", "view", "primary", "bots"],
    hint: "⌘1",
    run: () => useAppView.getState().setView("world"),
  });
  actions.push({
    id: "view.workspace",
    label: "Go to the Workspace",
    emoji: "🧰",
    group: "Views",
    keywords: ["workspace", "panels", "shell", "view", "tabs"],
    hint: "⌘2",
    run: () => useAppView.getState().setView("workspace"),
  });

  for (const def of PANEL_LIST.filter((d) => d.kind !== "welcome" && !d.hiddenFromPicker)) {
    actions.push({
      id: `panel.open.${def.kind}`,
      label: `Open ${def.label} panel`,
      emoji: def.emoji,
      group: "Panels",
      keywords: def.keywords,
      run: () => openPanel(def.kind),
    });
  }

  for (const preset of PRESET_NAMES) {
    actions.push({
      id: `layout.preset.${preset}`,
      label: `Layout: ${preset} preset`,
      emoji: "🧱",
      group: "Layout",
      keywords: ["layout", "preset", "arrange", preset],
      run: () => useWorkspace.getState().applyPreset(preset),
    });
  }

  actions.push({
    id: "tab.new",
    label: "New workspace tab",
    emoji: "➕",
    group: "Layout",
    keywords: ["tab", "new", "workspace"],
    hint: "⌘T",
    run: () => useWorkspace.getState().addTab(),
  });

  for (const theme of THEME_NAMES) {
    actions.push({
      id: `theme.${theme}`,
      label: `Theme: ${theme}`,
      emoji: "🎨",
      group: "Theme",
      keywords: ["theme", "appearance", "colors", theme],
      run: () => void useSettings.getState().setTheme(theme),
    });
  }

  actions.push({
    id: "session.spawn",
    label: "Spawn session",
    emoji: "🚀",
    group: "Sessions",
    keywords: ["spawn", "new", "session", "scout", "start", "claude"],
    run: () => usePalette.getState().setSpawnDialogOpen(true),
  });

  actions.push({
    id: "task.new",
    label: "New task",
    emoji: "📝",
    group: "Tasks",
    keywords: ["task", "todo", "new", "create", "board"],
    // T17: routes to the board's create dialog (room required — the v1
    // room_id lesson) instead of the M2 placeholder dialog.
    run: () => openBoardPanel({ create: "1" }),
  });

  actions.push({
    id: "automation.new-schedule",
    label: "New schedule",
    emoji: "⏰",
    group: "Automation",
    keywords: ["schedule", "cron", "run", "automation", "new"],
    run: () => openAutomationPanel({ create: "1" }),
  });

  actions.push({
    id: "automation.open-templates",
    label: "Open templates",
    emoji: "📜",
    group: "Automation",
    keywords: ["templates", "prompts", "library", "snippets"],
    run: () => openAutomationPanel({ view: "templates" }),
  });

  actions.push({
    id: "settings.open",
    label: "Open settings",
    emoji: "⚙️",
    group: "Settings",
    keywords: ["settings", "preferences", "config"],
    run: () => openPanel("settings"),
  });

  actions.push({
    id: "workspace.open-window",
    label: "Open workspace in new window",
    emoji: "🪟",
    group: "Views",
    keywords: ["workspace", "window", "detach", "panels", "second", "monitor"],
    run: () => void commands.openWorkspaceWindow().catch(() => undefined),
  });

  actions.push({
    id: "settings.open-window",
    label: "Open settings window",
    emoji: "🪟",
    group: "Settings",
    keywords: ["settings", "preferences", "config", "window", "detach"],
    run: () => void commands.openSettingsWindow().catch(() => undefined),
  });

  // M6 T11 (EKI-100): palette-side updater check — same store as the
  // settings Updates section; the outcome lands as a toast.
  actions.push({
    id: "updater.check",
    label: "Check for updates",
    emoji: "⬆️",
    group: "Settings",
    keywords: ["update", "upgrade", "version", "check", "new"],
    run: () => {
      void import("@/stores/updater").then(async ({ useUpdater }) => {
        const info = await useUpdater.getState().check();
        const { useToasts } = await import("@/stores/toasts");
        useToasts.getState().push({
          emoji: info ? "⬆️" : "✅",
          text: info
            ? `v${info.version} is available — install it from Settings → Updates`
            : (useUpdater.getState().error ?? "You're on the freshest paint already."),
          taskId: null,
          shake: false,
          action: null,
        });
      });
    },
  });

  return actions;
}
