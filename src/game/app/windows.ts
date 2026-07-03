// Secondary-window openers for the game HUD (M4 T6 fix round 1: reachability).
// The main window lost its settings gear and workspace-opening palette action
// when WorldView/GameHud died — this restores just enough to reach them. Both
// commands already open-or-focus server-side (src-tauri/src/ipc/mod.rs's
// open_settings_window/open_workspace_window: `get_webview_window` +
// `set_focus` if it exists, else builds it), so there's no client-side
// dedupe to reinvent. Same catch-and-ignore-in-plain-browser pattern as the
// existing callers in src/app/palette-actions.ts.
import { commands } from "@/ipc/bindings";

export function openWorkspaceWindow(): void {
  void commands.openWorkspaceWindow().catch(() => undefined);
}

export function openSettingsWindow(): void {
  void commands.openSettingsWindow().catch(() => undefined);
}
