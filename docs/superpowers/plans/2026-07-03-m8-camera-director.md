# M8 — Camera Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (user, verbatim intent):** camera movement when clicking on HQ, rooms, and bots — zoom in and rotate to the center of a room (taking the closest rotational way from the current position); same for HQ; follow the bot when clicking on one; exit via a button or Escape to zoom back out.

**Architecture:** A `useCameraDirector` store owns a camera mode: `free | focus(building) | follow(botKey)`. `GameCameraRig` reads it each frame: in `focus`, the goal (target/yaw/distance) damps toward a cinematic framing of the building (target = room center, distance by room size, yaw chosen via SHORTEST-ARC from the current yaw toward the room's door-facing angle); in `follow`, the target tracks the bot's live position (read imperatively off `sim.world.bots` — the rig already runs inside the Canvas) while yaw/zoom stay user-controllable. Entering a mode SNAPSHOTS the free-camera goal; exit (Escape, HUD button, or a pan gesture) restores it with the same damped flight. Click sources: RoomCard/HqCard opening (M5/M6) also requests focus; clicking a robot already opens its chat — it now ALSO starts follow. Zero backend changes.

**Tech Stack:** unchanged.

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict; alias `@/`; NO src/panels imports in src/game; react-compiler rules (frame mutations via refs/useFrame only).
- Shortest-arc yaw: all yaw damping through a `shortestArcLerp(current, target, k)` helper — never damp raw angles across the ±π seam.
- Camera changes NEVER fight the user: any drag-pan in focus/follow exits to free (restoring is only for Escape/button); wheel zoom and rotate REMAIN live in both modes (they adjust the framing, not exit).
- Determinism untouched (camera is render-side only); perf: no per-frame allocation (scratch vectors), FrameLimiter untouched.
- Branch: `feat/game-m8-camera` cut from the M7 branch (stacked).

---

### Task 1: Director store + shortest-arc math (pure + store)

**Files:** Create `src/game/engine/camera/director.ts` (+director.test.ts).

**Contracts:**

```ts
export type CameraMode =
  | { kind: "free" }
  | { kind: "focus"; target: { x: number; z: number }; yaw: number; distance: number }
  | { kind: "follow"; botKey: string };
export function shortestArcDelta(from: number, to: number): number   // (-π, π]
export function shortestArcLerp(from: number, to: number, k: number): number
export function focusForBuilding(b: { rect: Rect; door: { x: number; z: number } }, currentYaw: number):
  { target: { x: number; z: number }; yaw: number; distance: number }
// target = rect center; distance = clamp(max(w,d) * 1.4, 14, 30); yaw = angle that puts the camera on the DOOR side
// (looking through the door into the room), adjusted to the representative closest to currentYaw when the room has
// multiple doors (HQ): pick the door whose facing yaw has the smallest |shortestArcDelta(currentYaw, doorYaw)|.
useCameraDirector: {
  mode: CameraMode;
  savedGoal: unknown | null;                       // opaque snapshot of the rig's goal (rig owns the shape)
  focusBuilding(b: Building, currentYaw: number): void;
  followBot(key: string): void;
  exit(): void;                                    // mode -> free (rig restores savedGoal if present)
  setSavedGoal(g: unknown): void;                  // rig writes the snapshot on mode entry
}
```

TDD: arc math (seam cases ±π, equal angles, halfway); focusForBuilding distance clamps + multi-door nearest pick; store transitions (focus→follow replaces; exit clears; savedGoal lifecycle).

---

### Task 2: Rig integration — fly, follow, restore, input rules

**Files:** Modify `src/game/engine/camera/GameCameraRig.tsx` (+rig test if the existing harness covers goal math — check; else pure helpers extracted to `camera-math.ts` +test), `src/game/hud/HudOverlay.tsx` (exit chip), `src/game/app/GameShell.tsx` (Escape key already has build-mode ladder — extend: Escape exits camera mode when no dialog/build-mode consumed it; document precedence order).

**Contracts:**

- Rig useFrame: mode free → existing behavior. Mode focus → damp goal.target/yaw/distance toward the focus values (yaw via shortestArcLerp, k≈3); arrival is asymptotic (no snap events needed). Mode follow → goal.target damps to the bot's live position each frame (`sim.world.bots.get(key)`, fallback exit when the bot despawns); yaw/distance untouched (user's). On ENTRY to focus/follow: `setSavedGoal(clone of goal)`. On `exit()`: damp back to savedGoal (flight home), then clear; a drag-pan during focus/follow exits WITHOUT restore (user grabbed the wheel — keep their view; document).
- Keyboard: Escape handling precedence (highest first): open dialog/card closes → build-mode ladder → camera exit → nothing. Implement by checking director mode in GameShell's existing key handling AFTER dialogs/build mode (cite the M3 ESC ladder).
- HUD: chip `🎥 ✕` visible only when mode ≠ free → `exit()`; playSfx("click").
- Edge scrolling / keyboard pan while focused: same as drag-pan — exits without restore (any PAN intent = user takeover; wheel/rotate do not).

TDD: pure helpers (target chase math if extracted); jsdom: chip visibility + exit call; Escape precedence unit (mocked stores where the ladder lives).

---

### Task 3: Click wiring

**Files:** Modify `src/game/world/campus/CampusWorld.tsx` + `src/game/build/PlacedBuildings.tsx` (room/HQ click → ALSO `focusBuilding` — same guard as card opening: normal mode only), `src/game/app/GameShell.tsx` or `src/game/characters/Characters.tsx` (bot click → ALSO `followBot(key)`; chat opens as today — the two compose), `src/game/chat/ChatWindow.tsx`? (NO — closing a chat does not exit follow; independent).

- Focus fires alongside RoomCard/HqCard so the camera frames what you opened. Card close does NOT exit camera (user may want to stay) — Escape/chip does. Bot follow persists after chat close for the same reason.
- Demo mode: everything works (camera is sim-agnostic).

TDD: click handlers invoke director (mocked store) alongside existing card/chat opens; build-mode clicks don't.

---

### Task 4: Finish — verify, changelog, final review, PR

- [ ] Full vitest + tsc + build; perf proxy unchanged; controller visual pass (headless can't click — verify via unit coverage + Nicky's live feedback; screenshot default view for regressions).
- [ ] CHANGELOG. Final whole-branch review (most capable model), one fix wave. PR stacked. Linear close.

---

## Open decisions (defaults chosen)

1. **Card/camera coupling**: clicking a room opens the card AND flies the camera (default). Alternative: fly only on a second affordance.
2. **Pan = takeover-exit (no restore), Escape/chip = exit WITH restore flight** (default) — matches RTS conventions.
3. **Follow keeps user yaw/zoom** (default) vs cinematic auto-orbit — deferred.
