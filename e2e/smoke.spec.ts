// Boot smoke (EKI-148 rewrite, M4 debt sweep): the old assertions targeted
// v1's classic shell (`to-workspace`, `app-root`, `panel-chat`/`panel-
// sessions`/`panel-activity` as the DEFAULT view) — all dead since M4 T6
// ("the switch") made the campus game shell the permanent main window and
// deleted panels/world/**. `to-workspace`/`app-root` at boot and the
// default-cockpit-preset assumption never existed post-switch, so both
// specs were pure flake (EKI-148) rather than testing anything real.
//
// Rewritten against the game main window: game-shell testid (always
// mounted — App.tsx's MainWindow renders it under any first-run wizard
// overlay, never conditionally) + a handful of HUD chips
// (src/game/hud/HudOverlay.tsx) that only exist once the game tree has
// actually rendered. `?window=workspace` still boots the classic
// WorkspaceShell (app-root/panel-chat) unchanged — that's its own route,
// not the default boot path, and isn't covered here.
//
// Dropped, not replaced: the old test's `app-version` regex assertion
// proved the Rust<->webview IPC round-trip. There's no equivalent display
// in the game HUD — re-adding one purely for this assertion is out of
// scope for this rewrite; `?window=settings`'s settings panel or a future
// HUD element can carry that check if it's needed again.
import { expect, $ } from "@wdio/globals";

describe("CrewHub shell", () => {
  it("boots into the game shell", async () => {
    // A fresh profile's onboarding wizard overlays the game shell (see
    // onboarding.spec.ts) rather than replacing it — App.tsx's MainWindow
    // always mounts GameShell, wizard or not, so this holds either way.
    await expect($('[data-testid="game-shell"]')).toBeExisting();
  });

  it("renders the HUD chips", async () => {
    await expect($('[data-testid="hud-hire"]')).toBeExisting();
    await expect($('[data-testid="hud-build"]')).toBeExisting();
    await expect($('[data-testid="hud-workspace"]')).toBeExisting();
    await expect($('[data-testid="hud-settings"]')).toBeExisting();
  });
});
