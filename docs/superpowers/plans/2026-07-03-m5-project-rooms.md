# M5 — Project Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (user feedback, verbatim intent):** buildings are PROJECT rooms — each linked to a project (the folder the project lives in); bots that belong to that project work at desks inside it; a bot not attached to any project room wanders around OUTSIDE the rooms; visually rooms get walls and an open door.

**Architecture:** Buildings gain `projectId` (base pavilions via a persisted `plotProjects` map in CampusEdits; placed buildings via a new field). The React boundary (use-sim) resolves projectId → `Project.folder_path` and annotates buildings AND characters with a normalized `folder` group key; the pure sim matches desk pools by that key and sends unmatched bots wandering with building rects excluded. Pavilion grows toon walls with a door gap; the nav grid blocks wall cells (door stays walkable). Zero backend changes — projects/rooms/bindings APIs already exist.

**Tech Stack:** unchanged.

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict (exactOptionalPropertyTypes); alias `@/`; NO src/panels imports in src/game.
- Sim stays pure: no Math.random/Date.now; folder matching happens at the React boundary, the sim sees opaque `groupKey: string | null`.
- Persistence: CampusEdits blob version bump with DEFENSIVE parse — old blobs (no `plotProjects`, buildings without `projectId`) MUST load with defaults, never reset.
- Path normalization: strip trailing slashes, case-sensitive compare (macOS paths as stored).
- Determinism: same seed + same inputs ⇒ same world (existing test pattern).
- Perf rules stand (instancing, no per-frame allocation, static-matrix freeze unaffected — walls join the frozen base pavilions; placed-building walls live with PlacedBuildings remounts).
- Branch: `feat/game-m5-project-rooms` cut from `main`.

---

### Task 1: Data — project links on buildings + folder on characters (pure + store)

**Files:** Modify `src/game/build/edits.ts` (+`edits.test.ts`), `src/game/build/store.ts` (+`store.test.ts`), `src/game/world/campus/buildings.ts` (+test), `src/game/sim/characters.ts` (+`characters.test.ts`).

**Contracts:**

```ts
// buildings.ts
export interface Building { plotIndex: number; rect: Rect; desks: Desk[]; door: {x,z}; projectId: string | null }
// campusBuildings(plots, plotProjects?: Record<number, string>) — base four get projectId from the map (default null). Backward-compatible signature.

// edits.ts
export interface PlacedBuilding { ...existing; projectId: string | null }  // roomId stays for blob back-compat but is DEPRECATED (comment; tint moves to project color in T4)
export interface CampusEdits { ...existing; plotProjects: Record<number, string> }
// applyEdits carries projectId through buildingDesks->Building; EMPTY_EDITS gains plotProjects: {}

// store.ts
setPlotProject(plotIndex: number, projectId: string | null): void   // persist + version bump
setBuildingProject(id: string, projectId: string | null): void      // persist + per-building
// parse: missing plotProjects -> {}; buildings without projectId -> null (old blobs load cleanly — test with a literal old-shape JSON fixture)

// characters.ts
export interface Character { ...existing; projectPath: string | null }
// sessions: meta.project_path; crew agents: agent.project_path; normalize via exported normalizeFolder(p): string (strip trailing "/")
```

TDD: old-blob fixture parse; plotProjects round-trip; applyEdits projectId propagation; toCharacters projectPath for sessions + crew; normalizeFolder cases.

---

### Task 2: Sim — project desk pools + outside wandering

**Files:** Modify `src/game/sim/sim.ts` (+`sim.test.ts`), `src/game/sim/grid.ts` ONLY if wander exclusion needs a rect helper (prefer exporting `insideAnyBuilding(x,z,buildings,margin)` from sim.ts or a tiny shared util).

**Contracts:**

- `createSim(grid, buildings, seed)` / `updateWorld(grid, buildings)` unchanged signatures — buildings now carry `projectId`; `Sim.sync(characters)` characters carry `projectPath`.
- Boundary annotation happens in use-sim (Task 5): each Building gets `groupKey = folder of its project` (null when unlinked); each bot `groupKey = normalizeFolder(projectPath)`. To keep the sim pure AND typed, add optional `groupKey?: string | null` to Building and Character consumed only by the sim (document).
- Desk matching: `findFreeDesk(bot)` only considers buildings where `building.groupKey != null && building.groupKey === bot.groupKey`. No fallback squatting.
- Unmatched bots (no groupKey, or no building with their key): Working/WaitingForInput behave like a calm wander loop OUTSIDE rooms — reuse the existing wander mechanics but wander targets are rejected when inside any building rect (margin 1); status bulb unchanged (visual state still shows Working). WaitingForPermission keeps its plaza hand-raise. Idle/crew unchanged except the same building-rect exclusion on wander targets.
- Matched bots keep today's behavior (desk work, desk-adjacent thinking, overflow at plaza when their room's desks are full).
- Desk retention across updateWorld (M3 invariant) still holds; a desk whose building LOSES the bot's project on updateWorld is released (existing desk-survival check must also compare groupKey — the desk id may survive while the link changes; test this).

TDD: matched bot sits only in its project's building (two buildings, two projects); unmatched bot never claims a desk and its wander legs never end inside a building rect (sample path points); project full → overflow plaza; updateWorld relink releases/reassigns correctly; determinism.

---

### Task 3: Walls and an open door

**Files:** Modify `src/game/world/campus/Pavilion.tsx` (+`pavilion.smoke.test.tsx`), `src/game/sim/grid.ts` (+`grid.test.ts`).

**Contracts:**

- Pavilion renders perimeter walls: toon boxes, height 2.0, thickness 0.3, INSET 0.1 from rect edge, wall color derived from slab palette (slightly lighter; keep roof + corner pillars). The wall on the DOOR side gets a centered gap of 2.2 units (door.x/door.z tells which side: the door sits on one edge — compute side by comparing door to rect edges; split that wall into two segments). Mesh count formula in the smoke test updates accordingly (parametric across 6x5 / 10x8 / 20x16).
- `buildNavGrid`: block wall cells — perimeter cells of each building rect EXCEPT the door gap (2 cells centered on the door) and EXCEPT interior. Desks/pillars stay blocked as today. Bots must still path THROUGH the door to reach desks (test: path from outside to a desk passes within 1.2u of the door point; a path attempting the far side goes around).
- Keep supercover/`findPath` untouched.

TDD first on grid blocking; visual smoke via mesh counts.

---

### Task 4: Room UX — project link dialog, room card, roof nameplate

**Files:** Rewrite `src/game/build/RoomLinkDialog.tsx` → project-based (keep filename; +`room-link.test.tsx`), create `src/game/world/campus/RoomCard.tsx` (+test), `RoofPlate.tsx` (in-canvas, +extend campus smoke), modify `src/game/build/PlacedBuildings.tsx` (tint from project color; pick proxy click in NORMAL mode opens RoomCard), `src/game/world/campus/Pavilions.tsx`/`CampusWorld.tsx` (base pavilion click → RoomCard; roof plates), `src/game/app/GameShell.tsx` (RoomCard mount), `src/game/build/store.ts` only if a tiny ui-store field is needed for "open room card" (pattern: mode.ts pendingRoomLink).

**Contracts:**

- RoomLinkDialog (post-placement): lists PROJECTS (useProjectsStore: name, icon?, color, folder_path subtitle) + "No project" → `setBuildingProject`. Sfx click.
- RoomCard (click a pavilion/placed building outside build mode): game-styled card showing current project (or "Unassigned"), folder path, a project picker to (re)assign — `setPlotProject` for base pavilions / `setBuildingProject` for placed — and the list of bots currently assigned to this room (characters whose normalized projectPath equals the project folder; live from the same joins use-sim uses — export a small selector helper from use-sim or characters.ts).
- RoofPlate: Billboard above the roof (own Suspense): project icon+name (or nothing when unlinked), color dot. Base pavilions + placed buildings both.
- Click routing: building click must not fire while build mode is active (item tool guard from M4 stays).

jsdom tests for dialog/card wiring (mocked stores); smoke for plates.

---

### Task 5: Boundary wiring — use-sim annotation + edits/env integration

**Files:** Modify `src/game/characters/use-sim.ts` (+`use-sim.test.tsx`), `src/game/build/BuildControls.tsx` (placed-building flow passes projectId null initially — dialog assigns), anything from T1-T4 that needs joining.

**Contracts:**

- use-sim: `useProjectsStore` join — build `folderByProjectId`; annotate `campusBuildings(layout.plots, edits.plotProjects)` + applyEdits result with `groupKey`; annotate characters with `groupKey = normalizeFolder(projectPath)`. Effect deps: edits version + projects list + biome skip (existing appliedRef pattern extends — any change re-derives grid+buildings and calls updateWorld; the base `sim` useMemo now also seeds plotProjects at mount when edits already loaded — keep the mount/effect split coherent and documented).
- Demo mode: demo characters get projectPath null BUT demo buildings unlinked → all demo bots wander outside? That kills the demo's charm (seated robots). Demo override: when `override` is set, skip group matching entirely (sim behaves as today — treat all groupKeys as matching; simplest: annotate demo buildings AND bots with groupKey null AND make the sim's matcher treat "both null" as a match ONLY in a `looseMatch` flag passed to createSim for demo... simpler alternative: demo.ts assigns a fake shared folder to all demo bots and all four pavilions). Choose the least invasive, document, test.
- Full suite green.

---

### Task 6: Finish — verify, changelog, final review, PR

- [ ] Full vitest + tsc + build; perf re-measure (script, port 14211, bar ≤45%); controller visual pass: walls+door screenshot, roof plates, unmatched bot outside.
- [ ] CHANGELOG entry. Final whole-branch review (most capable model), one fix wave. PR to main. Linear close.
