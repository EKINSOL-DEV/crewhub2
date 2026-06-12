// The app (EKI-121, game-HUD shell): the ONE 3D world, fullscreen — and a
// management-game HUD painted over it. Status strip up top, a dock of chunky
// emoji buttons along the bottom, and every panel as a drawer over the world
// (WorldOverlayHost). There is no workspace to visit; panels in their own
// window (`?window=workspace`) stay available for second monitors.
//
// The world internals are untouched: this reuses WorldPanel (lazy, so three.js
// still only loads when the world actually renders — i.e. not in the
// `?window=` routes).
import { lazy, Suspense, useEffect } from "react";
import { Settings } from "lucide-react";
import { ToastCenter } from "@/components/ToastCenter";
import { usePalette } from "@/stores/palette";
import { CommandPalette } from "./CommandPalette";
import { WorldDock, WorldHudStrip } from "./GameHud";
import { openPanel, buildShellActions } from "./palette-actions";
import { ShellDialogs } from "./ShellDialogs";
import { WorldOverlayHost } from "./WorldOverlayHost";

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

      {/* Game HUD (EKI-121): status strip, dock, and the drawer host. */}
      <WorldHudStrip />
      <WorldDock />
      <div className="absolute right-3 top-3 z-40">
        <button
          type="button"
          aria-label="Open settings"
          title="Settings"
          onClick={() => openPanel("settings")}
          className="rounded-full bg-black/40 p-2 text-white/90 backdrop-blur-sm transition-transform hover:scale-110 hover:bg-black/60"
        >
          <Settings size={14} />
        </button>
      </div>

      <WorldOverlayHost />
      <CommandPalette />
      <ShellDialogs />
      <ToastCenter />
    </div>
  );
}
