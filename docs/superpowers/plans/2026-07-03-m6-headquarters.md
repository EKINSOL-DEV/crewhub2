# M6 — Headquarters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (user, verbatim intent):** a headquarters in the center instead of the fountain — a room that is ALWAYS there, the central hub where new agents spawn, containing props that give access to Project management and such.

**Architecture:** The HQ is a permanent, non-deletable, non-project building at the origin (special id `"hq"`), sized 14×12 with FOUR door gaps (one per path arm) — the wall/nav system generalizes from `door` to `doors[]`. The fountain leaves the center and becomes a placeable decor kind (the model is already in the manifest). New bots spawn INSIDE the HQ and walk out through a door; resting crew rest inside it. Interactive props (stands with floating icon plates) open in-game dialogs: 📋 Projects (new in-game CRUD dialog over the existing `createProject/updateProject/deleteProject` IPC), 👥 Crew (existing HireDialog), 🧰 Workspace (existing window opener). Clicking the HQ opens an HQ card (crew roster + shortcuts), not the project-link RoomCard. Zero backend changes.

**Tech Stack:** unchanged. `banner-green` model for HQ flags; existing kit models + icon plates for props.

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict (exactOptionalPropertyTypes); alias `@/`; NO src/panels imports in src/game.
- Sim stays pure (no Math.random/Date.now); determinism preserved (seeded).
- HQ invariants: always present (prepended by `campusBuildings`), never in `edits`, never deletable/selectable in build mode, no `projectId`/`groupKey` (bots never claim HQ desks — it has none), `canPlaceBuilding`/`canPlaceItem` reject its footprint (margin 2).
- Persisted-edit back-compat: old blobs unaffected (HQ is code, not data). Placed items previously at the center CANNOT exist (plaza margin already excluded them) — no migration needed.
- Perf rules stand; HQ joins the frozen static subtree (its props' icon plates live outside it, like RoofPlate).
- Branch: `feat/game-m6-hq` cut from `feat/game-m5-project-rooms` (stacked on PR #9).

---

### Task 1: World model — HQ building, multi-door walls/nav, fountain relocation

**Files:** Modify `src/game/world/campus/buildings.ts` (+test), `src/game/world/campus/layout.ts` (+test), `src/game/sim/grid.ts` (+grid.test.ts), `src/game/build/edits.ts` (+edits.test.ts).

**Contracts:**

```ts
// buildings.ts
export interface Building { ...; door: {x,z};            // stays: PRIMARY door (nearest plaza/center)
  doors?: {x,z}[];                                        // NEW optional: all door points (HQ has 4); default [door]
  kind?: "hq" | "room";                                   // default "room"; HQ carries "hq"
}
export const HQ_RECT = { x: 0, z: 0, w: 14, d: 12 };
export function hqBuilding(): Building
// id/plotIndex: introduce id: string on Building? Buildings are currently identified by plotIndex+desk ids —
// give HQ plotIndex -1, desks: [] (nobody works in HQ), doors at the midpoints of all four edges,
// door = south edge midpoint (toward the camera's default view).
// campusBuildings(plots, plotProjects?) PREPENDS hqBuilding() — every consumer (nav, render, sim) sees it.

// layout.ts
// Fountain-specific plaza math: plazaRadius stays (paths still meet in a circle around HQ);
// bench ring radius adjusts to sit OUTSIDE HQ walls (ring points at r = 10, skipping door lanes ±1.5u).

// grid.ts
// Wall blocking iterates building.doors ?? [building.door]: each door opens a 2-cell gap.
// The old fountain disc block (r=5 at origin) is REMOVED — HQ walls/interior rules replace it.
// HQ interior walkable; its wall ring blocked like any room.

// edits.ts
export const PLACEABLE_KINDS = [...existing, "fountain"];  // 🛁 fountain becomes placeable decor (scale/collision like rock-large; nav-blocking)
// canPlaceBuilding/canPlaceItem: reject overlap with HQ_RECT margin 2 (like plaza today; plaza-margin checks REMAIN for the path ring).
```

TDD: hq prepended + kind/doors shape; nav: 4 door gaps open, wall ring blocked, interior walkable, path from north arm to south arm routes THROUGH HQ (doors both sides — it is a shortcut) or around, no fountain disc block remains; placement rejects HQ footprint; fountain kind valid; bench ring outside walls.

---

### Task 2: Sim — spawn inside HQ, crew rests inside, plaza ring outside walls

**Files:** Modify `src/game/sim/sim.ts` (+sim.test.ts), `src/game/sim/demo.ts` if fixture spawn points assumed the edge.

**Contracts:**

- `spawnPoint()` → HQ interior: seeded jitter inside `HQ_RECT` shrunk by 2 (clear of walls/props band). New bots appear inside and their first path naturally exits via a door (nav does this — no special casing; test it).
- Resting crew (agentId set, Idle): rest TARGETS move from plaza ring to HQ interior points (seeded ring inside HQ, radius ~3.5) — crew "hang out at HQ". Wander exclusion (M5) does NOT apply to the HQ for crew (they belong there); session bots' wander exclusion still excludes HQ's rect like any building.
- WaitingForPermission hand-raise: plaza ring OUTSIDE the HQ walls (current hashKey ring at radius ~9.5, skip door lanes) — visible from everywhere, not hidden inside.
- Working-overflow (room full) waits on the same outside ring.
- Determinism + all M5 invariants intact (groupKey matching untouched — HQ has no desks/groupKey).

TDD: spawn point inside HQ rect for many seeds; first leg exits through a door gap (sampled path crosses a door lane); crew rests inside HQ; permission/overflow ring outside walls; existing suite green (fixtures referencing (0,34) spawn or plaza rest points updated — document each).

---

### Task 3: HQ visuals — the building

**Files:** Create `src/game/world/campus/Headquarters.tsx` (+extend campus smoke); modify `src/game/world/campus/CampusWorld.tsx` (mount HQ inside frozen subtree, remove `<Fountain />`), `src/game/world/campus/Fountain.tsx` STAYS (used by the decor kind via InstancedModel? No — fountain decor renders via the standard placed-items InstancedModel path with the `fountain` model id; DELETE Fountain.tsx + its water-disc animation, note the loss of the spinning water as accepted, OR keep Fountain.tsx as the renderer for placed fountains — decide: keep the animated Fountain component, render one per placed `fountain` item INSTEAD of instancing that kind; document).

**Details:** Distinctive from pavilions: taller walls (2.6), slab 14×12 with a contrasting apron border, four door gaps with small step meshes, corner posts + `banner-green` models on two front corners (scale ~1.5), a low central podium (the spawn pad — robots appear on it), roof: OPEN center ring of beams (keeps interior visible from the game camera — no solid roof), permanent roof plate "🏛 Headquarters" (RoofPlate with fixed text, above beams, own Suspense). Interior floor markings: three prop pads (Task 4 mounts props on them). Toon materials via existing palette derivation; whole building inside the frozen static group EXCEPT the roof plate + prop plates.

Smoke: mesh-count formula; visual pass is the controller's.

---

### Task 4: Interactive props + HQ card + in-game Projects dialog

**Files:** Create `src/game/world/campus/HqProps.tsx` (in-canvas prop stands + click), `src/game/hud/ProjectsDialog.tsx` (+test), `src/game/world/campus/HqCard.tsx` (+test); modify `src/game/build/mode.ts` (+test: `hqDialog: "projects" | "hq" | null` — or reuse roomCard union with a `{kind:"hq"}` arm — pick, document), `src/game/app/GameShell.tsx` (mounts), `src/game/world/campus/CampusWorld.tsx` (HQ click → HqCard; prop clicks → dialogs).

**Contracts:**

- **Props** (three stands inside HQ on the Task-3 pads, each = small model base — lantern/bench—plus a floating icon plate like RoofPlate, y≈2.2, own Suspense):
  - 📋 **Projects** → opens ProjectsDialog.
  - 👥 **Crew** → opens the existing HireDialog (reuse GameShell's state).
  - 🧰 **Workspace** → `openWorkspaceWindow()` (src/game/app/windows.ts), playSfx("click").
    Clicks stopPropagation; disabled while build mode active (same guard as room cards).
- **ProjectsDialog** (game-styled card, HireDialog pattern): lists projects (icon, name, folder, color chip, status); create (name + folder path + color; `createProject` — folder as plain text input); edit inline (rename, recolor, folder); delete with confirm (`deleteProject`); errors surfaced inline; playSfx on actions. Room linking stays in RoomCard — this dialog manages the projects themselves.
- **HqCard** (clicking the HQ building itself, normal mode): "🏛 Headquarters" header; crew roster (all agents with color/status, from agents store); the same three shortcuts as buttons (Projects / Crew / Workspace). No project picker (HQ is not linkable — this is the key difference from RoomCard).
- jsdom tests: dialog CRUD paths with mocked commands (ok + error), HqCard roster + shortcut wiring, mode transitions, HQ click routing guard.

---

### Task 5: Boundary + build-mode integration

**Files:** Modify `src/game/characters/use-sim.ts` (+test) only if the HQ prepend needs annotation care (HQ must get groupKey null — verify `withProjectGroupKeys` passthrough), `src/game/build/BuildControls.tsx` (+test: select tool must NOT pick the HQ; building rect tool rejection already handled by canPlaceBuilding — verify ghost turns red over HQ), `src/game/build/PlacedBuildings.tsx` (if fountain-as-decor renders animated via Fountain component — the Task 3 decision), demo.ts (demo scene: HQ present, bots spawn from it).

TDD: HQ never selectable/deletable in build mode; ghost invalid over HQ; use-sim annotates HQ groupKey null; demo spawns from HQ. Full suite green.

---

### Task 6: Finish — verify, changelog, final review, PR

- [ ] Full vitest + tsc + build; perf re-measure (port 14211; walls budget note — if >46%, one targeted pass); controller visual pass: HQ from default camera (screenshot), spawn walk-out, props/plates, ProjectsDialog.
- [ ] CHANGELOG. Final whole-branch review (most capable model), one fix wave. PR (stacked on #9 or to main if #9 merged by then). Linear close.

---

## Open decisions (defaults chosen — flag to Nicky before execution)

1. **Fountain's fate**: default = becomes a placeable decor kind (keep the charming animated version as its renderer). Alternative: gone entirely.
2. **Projects prop target**: default = new in-game ProjectsDialog (full CRUD in the game idiom). Alternative: shortcut to the workspace window's Projects panel (less work, breaks immersion).
3. **Unmatched WORKING bots**: default = keep M5 behavior (wander outside — as explicitly requested). Alternative: hot-desks inside HQ for project-less Working bots (would need HQ desks + matching exception).
