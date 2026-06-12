// The primary view (world-primary shell): the ONE 3D world, fullscreen, no
// panel chrome and no tabs. The workspace is a place you VISIT (⌘2 or the
// 🧰 button) — deep links from world interactions switch over automatically
// and ⌘1 is the one-keystroke way back.
//
// The world internals are untouched: this reuses WorldPanel (lazy, so three.js
// still only loads when the world actually renders — i.e. not in the
// `?window=` routes). Palette, dialogs and toasts mount here too, because the
// views are mutually exclusive — exactly one of WorldView/WorkspaceShell owns
// the "shell" action source at a time.
import { lazy, Suspense, useEffect } from "react";
import { Settings } from "lucide-react";
import { ToastCenter } from "@/components/ToastCenter";
import { commands } from "@/ipc/bindings";
import { useAppView } from "@/stores/appView";
import { usePalette } from "@/stores/palette";
import { CommandPalette } from "./CommandPalette";
import { buildShellActions } from "./palette-actions";
import { ShellDialogs } from "./ShellDialogs";

const WorldPanel = lazy(() => import("@/panels/world/WorldPanel"));

export function WorldView() {
  // Same source key as WorkspaceShell — safe because only one view mounts.
  useEffect(() => {
    const unregister = usePalette.getState().registerActions("shell", buildShellActions());
    void usePalette.getState().load();
    return unregister;
  }, []);

  // ⌘K must work in BOTH views; the world has no shell keymap, so it brings
  // its own tiny listener. Everything else (F/E/etc.) stays inside WorldPanel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      data-testid="world-view"
      className="relative h-screen w-screen overflow-hidden bg-background text-foreground"
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            🌍 warming up the world…
          </div>
        }
      >
        <WorldPanel />
      </Suspense>

      {/* Minimal floating cluster — the only chrome the primary view gets. */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        <button
          type="button"
          data-testid="to-workspace"
          title="Workspace (⌘2) — ⇧click: open in a new window"
          onClick={(e) => {
            // ⇧click: panels in their own window, the world keeps the stage.
            if (e.shiftKey) void commands.openWorkspaceWindow().catch(() => undefined);
            else useAppView.getState().setView("workspace");
          }}
          className="rounded-md bg-black/40 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm hover:bg-black/60"
        >
          🧰 Workspace
        </button>
        <button
          type="button"
          aria-label="Open settings"
          title="Settings"
          onClick={() => void commands.openSettingsWindow().catch(() => undefined)}
          className="rounded-md bg-black/40 p-1.5 text-white/90 backdrop-blur-sm hover:bg-black/60"
        >
          <Settings size={14} />
        </button>
      </div>

      <CommandPalette />
      <ShellDialogs />
      <ToastCenter />
    </div>
  );
}
