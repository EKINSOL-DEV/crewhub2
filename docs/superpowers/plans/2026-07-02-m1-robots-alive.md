# M1 — Robots Alive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real Claude Code threads appear on the campus as animated boxy robots that behave according to session status — walking to desks to work, raising a hand when waiting for permission, wandering when idle — with zero LLM cost (pure simulation).

**Architecture:** Three new layers inside `src/game/`, all consuming the existing Zustand stores (backend untouched): (1) `characters/` — the procedural boxy robot (v1 mascot look: rounded-box head/body, big eyes, blush, antenna status bulb) with a pure pose/animation module; (2) `sim/` — pure TS, three.js-free: grid A\* pathfinding, desk assignment, and a per-character state machine ticked at 10 Hz, driven by `SessionStatus`; (3) `world/campus/` additions — four open pavilions (slab + pillars + beams, no roof so the camera always sees in) with 4 desks each on the reserved plots. A pure `toCharacters()` join (successor of `src/panels/world/lib/bots.ts` `toWorldBots`, copied not imported) feeds the sim; the renderer reads sim state imperatively per frame.

**Tech Stack:** unchanged from M0 — R3F v9, three 0.184, drei 10, Zustand 5, Vitest. No new dependencies.

## Global Constraints

- pnpm; tests colocated Vitest (`pnpm exec vitest run <path>`); typecheck `pnpm exec tsc --noEmit`; pre-commit prettier (fix-and-retry on failure).
- TypeScript strict; alias `@/` → `src/`.
- Do NOT import from `src/panels/**` (deleted in M4) — port code by copying. Do NOT modify `src/stores/**`, `src/ipc/**`, `src-tauri/**`.
- `src/game/sim/**` and `src/game/characters/pose.ts` must be pure TS: no three.js imports, no `Math.random()`, no `Date.now()` (time/randomness injected).
- Session statuses (from `src/ipc/bindings.ts:845`): `"Working" | "WaitingForInput" | "WaitingForPermission" | "Idle" | "Ended"`.
- Status → behavior mapping (spec §Core concept): Working → sit at desk + typing · WaitingForPermission → walk to plaza, raise hand · WaitingForInput → stand at desk edge, amber bulb · Idle → wander · crew without session (`agentId` set) → rest around the plaza · Ended → not in world (filtered by the join).
- All robots use toon materials via `toonGradientMap()` from `@/game/engine/toon`; instancing NOT required (≤ ~20 robots; individual groups are fine and animate freely).
- Performance bar stays ≥ 60 fps; sim tick 10 Hz fixed-step, render interpolates.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch: `feat/game-m1-robots` cut from `feat/game-m0-campus` (or from `feat/world-beauty-restoration` after PR #2 merges — whichever exists when Task 1 starts).

---

### Task 1: Campus buildings — pavilions + desks on the plots

**Files:**

- Create: `src/game/world/campus/buildings.ts` (pure layout math + test)
- Create: `src/game/world/campus/buildings.test.ts`
- Create: `src/game/world/campus/Pavilion.tsx`
- Modify: `src/game/world/campus/CampusWorld.tsx` (render pavilions)
- Modify: `src/game/world/campus/campus-world.smoke.test.tsx` (mesh count)

**Interfaces:**

- Consumes: `campusLayout().plots` (`Rect { x; z; w; d }`, 4 plots) from `./layout`.
- Produces: `interface Desk { id: string; x: number; z: number; rot: number; plotIndex: number }`; `interface Building { plotIndex: number; rect: Rect; desks: Desk[]; door: { x: number; z: number } }`; `campusBuildings(plots: Rect[]): Building[]` (pure, deterministic: 4 desks per pavilion in a 2×2 grid facing the center aisle; door at the plot edge nearest the origin); `Pavilion({ building }: { building: Building })` — slab, 4 corner pillars, 3 beams, desks (box top + legs + small screen block), all `meshToonMaterial` + `toonGradientMap()`.

- [ ] **Step 1: Write the failing test `buildings.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { campusBuildings } from "./buildings";
import { campusLayout } from "./layout";

describe("campusBuildings", () => {
  const buildings = campusBuildings(campusLayout().plots);

  it("builds one pavilion per plot with four desks each", () => {
    expect(buildings).toHaveLength(4);
    for (const b of buildings) {
      expect(b.desks).toHaveLength(4);
      // Desks sit inside their plot.
      for (const d of b.desks) {
        expect(Math.abs(d.x - b.rect.x)).toBeLessThan(b.rect.w / 2);
        expect(Math.abs(d.z - b.rect.z)).toBeLessThan(b.rect.d / 2);
      }
    }
  });

  it("gives every desk a unique id and each door faces the campus center", () => {
    const ids = new Set(buildings.flatMap((b) => b.desks.map((d) => d.id)));
    expect(ids.size).toBe(16);
    for (const b of buildings) {
      // Door is strictly closer to the origin than the plot center.
      expect(Math.hypot(b.door.x, b.door.z)).toBeLessThan(Math.hypot(b.rect.x, b.rect.z));
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run src/game/world/campus/buildings.test.ts` → FAIL.

- [ ] **Step 3: Write `buildings.ts`**

```ts
// Campus buildings (M1 T1) — pure layout for the four plot pavilions.
// Open structures (slab + pillars + beams, NO roof) so the fixed-pitch
// camera always sees the robots inside.
import type { Rect } from "./layout";

export interface Desk {
  id: string;
  x: number;
  z: number;
  /** Radians; the robot sits on the -facing side looking at the desk. */
  rot: number;
  plotIndex: number;
}

export interface Building {
  plotIndex: number;
  rect: Rect;
  desks: Desk[];
  /** Walk-in point on the plot edge nearest the campus center. */
  door: { x: number; z: number };
}

export function campusBuildings(plots: Rect[]): Building[] {
  return plots.map((rect, plotIndex) => {
    // Two rows of two desks, facing each other across a center aisle.
    const dx = rect.w / 4;
    const dz = rect.d / 4.5;
    const desks: Desk[] = [
      { id: `desk-${plotIndex}-0`, x: rect.x - dx, z: rect.z - dz, rot: Math.PI, plotIndex },
      { id: `desk-${plotIndex}-1`, x: rect.x + dx, z: rect.z - dz, rot: Math.PI, plotIndex },
      { id: `desk-${plotIndex}-2`, x: rect.x - dx, z: rect.z + dz, rot: 0, plotIndex },
      { id: `desk-${plotIndex}-3`, x: rect.x + dx, z: rect.z + dz, rot: 0, plotIndex },
    ];
    // Door: middle of the edge nearest the origin (plots sit on diagonals,
    // so pick the shorter-|coordinate| axis edge toward the center).
    const door =
      Math.abs(rect.x) > Math.abs(rect.z)
        ? { x: rect.x - Math.sign(rect.x) * (rect.w / 2), z: rect.z }
        : { x: rect.x, z: rect.z - Math.sign(rect.z) * (rect.d / 2) };
    return { plotIndex, rect, desks, door };
  });
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Write `Pavilion.tsx`**

```tsx
// One plot pavilion (M1 T1): raised slab, corner pillars, beams, four desks.
// Everything procedural toon — robots need somewhere to work, not a palace.
import { toonGradientMap } from "@/game/engine/toon";
import type { Building } from "./buildings";

const SLAB = "#d9c9a3";
const PILLAR = "#a98b6b";
const DESK = "#8b6f52";
const SCREEN = "#3fd1e0";

function Desk({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0.14, z]} rotation-y={rot}>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[1.5, 0.09, 0.75]} />
        <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
      </mesh>
      {[-0.62, 0.62].map((sx) => (
        <mesh key={sx} position={[sx, 0.27, 0]} castShadow>
          <boxGeometry args={[0.09, 0.55, 0.7]} />
          <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      <mesh position={[0, 0.86, -0.22]} rotation-x={-0.15} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.06]} />
        <meshToonMaterial color={SCREEN} gradientMap={toonGradientMap()} />
      </mesh>
    </group>
  );
}

export function Pavilion({ building }: { building: Building }) {
  const { rect } = building;
  const px = rect.w / 2 - 0.5;
  const pz = rect.d / 2 - 0.5;
  return (
    <group position={[rect.x, 0, rect.z]}>
      <mesh position-y={0.07} receiveShadow>
        <boxGeometry args={[rect.w, 0.14, rect.d]} />
        <meshToonMaterial color={SLAB} gradientMap={toonGradientMap()} />
      </mesh>
      {[
        [-px, -pz],
        [px, -pz],
        [-px, pz],
        [px, pz],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 1.9, z!]} castShadow>
          <boxGeometry args={[0.35, 3.8, 0.35]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {/* Three open beams instead of a roof — structure without occlusion. */}
      {[-pz, 0, pz].map((z, i) => (
        <mesh key={i} position={[0, 3.85, z]} castShadow>
          <boxGeometry args={[rect.w, 0.18, 0.3]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {building.desks.map((d) => (
        <Desk key={d.id} x={d.x - rect.x} z={d.z - rect.z} rot={d.rot} />
      ))}
    </group>
  );
}
```

- [ ] **Step 6: Render in `CampusWorld.tsx`** — add imports and, inside the root group:

```tsx
{
  campusBuildings(layout.plots).map((b) => <Pavilion key={b.plotIndex} building={b} />);
}
```

(compute `const buildings = useMemo(() => campusBuildings(layout.plots), [layout]);` beside the layout memo and map over that).

- [ ] **Step 7: Update the smoke test mesh count** — each pavilion adds: 1 slab + 4 pillars + 3 beams + 4 desks × (1 top + 2 legs + 1 screen) = 24 meshes; 4 pavilions = 96. Update the count formula with a `PAVILION_MESHES = 4 * 24` constant and comment.

- [ ] **Step 8: Verify + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run src/game
git add src/game/world/campus && git commit -m "feat(game): campus pavilions with desks on the four plots"
```

Then `pnpm dev` → `?game`: four open pavilions with desks on the diagonal plots. Screenshot for the record (controller does this at review time).

---

### Task 2: The robot — procedural boxy model

**Files:**

- Create: `src/game/characters/Robot.tsx`
- Create: `src/game/characters/robot.smoke.test.tsx`

**Interfaces:**

- Consumes: `toonGradientMap` from `@/game/engine/toon`.
- Produces: `RobotHandles { body: Group; head: Group; armL: Group; armR: Group; eyes: Group; bulb: MeshToonMaterial }` via ref; `Robot({ color, bulbColor, handles }: { color: string; bulbColor: string; handles?: MutableRefObject<RobotHandles | null> })` — the v1 mascot: rounded-box body with darker lower band, rounded-box head with big white eyes + pupils + blush cheeks + smile, two capsule arms pivoted at the shoulder, two dark feet, antenna with a status bulb. Static pose; animation comes from Task 3 driving the handles.

- [ ] **Step 1: Write `Robot.tsx`**

```tsx
// The CrewHub robot (M1 T2) — the boxy v1 mascot rebuilt for the campus:
// rounded-box head/body, big eyes, blush, antenna bulb. Parts are exposed
// through `handles` so the animator (per frame) never touches React.
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { toonGradientMap } from "@/game/engine/toon";

export interface RobotHandles {
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  eyes: THREE.Group;
  bulb: THREE.MeshToonMaterial;
}

const EYE_WHITE = "#ffffff";
const PUPIL = "#1f2430";
const BLUSH = "#f9a8d4";
const FEET = "#2a2f3a";

export function Robot({
  color,
  bulbColor,
  handles,
}: {
  color: string;
  bulbColor: string;
  handles?: MutableRefObject<RobotHandles | null>;
}) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const bulb = useRef<THREE.MeshToonMaterial>(null);

  useEffect(() => {
    if (!handles) return;
    if (body.current && head.current && armL.current && armR.current && eyes.current && bulb.current) {
      handles.current = {
        body: body.current,
        head: head.current,
        armL: armL.current,
        armR: armR.current,
        eyes: eyes.current,
        bulb: bulb.current,
      };
    }
    return () => {
      if (handles) handles.current = null;
    };
  }, [handles]);

  const grad = toonGradientMap();
  return (
    <group ref={body}>
      {/* feet */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.09, 0]} castShadow>
          <boxGeometry args={[0.22, 0.18, 0.3]} />
          <meshToonMaterial color={FEET} gradientMap={grad} />
        </mesh>
      ))}
      {/* body with darker lower band */}
      <RoundedBox args={[0.66, 0.62, 0.46]} radius={0.09} position={[0, 0.52, 0]} castShadow>
        <meshToonMaterial color={color} gradientMap={grad} />
      </RoundedBox>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.6, 0.14, 0.4]} />
        <meshToonMaterial color={new THREE.Color(color).multiplyScalar(0.72)} gradientMap={grad} />
      </mesh>
      {/* arms — pivot groups at the shoulders */}
      <group ref={armL} position={[-0.4, 0.74, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.26, 4, 8]} />
          <meshToonMaterial color={color} gradientMap={grad} />
        </mesh>
      </group>
      <group ref={armR} position={[0.4, 0.74, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.26, 4, 8]} />
          <meshToonMaterial color={color} gradientMap={grad} />
        </mesh>
      </group>
      {/* head */}
      <group ref={head} position={[0, 1.12, 0]}>
        <RoundedBox args={[0.58, 0.5, 0.5]} radius={0.1} castShadow>
          <meshToonMaterial color={color} gradientMap={grad} />
        </RoundedBox>
        <group ref={eyes} position={[0, 0.04, 0.26]}>
          {[-0.13, 0.13].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh>
                <sphereGeometry args={[0.075, 12, 10]} />
                <meshToonMaterial color={EYE_WHITE} gradientMap={grad} />
              </mesh>
              <mesh position={[0, 0, 0.05]}>
                <sphereGeometry args={[0.035, 10, 8]} />
                <meshToonMaterial color={PUPIL} gradientMap={grad} />
              </mesh>
            </group>
          ))}
        </group>
        {/* blush */}
        {[-0.21, 0.21].map((x) => (
          <mesh key={x} position={[x, -0.08, 0.255]}>
            <circleGeometry args={[0.05, 10]} />
            <meshToonMaterial color={BLUSH} gradientMap={grad} />
          </mesh>
        ))}
        {/* smile */}
        <mesh position={[0, -0.13, 0.26]} rotation-z={Math.PI}>
          <torusGeometry args={[0.07, 0.016, 6, 12, Math.PI]} />
          <meshToonMaterial color={PUPIL} gradientMap={grad} />
        </mesh>
        {/* antenna + status bulb */}
        <mesh position={[0, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 6]} />
          <meshToonMaterial color={FEET} gradientMap={grad} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshToonMaterial
            ref={bulb}
            color={bulbColor}
            emissive={bulbColor}
            emissiveIntensity={0.7}
            gradientMap={grad}
          />
        </mesh>
      </group>
    </group>
  );
}
```

- [ ] **Step 2: Write the smoke test `robot.smoke.test.tsx`** (mock drei `RoundedBox` → plain `mesh+boxGeometry` if it needs GL; otherwise use it directly):

```tsx
import { describe, expect, it } from "vitest";
import { createRef } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { RobotHandles } from "./Robot";
import { Robot } from "./Robot";

describe("Robot smoke", () => {
  it("mounts the boxy mascot and exposes animation handles", async () => {
    const handles = createRef<RobotHandles | null>() as React.MutableRefObject<RobotHandles | null>;
    const renderer = await ReactThreeTestRenderer.create(
      <Robot color="#7dd3fc" bulbColor="#22c55e" handles={handles} />,
    );
    const meshes = renderer.scene.findAllByType("Mesh");
    expect(meshes.length).toBeGreaterThanOrEqual(14); // feet+body+band+arms+head+eyes+pupils+blush+smile+antenna+bulb
    expect(handles.current).not.toBeNull();
    expect(handles.current!.armR).toBeDefined();
    expect(handles.current!.bulb).toBeDefined();
    await renderer.unmount();
  });
});
```

- [ ] **Step 3: Run, fix, verify** — `pnpm exec vitest run src/game/characters` → PASS (if drei's `RoundedBox` suspends or needs GL under the test renderer, mock it in the TEST only to a plain box mesh, with a comment — production keeps RoundedBox).

- [ ] **Step 4: Typecheck + commit** — `feat(game): the boxy robot mascot, animation handles exposed`.

---

### Task 3: Pose math — the pure animation module

**Files:**

- Create: `src/game/characters/pose.ts`
- Create: `src/game/characters/pose.test.ts`

**Interfaces:**

- Produces (pure, three-free): `type Motion = "stand" | "walk" | "sit-type" | "raise-hand" | "think" | "sad"`; `interface Pose { bodyY: number; bodyTiltX: number; headNodX: number; headTiltZ: number; armL: number; armR: number; blink: boolean }` (arm values = rotation.x radians at the shoulder; negative raises forward/up); `pose(motion: Motion, t: number): Pose` — deterministic in `t` (seconds).

- [ ] **Step 1: Write the failing test `pose.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { pose } from "./pose";

describe("pose", () => {
  it("walk bobs the body and counter-swings the arms", () => {
    const a = pose("walk", 0.1);
    const b = pose("walk", 0.35);
    expect(a.bodyY).not.toBeCloseTo(b.bodyY, 5); // bobbing
    expect(Math.sign(a.armL)).toBe(-Math.sign(a.armR)); // counter-swing
  });

  it("sit-type lowers the body and puts both arms forward", () => {
    const p = pose("sit-type", 1);
    expect(p.bodyY).toBeLessThan(0);
    expect(p.armL).toBeLessThan(-0.5);
    expect(p.armR).toBeLessThan(-0.5);
  });

  it("raise-hand lifts exactly one arm high", () => {
    const p = pose("raise-hand", 2);
    expect(p.armR).toBeLessThan(-2); // straight up
    expect(p.armL).toBeGreaterThan(-0.5);
  });

  it("sad slumps forward with head down", () => {
    const p = pose("sad", 0);
    expect(p.bodyTiltX).toBeGreaterThan(0.1);
    expect(p.headNodX).toBeGreaterThan(0.15);
  });

  it("blinks periodically but rarely", () => {
    let blinks = 0;
    for (let t = 0; t < 10; t += 1 / 30) if (pose("stand", t).blink) blinks++;
    expect(blinks).toBeGreaterThan(0);
    expect(blinks).toBeLessThan(60); // brief blinks, most frames open
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Write `pose.ts`**

```ts
// Robot pose math (M1 T3) — pure, deterministic in t. The renderer applies
// these to RobotHandles every frame; the sim only picks the Motion.

export type Motion = "stand" | "walk" | "sit-type" | "raise-hand" | "think" | "sad";

export interface Pose {
  bodyY: number;
  bodyTiltX: number;
  headNodX: number;
  headTiltZ: number;
  armL: number;
  armR: number;
  blink: boolean;
}

const REST: Pose = { bodyY: 0, bodyTiltX: 0, headNodX: 0, headTiltZ: 0, armL: 0, armR: 0, blink: false };

/** Blink ~ every 3.4s for 0.12s — same rhythm for every motion. */
function blinkAt(t: number): boolean {
  return t % 3.4 < 0.12;
}

export function pose(motion: Motion, t: number): Pose {
  const blink = blinkAt(t);
  switch (motion) {
    case "walk": {
      const s = Math.sin(t * 9);
      return { ...REST, bodyY: Math.abs(Math.sin(t * 9)) * 0.055, armL: s * 0.55, armR: -s * 0.55, blink };
    }
    case "sit-type": {
      const tap = Math.sin(t * 13) * 0.09;
      return {
        ...REST,
        bodyY: -0.24,
        armL: -0.95 + tap,
        armR: -0.95 - tap,
        headNodX: 0.12,
        blink,
      };
    }
    case "raise-hand": {
      const wave = Math.sin(t * 6) * 0.12;
      return { ...REST, bodyY: Math.abs(Math.sin(t * 6)) * 0.03, armR: -2.7 + wave, headNodX: -0.08, blink };
    }
    case "think":
      return { ...REST, headTiltZ: Math.sin(t * 1.1) * 0.16, armR: -1.7, headNodX: -0.05, blink };
    case "sad":
      return { ...REST, bodyTiltX: 0.18, headNodX: 0.24, bodyY: -0.05, blink };
    case "stand":
    default:
      return { ...REST, bodyY: Math.sin(t * 2.2) * 0.015, blink };
  }
}
```

- [ ] **Step 4: Run to verify it passes; typecheck; commit** — `feat(game): pure robot pose math — walk, type, raise-hand, think, sad`.

---

### Task 4: `toCharacters()` — the store join

**Files:**

- Create: `src/game/sim/characters.ts`
- Create: `src/game/sim/characters.test.ts`

**Interfaces:**

- Consumes types only: `Agent`, `SessionStatus` from `@/ipc/bindings`; `SessionView` from `@/stores/sessions` (type import is allowed — it's the store layer, not panels).
- Produces: `interface Character { key: string; name: string; status: SessionStatus; activity: string | null; color: string; isSubagent: boolean; parentKey: string | null; agentId: string | null }`; `toCharacters(views: SessionView[], opts: { agents?: Agent[]; nowMs: number }): Character[]` — port of `src/panels/world/lib/bots.ts` `toWorldBots` (read it as reference, copy what's needed, drop the room/zone logic — the campus sim assigns desks itself): recent-window filter (5 min), subagent humanized names, palette hash colors, resting crew entries with `agentId` set and status `"Idle"`.

- [ ] **Step 1: Write the failing test** — port the essentials (build a fake `SessionView` factory exactly like the old world's tests do — see `src/panels/world/lib/bots.test.ts` for the factory shape):

```ts
import { describe, expect, it } from "vitest";
import type { SessionView } from "@/stores/sessions";
import { toCharacters } from "./characters";

const NOW = 1_000_000;

function view(key: string, over: Record<string, unknown> = {}): SessionView {
  return {
    key,
    displayName: key,
    meta: {
      id: { provider: "claude", id: key },
      status: "Working",
      activity_detail: null,
      parent: null,
      project_path: "/tmp/proj",
      last_activity_ms: NOW,
      model: null,
      ...((over.meta as object) ?? {}),
    },
    binding: null,
    agent: null,
    room: null,
    project: null,
    ...over,
  } as unknown as SessionView;
}

describe("toCharacters", () => {
  it("keeps recent live sessions, drops ended and stale ones", () => {
    const chars = toCharacters(
      [
        view("a"),
        view("ended", { meta: { status: "Ended", last_activity_ms: NOW } }),
        view("stale", { meta: { status: "Idle", last_activity_ms: NOW - 6 * 60_000 } }),
      ],
      { nowMs: NOW },
    );
    expect(chars.map((c) => c.key)).toEqual(["a"]);
  });

  it("adds resting crew for agents without a live session", () => {
    const chars = toCharacters([], {
      nowMs: NOW,
      agents: [{ id: "ag1", name: "Robo", color: "#ff0000", default_model: null } as never],
    });
    expect(chars).toHaveLength(1);
    expect(chars[0]!.agentId).toBe("ag1");
    expect(chars[0]!.status).toBe("Idle");
    expect(chars[0]!.color).toBe("#ff0000");
  });

  it("gives stable palette colors to unbound sessions", () => {
    const [a1] = toCharacters([view("a")], { nowMs: NOW });
    const [a2] = toCharacters([view("a")], { nowMs: NOW });
    expect(a1!.color).toBe(a2!.color);
  });
});
```

(If the `SessionView` factory shape mismatches the real type, check `src/stores/sessions.ts` and `src/panels/world/lib/bots.test.ts` and adapt the FACTORY, not the production code.)

- [ ] **Step 2: Run → FAIL. Step 3: Write `characters.ts`** by porting `toWorldBots` (5-minute `ACTIVE_WINDOW_MS`, `botColor` palette hash, `humanizeSubagentName`) minus rooms/zones. **Step 4: Run → PASS; typecheck; commit** — `feat(game): toCharacters store join — sessions + crew to campus characters`.

---

### Task 5: Sim — grid pathfinding

**Files:**

- Create: `src/game/sim/grid.ts`
- Create: `src/game/sim/grid.test.ts`

**Interfaces:**

- Consumes: `CAMPUS`, `campusLayout` types from `@/game/world/campus/layout`; `Building` from `@/game/world/campus/buildings`.
- Produces: `interface NavGrid { size: number; cell: number; blocked: Uint8Array }`; `buildNavGrid(layout: CampusLayout, buildings: Building[]): NavGrid` (1-unit cells over ±CAMPUS.half; blocked: fountain disc r=5 at origin, every tree/rock placement cell, pavilion pillars and desk cells — paths/plaza/grass walkable); `findPath(grid: NavGrid, from: {x,z}, to: {x,z}): {x,z}[]` — A\* 4-directional + straight-line waypoint smoothing (skip intermediate waypoints while the direct grid line is unblocked); returns `[]` when unreachable; nearest-walkable snap for blocked endpoints.

- [ ] **Step 1: failing tests** — routes around the fountain (path from (-10,0) to (10,0) must exist and no waypoint may be inside r=5 of origin); returns [] for a target outside bounds; snaps a blocked target (desk cell) to its nearest walkable neighbor; smoothed path has fewer waypoints than raw A\* on an open field (from (-20,-20) to (20,20) expect ≤ 6 waypoints).
- [ ] **Step 2-4: implement** (standard A* with binary heap or sorted array — 80×80 grid, perf is trivial), verify, commit — `feat(game): sim nav grid + A* with waypoint smoothing`.

---

### Task 6: Sim — character state machine + world state

**Files:**

- Create: `src/game/sim/sim.ts`
- Create: `src/game/sim/sim.test.ts`

**Interfaces:**

- Consumes: `Character` (T4), `NavGrid`/`findPath` (T5), `Desk`/`Building` (T1), `Motion` (T3 — type-only import is fine, it's pure).
- Produces:

```ts
interface SimBot {
  key: string;
  x: number; z: number; facing: number;
  motion: Motion;
  deskId: string | null;
  path: { x: number; z: number }[];
  /** Wall-clock-free simulation age for this bot, seconds. */
  age: number;
}
interface SimWorld { bots: Map<string, SimBot>; deskOwners: Map<string, string> }
createSim(grid: NavGrid, buildings: Building[], seed: number): Sim
Sim.sync(characters: Character[]): void   // add/remove bots, react to status changes
Sim.tick(dt: number): void                // fixed-step advance; move along paths at WALK_SPEED 2.2 u/s
Sim.world: SimWorld                       // read by the renderer
```

Behavior rules (each is a test):

- New Working character → assigned a free desk (stable while Working) → path to its desk door then desk → at desk: `motion: "sit-type"`, position snapped to the desk's sit point, facing the desk.
- WaitingForPermission → releases nothing, walks to the plaza ring (radius 11, angle = hash of key) → `raise-hand`.
- WaitingForInput → stays at/near desk, `stand` with `think` alternation every ~4s.
- Idle (session) → wander: pick seeded random walkable targets within 12 units, `walk`/`stand` alternating with pauses.
- Idle (crew, `agentId` set) → wander only inside the plaza ring (radius ≤ 9).
- Character disappears from `sync` → bot removed, desk freed.
- Desks exhausted (17+ workers) → overflow Working bots sit-type at the plaza edge (any free plaza spot) — never crash.
- Determinism: same seed + same sync/tick sequence ⇒ identical world (no Math.random/Date.now — seeded mulberry32 like `layout.ts`).

- [ ] **Steps: failing tests for each rule → implement → pass → commit** — `feat(game): character sim — desk work, raised hands, wander, 10Hz determinism`.

---

### Task 7: Characters renderer — sim → robots on screen

**Files:**

- Create: `src/game/characters/Characters.tsx`
- Create: `src/game/characters/use-sim.ts`
- Create: `src/game/characters/characters.smoke.test.tsx`

**Interfaces:**

- Consumes: stores (`useSessionsView` from `@/stores/sessions`, `useAgentsStore`), `toCharacters` (T4), `createSim`/`buildNavGrid` (T5/T6), `Robot`/`RobotHandles` (T2), `pose` (T3).
- Produces: `Characters()` — mounts one `<Robot>` per sim bot plus a drei `Billboard`+`Text` nameplate (styled like the old world's, but re-implemented — no panels import); `use-sim.ts` hook: initializes stores (`useSessionsStore.getState().init()` etc. — copy the init block from `src/panels/world/WorldPanel.tsx:51-59`), builds grid+sim once, `useFrame` accumulates dt and calls `sim.tick(0.1)` at fixed 10 Hz, calls `sim.sync(toCharacters(...))` when the joined array changes (memo), exposes `sim.world` + a bots-version counter for React lists.
- Render loop rules: per frame, for each robot group: damp position toward `SimBot.x/z` (rate 8), damp facing, compute `pose(bot.motion, bot.age)` and apply to `RobotHandles` (body.position.y, body.rotation.x, head rotations, arm rotations, eyes.scale.y = blink ? 0.1 : 1, bulb color from status: Working `#22c55e`, WaitingForPermission `#ef4444`, WaitingForInput `#f59e0b`, Idle `#94a3b8`).
- Status bulb color map lives here as `BULB: Record<SessionStatus, string>`.

- [ ] **Steps:** smoke test mounts `Characters` with mocked stores (two fake sessions: one Working, one WaitingForPermission) and asserts two robots (≥28 meshes) with correct bulb colors; implement; wire `<Characters />` into `CampusWorld` (inside Suspense); update campus smoke count if it mounts there (prefer mounting in `GameShell` beside `<env.World />` to keep the campus smoke stable — decide, document, keep tests green). Commit — `feat(game): robots on campus — sim-driven, interpolated, status bulbs`.

---

### Task 8: HUD roster + demo mode

**Files:**

- Modify: `src/game/hud/HudOverlay.tsx` (add robot count chip: `🤖 N`)
- Create: `src/game/sim/demo.ts` (+ test)
- Modify: `src/game/app/GameShell.tsx` (`?game&demo` mounts demo characters)

**Interfaces:**

- Produces: `demoCharacters(nowMs: number): Character[]` — 6 deterministic fake characters covering every status (2 Working, 1 WaitingForPermission, 1 WaitingForInput, 1 Idle session, 1 resting crew) so the world is verifiable without a live Claude Code session; `use-sim.ts` accepts an optional `override?: Character[]`.

- [ ] **Steps:** test demoCharacters covers all statuses; implement; wire `search.has("demo")` through GameShell → Characters; HUD chip shows live count. Verify at `?game&demo`: six robots — two typing at desks, one hand-raiser at the plaza, one thinker, wanderers. Commit — `feat(game): demo characters + HUD roster count`.

---

### Task 9: Finish — verification, CHANGELOG, PR, Linear

- [ ] **Step 1:** Full suite + typecheck + `pnpm build`.
- [ ] **Step 2:** Controller visual pass (headless screenshots of `?game&demo`): robots at desks typing, hand raised at plaza, pavilions look right, ≥60fps at medium, nameplates readable. Iterate on positions/scales as needed (small numeric tunes only).
- [ ] **Step 3:** Real-session pass: `pnpm tauri dev` with a live/`fake-claude` session — robots reflect real statuses.
- [ ] **Step 4:** CHANGELOG entry under Unreleased: `- feat(game): M1 "Robots alive" — session-driven boxy robots with desk work, raised hands and wandering; campus pavilions; pure-TS sim (EKI-1xx)`.
- [ ] **Step 5:** Final whole-branch review (superpowers:requesting-code-review), PR `feat/game-m1-robots`, close Linear issues.
