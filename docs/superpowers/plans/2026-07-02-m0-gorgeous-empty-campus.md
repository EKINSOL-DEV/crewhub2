# M0 — Gorgeous Empty Campus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visually stunning, empty campus world (`src/game/`) — authored CC0 assets, toon + ink-outline rendering, RTS game camera, environment system with Campus as the first environment, quality tiers — reachable at `?game` without touching the existing world.

**Architecture:** New self-contained frontend tree `src/game/` rendered by React Three Fiber v9. Pure math/simulation lives in plain TS files with unit tests (the `src/panels/world/lib/` discipline). Assets flow through a two-step pipeline: `scripts/assets/fetch-kits.mjs` downloads CC0 Kenney kits into gitignored `assets-src/`, `scripts/assets/build-assets.mjs` optimizes manifest-listed models into committed `public/assets/models/*.glb`. Nothing under `src-tauri/`, `src/ipc/`, or `src/stores/` changes except zero lines — the game reads settings via the existing `commands.getSetting/setSetting` pattern.

**Tech Stack:** React 19 · TypeScript strict · R3F v9 (`@react-three/fiber` 9.6) · `@react-three/drei` 10 · three 0.184 · NEW: `postprocessing` + `@react-three/postprocessing` + `n8ao` (runtime), `@gltf-transform/cli` (dev) · Zustand 5 · Vitest + `@react-three/test-renderer`.

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, `pnpm exec`); Node ≥ 22 (has global `fetch`, `import.meta.dirname`).
- TypeScript strict; path alias `@/` → `src/` (vite + tsconfig already configured).
- Tests are colocated Vitest files (`*.test.ts(x)`) run with `pnpm exec vitest run <path>`; full suite `pnpm exec vitest run`.
- Typecheck with `pnpm exec tsc --noEmit`.
- Pre-commit hook runs prettier/eslint (lefthook). If a commit fails on formatting, run `pnpm exec prettier --write <files>` and retry.
- No `Math.random()` or `Date.now()` in render paths — seeded/deterministic placement only (existing world rule).
- Shadow type is `PCFShadowMap` (PCFSoft logs a deprecation in three 0.184 — see `src/panels/world/WorldPanel.tsx:321`).
- Assets must be CC0 (Kenney). `assets-src/` is gitignored; optimized `public/assets/models/*.glb` ARE committed.
- Do not modify `src/panels/world/**`, `src/stores/**`, `src/ipc/**`, or `src-tauri/**` (read-only reference). The only shared-file edits are `src/App.tsx` (route), `package.json`, `.gitignore`.
- Performance bar: ≥ 60 fps on the dev machine at `medium` quality; all repeated decor instanced.
- Commit style: conventional commits ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work happens on branch `feat/game-m0-campus` (created in Task 1 from `feat/world-beauty-restoration`).

---

### Task 1: Dependencies, game scaffold, `?game` route

**Files:**

- Modify: `package.json` (deps via pnpm)
- Create: `src/game/app/GameShell.tsx`
- Create: `src/game/engine/GameCanvas.tsx`
- Modify: `src/App.tsx` (add route)

**Interfaces:**

- Produces: `GameShell` (default export, full-screen div + canvas), `GameCanvas({ children }: { children: React.ReactNode })` — the single R3F `<Canvas>` wrapper every later task renders into.

- [ ] **Step 1: Create branch and install dependencies**

```bash
git checkout -b feat/game-m0-campus
pnpm add postprocessing @react-three/postprocessing n8ao
pnpm add -D @gltf-transform/cli
```

Expected: lockfile updated, no peer warnings blocking install (drei/fiber v9 satisfy @react-three/postprocessing v3 peers).

- [ ] **Step 2: Write `src/game/engine/GameCanvas.tsx`**

```tsx
// The one R3F canvas of the game (M0 T1). Renderer defaults live here so
// every scene gets the same grounded look: ACES filmic, PCF shadows,
// antialias off (the composer's MSAA takes over in T11).
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFShadowMap } from "three";

export function GameCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [18, 20, 26], fov: 40, near: 0.5, far: 300 }}
      gl={{ toneMapping: ACESFilmicToneMapping, antialias: false }}
      fallback={null}
    >
      {children}
    </Canvas>
  );
}
```

- [ ] **Step 3: Write `src/game/app/GameShell.tsx`**

```tsx
// Game shell (M0 T1): the campus world IS the screen. Placeholder scene
// until the environment system (T7-T10) replaces the inline contents.
import { GameCanvas } from "@/game/engine/GameCanvas";

export default function GameShell() {
  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        <color attach="background" args={["#bfe3f2"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 30, 10]} intensity={1.4} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshToonMaterial color="#7ec850" />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshToonMaterial color="#f472b6" />
        </mesh>
      </GameCanvas>
    </div>
  );
}
```

- [ ] **Step 4: Add the route in `src/App.tsx`**

Add below the `PerfProbe` lazy import (line ~9):

```tsx
// `?game` mounts the new campus game shell (M0) — developed alongside the
// current world until M1 swaps it in as the primary view.
const GameShell = lazy(() => import("@/game/app/GameShell"));
```

Add inside `App()` directly before `if (search.has("perf"))`:

```tsx
if (search.has("game")) {
  return (
    <Suspense fallback={null}>
      <GameShell />
    </Suspense>
  );
}
```

- [ ] **Step 5: Verify it boots**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run
pnpm dev &
sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:1420/?game
```

Expected: typecheck clean, existing tests pass, HTTP 200. Open `http://localhost:1420/?game` in a browser: sky-blue background, green toon plane, pink box with shadow. Kill the dev server after.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/game src/App.tsx
git commit -m "feat(game): M0 scaffold — GameCanvas + GameShell behind ?game route"
```

---

### Task 2: Asset fetch script (CC0 kits → `assets-src/`)

**Files:**

- Create: `scripts/assets/fetch-kits.mjs`
- Modify: `.gitignore` (add `assets-src/`)
- Modify: `package.json` (script `assets:fetch`)

**Interfaces:**

- Produces: `assets-src/nature-kit/Models/GLTF format/*.glb` (329 models) and `assets-src/fantasy-town-kit/Models/GLB format/*.glb` (167 models). Verified 2026-07-02: kenney.nl pages embed a direct zip URL matching `https://kenney\.nl/media/pages/assets/[^"]+\.zip` (the hash segment changes per release — always scrape, never hardcode).

- [ ] **Step 1: Write `scripts/assets/fetch-kits.mjs`**

```js
#!/usr/bin/env node
// Downloads the CC0 Kenney kits the game is built from into assets-src/
// (gitignored). kenney.nl pages embed a direct zip link; the hash segment
// changes per release, so we scrape it fresh each run. Idempotent: a kit
// directory that already exists is skipped.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const KITS = [
  { slug: "nature-kit", page: "https://kenney.nl/assets/nature-kit" },
  { slug: "fantasy-town-kit", page: "https://kenney.nl/assets/fantasy-town-kit" },
];

const ROOT = path.resolve(import.meta.dirname, "../..");
const DEST = path.join(ROOT, "assets-src");
mkdirSync(DEST, { recursive: true });

for (const kit of KITS) {
  const dir = path.join(DEST, kit.slug);
  if (existsSync(dir)) {
    console.log(`✓ ${kit.slug} already present — skipping`);
    continue;
  }
  console.log(`↓ ${kit.slug}: scraping ${kit.page}`);
  const html = await (await fetch(kit.page)).text();
  const m = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"]+\.zip/);
  if (!m) {
    console.error(`✗ ${kit.slug}: no zip link found on ${kit.page} — download manually into ${dir}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`↓ ${kit.slug}: ${m[0]}`);
  const zip = Buffer.from(await (await fetch(m[0])).arrayBuffer());
  const zipPath = path.join(DEST, `${kit.slug}.zip`);
  writeFileSync(zipPath, zip);
  execSync(`unzip -o -q "${zipPath}" -d "${dir}"`, { stdio: "inherit" });
  rmSync(zipPath);
  console.log(`✓ ${kit.slug} ready`);
}
```

- [ ] **Step 2: Add `assets-src/` to `.gitignore` and the npm script**

`.gitignore`: append a line `assets-src/`.
`package.json` scripts: add `"assets:fetch": "node scripts/assets/fetch-kits.mjs"`.

- [ ] **Step 3: Run it and verify**

```bash
pnpm assets:fetch
ls "assets-src/nature-kit/Models/GLTF format" | wc -l
ls "assets-src/fantasy-town-kit/Models/GLB format" | wc -l
```

Expected: ~329 and ~167 files. (Note the differing subdir names — "GLTF format" vs "GLB format" — Task 3 handles both.)

- [ ] **Step 4: Commit**

```bash
git add scripts/assets/fetch-kits.mjs .gitignore package.json
git commit -m "feat(game): asset fetch script — CC0 Kenney kits into assets-src/"
```

---

### Task 3: Asset manifest + build pipeline (→ `public/assets/models/`)

**Files:**

- Create: `src/game/assets/manifest.json`
- Create: `src/game/assets/manifest.ts`
- Create: `src/game/assets/manifest.test.ts`
- Create: `scripts/assets/build-assets.mjs`
- Modify: `package.json` (script `assets:build`)

**Interfaces:**

- Consumes: `assets-src/` from Task 2.
- Produces: `public/assets/models/<id>.glb` (committed, meshopt-compressed); `ModelId` union type; `MODEL_IDS: ModelId[]`; `modelUrl(id: ModelId): string` returning `/assets/models/<id>.glb`.

- [ ] **Step 1: Write `src/game/assets/manifest.json`**

Every file below was verified present in the kits on 2026-07-02:

```json
{
  "models": {
    "tree-default": { "kit": "nature-kit", "file": "tree_default.glb" },
    "tree-oak": { "kit": "nature-kit", "file": "tree_oak.glb" },
    "tree-detailed": { "kit": "nature-kit", "file": "tree_detailed.glb" },
    "tree-fat": { "kit": "nature-kit", "file": "tree_fat.glb" },
    "tree-pine": { "kit": "nature-kit", "file": "tree_pineTallA.glb" },
    "rock-large": { "kit": "nature-kit", "file": "rock_largeA.glb" },
    "rock-small": { "kit": "nature-kit", "file": "rock_smallA.glb" },
    "path-stone": { "kit": "nature-kit", "file": "path_stone.glb" },
    "path-circle": { "kit": "nature-kit", "file": "path_stoneCircle.glb" },
    "flower-red": { "kit": "nature-kit", "file": "flower_redA.glb" },
    "flower-yellow": { "kit": "nature-kit", "file": "flower_yellowA.glb" },
    "flower-purple": { "kit": "nature-kit", "file": "flower_purpleA.glb" },
    "bush": { "kit": "nature-kit", "file": "plant_bushDetailed.glb" },
    "grass-tuft": { "kit": "nature-kit", "file": "grass_leafs.glb" },
    "fountain": { "kit": "fantasy-town-kit", "file": "fountain-round-detail.glb" },
    "lantern": { "kit": "fantasy-town-kit", "file": "lantern.glb" },
    "bench": { "kit": "fantasy-town-kit", "file": "stall-bench.glb" },
    "hedge": { "kit": "fantasy-town-kit", "file": "hedge.glb" },
    "banner-green": { "kit": "fantasy-town-kit", "file": "banner-green.glb" }
  }
}
```

- [ ] **Step 2: Write the failing test `src/game/assets/manifest.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { MODEL_IDS, modelUrl } from "./manifest";

describe("asset manifest", () => {
  it("exposes every manifest entry as a typed id", () => {
    expect(MODEL_IDS.length).toBeGreaterThanOrEqual(19);
    expect(MODEL_IDS).toContain("fountain");
    expect(MODEL_IDS).toContain("tree-default");
  });

  it("builds public urls", () => {
    expect(modelUrl("fountain")).toBe("/assets/models/fountain.glb");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

`pnpm exec vitest run src/game/assets/manifest.test.ts` → FAIL (module not found).

- [ ] **Step 4: Write `src/game/assets/manifest.ts`**

```ts
// Logical asset ids → built files (M0 T3). The JSON is the single source of
// truth shared with scripts/assets/build-assets.mjs; this module is the typed
// face the app imports.
import raw from "./manifest.json";

export type ModelId = keyof (typeof raw)["models"];

export const MODEL_IDS = Object.keys(raw.models) as ModelId[];

export function modelUrl(id: ModelId): string {
  return `/assets/models/${id}.glb`;
}
```

- [ ] **Step 5: Run to verify it passes**

`pnpm exec vitest run src/game/assets/manifest.test.ts` → PASS. (If TS complains about JSON imports, `tsconfig.json` already has `resolveJsonModule` via vite defaults; if not, add `"resolveJsonModule": true` to compilerOptions.)

- [ ] **Step 6: Write `scripts/assets/build-assets.mjs`**

```js
#!/usr/bin/env node
// Optimizes manifest-listed kit models into public/assets/models/ (committed).
// gltf-transform optimize: prune + dedup + quantize + meshopt compression —
// tiny files, decoded natively by drei's useGLTF.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "assets-src");
const OUT = path.join(ROOT, "public/assets/models");
// Kenney zips name the glTF-binary folder inconsistently across kits.
const MODEL_DIRS = ["Models/GLTF format", "Models/GLB format"];

const manifest = JSON.parse(await readFile(path.join(ROOT, "src/game/assets/manifest.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

let failed = false;
for (const [id, { kit, file }] of Object.entries(manifest.models)) {
  const src = MODEL_DIRS.map((d) => path.join(SRC, kit, d, file)).find(existsSync);
  if (!src) {
    console.error(`✗ ${id}: ${file} not found in ${kit} — run \`pnpm assets:fetch\` first`);
    failed = true;
    continue;
  }
  const out = path.join(OUT, `${id}.glb`);
  execSync(`pnpm exec gltf-transform optimize "${src}" "${out}" --compress meshopt`, { stdio: "pipe" });
  console.log(`✓ ${id}.glb`);
}
if (failed) process.exit(1);
```

Add to `package.json` scripts: `"assets:build": "node scripts/assets/build-assets.mjs"`.

- [ ] **Step 7: Run the pipeline and verify output**

```bash
pnpm assets:build
ls -la public/assets/models/ | head -25
du -sh public/assets/models/
```

Expected: 19 `.glb` files, total well under 1 MB.

- [ ] **Step 8: Commit (built assets included, plus CC0 attribution)**

Create `public/assets/models/LICENSE.txt`:

```
Models in this directory are optimized builds of CC0 asset packs by Kenney (kenney.nl):
- Nature Kit — https://kenney.nl/assets/nature-kit
- Fantasy Town Kit — https://kenney.nl/assets/fantasy-town-kit
License: Creative Commons Zero (CC0). Attribution appreciated, not required.
```

```bash
git add src/game/assets scripts/assets/build-assets.mjs package.json public/assets
git commit -m "feat(game): asset manifest + gltf-transform build pipeline (19 CC0 models)"
```

---

### Task 4: Toon utilities + model loader

**Files:**

- Create: `src/game/engine/toon.ts`
- Create: `src/game/engine/toon.test.ts`
- Create: `src/game/assets/use-model.ts`
- Create: `src/game/assets/collect-meshes.ts`
- Create: `src/game/assets/collect-meshes.test.ts`

**Interfaces:**

- Consumes: `modelUrl` from Task 3.
- Produces: `toonGradientMap(): THREE.DataTexture`; `toonify(root: THREE.Object3D): void` (in-place material swap + shadow flags); `useModel(id: ModelId): THREE.Group` (suspense hook, cloned + toonified); `preloadModels(): void`; `collectMeshes(root: THREE.Object3D): THREE.Mesh[]` (world-transform-baked mesh clones for instancing).

- [ ] **Step 1: Write `src/game/engine/toon.ts`**

```ts
// Toon shading core (M0 T4). Same 3-step gradient trick as the old world
// (src/panels/world/lib/toon.ts) — new copy because src/game must not import
// from src/panels (it gets deleted in M4).
import * as THREE from "three";

let cached: THREE.DataTexture | null = null;

/** The shared 3-step toon gradient (shadow / mid / lit). */
export function toonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  const steps = [110, 190, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

/**
 * Restyle an imported kit model in place: every mesh gets a MeshToonMaterial
 * carrying over the source color/map/vertexColors, plus shadow flags. This is
 * what makes 19 models from 2 different packs read as ONE art style.
 */
export function toonify(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color("#ffffff"),
        map: src.map ?? null,
        vertexColors: src.vertexColors ?? false,
        gradientMap: toonGradientMap(),
      });
      toon.name = m.name;
      return toon;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
  });
}
```

- [ ] **Step 2: Write the failing test `src/game/engine/toon.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toonGradientMap, toonify } from "./toon";

describe("toonGradientMap", () => {
  it("caches one 3-step texture", () => {
    const a = toonGradientMap();
    expect(a).toBe(toonGradientMap());
    expect(a.image.width).toBe(3);
  });
});

describe("toonify", () => {
  it("swaps every material for toon, keeping color, and sets shadow flags", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#ff8800" }),
    );
    const child = new THREE.Mesh(new THREE.SphereGeometry(), [
      new THREE.MeshStandardMaterial({ color: "#00ff88" }),
      new THREE.MeshStandardMaterial({ color: "#0088ff" }),
    ]);
    mesh.add(child);
    group.add(mesh);

    toonify(group);

    expect(mesh.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect((mesh.material as THREE.MeshToonMaterial).color.getHexString()).toBe("ff8800");
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    const mats = child.material as THREE.MeshToonMaterial[];
    expect(mats).toHaveLength(2);
    expect(mats[0]).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(mats[1].color.getHexString()).toBe("0088ff");
  });
});
```

- [ ] **Step 3: Run → FAIL, then it should PASS immediately** (implementation written in Step 1; the failing run just validates the test wiring)

```bash
pnpm exec vitest run src/game/engine/toon.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 4: Write `src/game/assets/collect-meshes.ts` + failing test**

```ts
// Instancing prep (M0 T4): flatten a kit model into standalone meshes whose
// geometry has the model-local transform baked in. drei's <Merged> can then
// instance each sub-mesh (trunk, leaves, …) once per placement.
import * as THREE from "three";

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = (obj.geometry as THREE.BufferGeometry).clone();
    geometry.applyMatrix4(obj.matrixWorld);
    const mesh = new THREE.Mesh(geometry, obj.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.push(mesh);
  });
  return out;
}
```

`src/game/assets/collect-meshes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { collectMeshes } from "./collect-meshes";

describe("collectMeshes", () => {
  it("bakes nested transforms into cloned geometry", () => {
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.position.set(0, 2, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial());
    holder.add(mesh);
    root.add(holder);

    const meshes = collectMeshes(root);

    expect(meshes).toHaveLength(1);
    meshes[0].geometry.computeBoundingBox();
    // The 1×1×1 box sat at y=2 — baked geometry must span y ∈ [1.5, 2.5].
    expect(meshes[0].geometry.boundingBox!.min.y).toBeCloseTo(1.5);
    expect(meshes[0].geometry.boundingBox!.max.y).toBeCloseTo(2.5);
    // Original geometry untouched.
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 5: Run to verify**

`pnpm exec vitest run src/game/assets/collect-meshes.test.ts` → PASS.

- [ ] **Step 6: Write `src/game/assets/use-model.ts`** (no unit test — thin drei wrapper, covered by the T10 scene smoke)

```ts
// Model loading (M0 T4): drei useGLTF (meshopt decoding built in) + clone +
// toonify. Each call site gets its own clone — materials are shared via the
// cached gradient map, geometry via the GLTF cache.
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import { toonify } from "@/game/engine/toon";
import { MODEL_IDS, modelUrl, type ModelId } from "./manifest";

export function useModel(id: ModelId): THREE.Group {
  const gltf = useGLTF(modelUrl(id));
  return useMemo(() => {
    const scene = gltf.scene.clone(true) as THREE.Group;
    toonify(scene);
    return scene;
  }, [gltf.scene]);
}

/** Kick off background loads for everything in the manifest. */
export function preloadModels(): void {
  for (const id of MODEL_IDS) useGLTF.preload(modelUrl(id));
}
```

- [ ] **Step 7: Typecheck + full test run + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run src/game
git add src/game/engine/toon.ts src/game/engine/toon.test.ts src/game/assets
git commit -m "feat(game): toon restyling + model loader + instancing prep"
```

---

### Task 5: Quality tiers

**Files:**

- Create: `src/game/engine/quality.ts`
- Create: `src/game/engine/quality.test.ts`

**Interfaces:**

- Produces: `type QualityTier = "low" | "medium" | "high"`; `interface QualityConfig { dprMax: number; shadowMapSize: number; ssao: boolean; multisampling: 0 | 2 | 4 }`; `QUALITY: Record<QualityTier, QualityConfig>`; `detectQuality(caps: { cores: number; dpr: number }): QualityTier`; zustand store `useQuality` with `{ tier, init(), setTier(t) }` persisted to settings key `game.quality`.

- [ ] **Step 1: Write the failing test `src/game/engine/quality.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { QUALITY, detectQuality, resetQualityForTests, useQuality } from "./quality";

describe("detectQuality", () => {
  it("maps hardware to tiers", () => {
    expect(detectQuality({ cores: 4, dpr: 1 })).toBe("low");
    expect(detectQuality({ cores: 8, dpr: 2 })).toBe("high");
    expect(detectQuality({ cores: 6, dpr: 1.5 })).toBe("medium");
  });
});

describe("QUALITY table", () => {
  it("scales monotonically", () => {
    expect(QUALITY.low.shadowMapSize).toBeLessThan(QUALITY.high.shadowMapSize);
    expect(QUALITY.low.ssao).toBe(false);
    expect(QUALITY.high.ssao).toBe(true);
  });
});

describe("useQuality store", () => {
  beforeEach(() => resetQualityForTests());

  it("loads a persisted tier", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "low" } as never);
    await useQuality.getState().init();
    expect(useQuality.getState().tier).toBe("low");
  });

  it("ignores junk in the KV", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "ultra" } as never);
    await useQuality.getState().init();
    expect(["low", "medium", "high"]).toContain(useQuality.getState().tier);
  });

  it("persists on setTier", () => {
    useQuality.getState().setTier("high");
    expect(useQuality.getState().tier).toBe("high");
    expect(commands.setSetting).toHaveBeenCalledWith("game.quality", "high");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`pnpm exec vitest run src/game/engine/quality.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/game/engine/quality.ts`**

```ts
// Quality tiers (M0 T5): one knob that fans out to dpr, shadow resolution and
// post effects. Persisted best-effort in the settings KV (the environment
// store pattern — src/panels/world/environments/store.ts).
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const QUALITY_SETTING_KEY = "game.quality";

export type QualityTier = "low" | "medium" | "high";

export interface QualityConfig {
  dprMax: number;
  shadowMapSize: number;
  ssao: boolean;
  multisampling: 0 | 2 | 4;
}

export const QUALITY: Record<QualityTier, QualityConfig> = {
  low: { dprMax: 1, shadowMapSize: 1024, ssao: false, multisampling: 0 },
  medium: { dprMax: 1.5, shadowMapSize: 2048, ssao: true, multisampling: 2 },
  high: { dprMax: 2, shadowMapSize: 4096, ssao: true, multisampling: 4 },
};

const TIERS: QualityTier[] = ["low", "medium", "high"];

/** Pure heuristic — cores and pixel density are the two cheap signals. */
export function detectQuality(caps: { cores: number; dpr: number }): QualityTier {
  if (caps.cores >= 8 && caps.dpr >= 1.5) return "high";
  if (caps.cores <= 4) return "low";
  return "medium";
}

interface QualityState {
  tier: QualityTier;
  init: () => Promise<void>;
  setTier: (tier: QualityTier) => void;
}

let requested = false;

export const useQuality = create<QualityState>((set) => ({
  tier: detectQuality({
    cores: typeof navigator === "undefined" ? 8 : (navigator.hardwareConcurrency ?? 8),
    dpr: typeof window === "undefined" ? 1.5 : window.devicePixelRatio,
  }),

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(QUALITY_SETTING_KEY);
      if (res.status === "ok" && res.data && TIERS.includes(res.data as QualityTier)) {
        set({ tier: res.data as QualityTier });
      }
    } catch {
      // backend unavailable (unit tests, plain browser) — keep the detection
    }
  },

  setTier: (tier) => {
    set({ tier });
    void commands.setSetting(QUALITY_SETTING_KEY, tier).catch(() => undefined);
  },
}));

/** Test hook: rerun init after a reset. */
export function resetQualityForTests(): void {
  requested = false;
  useQuality.setState({ tier: "medium" });
}
```

- [ ] **Step 4: Run to verify it passes**

`pnpm exec vitest run src/game/engine/quality.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/engine/quality.ts src/game/engine/quality.test.ts
git commit -m "feat(game): quality tiers — detection, table, persisted store"
```

---

### Task 6: RTS game camera (pure math + rig)

**Files:**

- Create: `src/game/engine/camera/rts-camera.ts`
- Create: `src/game/engine/camera/rts-camera.test.ts`
- Create: `src/game/engine/camera/GameCameraRig.tsx`

**Interfaces:**

- Produces (pure): `interface RtsCamera { targetX: number; targetZ: number; yaw: number; distance: number }`; `interface RtsBounds { half: number; minDistance: number; maxDistance: number }`; `DEFAULT_CAMERA: RtsCamera`; `pan(cam, dx, dy, bounds): RtsCamera` (screen-space drag deltas, camera-relative, distance-scaled); `rotate(cam, dYaw): RtsCamera`; `zoom(cam, wheelDelta, bounds): RtsCamera` (exponential); `pose(cam): { position: [number, number, number]; lookAt: [number, number, number] }` (fixed pitch); `damp(from, to, rate, dt): RtsCamera`.
- Produces (component): `GameCameraRig({ bounds }: { bounds: RtsBounds })` — wires pointer drag (left = pan, right = rotate), wheel zoom, WASD/arrows pan, Q/E rotate, edge scrolling.

- [ ] **Step 1: Write the failing test `src/game/engine/camera/rts-camera.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, damp, pan, pose, rotate, zoom, type RtsBounds } from "./rts-camera";

const B: RtsBounds = { half: 40, minDistance: 8, maxDistance: 60 };

describe("pan", () => {
  it("moves the target opposite the drag, scaled by distance", () => {
    const near = pan({ ...DEFAULT_CAMERA, distance: 10 }, 100, 0, B);
    const far = pan({ ...DEFAULT_CAMERA, distance: 40 }, 100, 0, B);
    expect(Math.abs(far.targetX - DEFAULT_CAMERA.targetX)).toBeGreaterThan(
      Math.abs(near.targetX - DEFAULT_CAMERA.targetX),
    );
  });

  it("is camera-relative: after a 180° turn the same drag goes the other way", () => {
    const a = pan(DEFAULT_CAMERA, 100, 0, B);
    const turned = rotate(DEFAULT_CAMERA, Math.PI);
    const b = pan(turned, 100, 0, B);
    expect(Math.sign(b.targetX - turned.targetX)).toBe(-Math.sign(a.targetX - DEFAULT_CAMERA.targetX));
  });

  it("clamps the target to bounds", () => {
    let cam = DEFAULT_CAMERA;
    for (let i = 0; i < 100; i++) cam = pan(cam, -10000, 0, B);
    expect(Math.abs(cam.targetX)).toBeLessThanOrEqual(B.half);
    expect(Math.abs(cam.targetZ)).toBeLessThanOrEqual(B.half);
  });
});

describe("zoom", () => {
  it("is exponential and clamped", () => {
    const inn = zoom(DEFAULT_CAMERA, -300, B);
    expect(inn.distance).toBeLessThan(DEFAULT_CAMERA.distance);
    let cam = DEFAULT_CAMERA;
    for (let i = 0; i < 50; i++) cam = zoom(cam, 500, B);
    expect(cam.distance).toBe(B.maxDistance);
    for (let i = 0; i < 100; i++) cam = zoom(cam, -500, B);
    expect(cam.distance).toBe(B.minDistance);
  });
});

describe("pose", () => {
  it("keeps the camera above the target looking at it", () => {
    const p = pose({ targetX: 5, targetZ: -3, yaw: 0.7, distance: 20 });
    expect(p.lookAt).toEqual([5, 0, -3]);
    expect(p.position[1]).toBeGreaterThan(5); // fixed pitch keeps real height
    const dx = p.position[0] - 5;
    const dz = p.position[2] + 3;
    expect(Math.hypot(dx, p.position[1], dz)).toBeCloseTo(20, 5);
  });
});

describe("damp", () => {
  it("converges toward the goal without overshooting", () => {
    const goal = { targetX: 10, targetZ: 0, yaw: 1, distance: 30 };
    let cur = DEFAULT_CAMERA;
    for (let i = 0; i < 240; i++) cur = damp(cur, goal, 8, 1 / 60);
    expect(cur.targetX).toBeCloseTo(10, 1);
    expect(cur.yaw).toBeCloseTo(1, 1);
    expect(cur.distance).toBeCloseTo(30, 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`pnpm exec vitest run src/game/engine/camera/rts-camera.test.ts` → FAIL.

- [ ] **Step 3: Write `src/game/engine/camera/rts-camera.ts`**

```ts
// RTS camera math (M0 T6) — pure, three.js-free, fully tested. Two Point
// style: fixed pitch, yaw orbit, distance zoom, target pans on the ground
// plane. The rig component owns input + damping; this module owns truth.

export interface RtsCamera {
  targetX: number;
  targetZ: number;
  /** Radians around Y. 0 = camera south of target looking north. */
  yaw: number;
  distance: number;
}

export interface RtsBounds {
  /** Target may roam ±half on both axes. */
  half: number;
  minDistance: number;
  maxDistance: number;
}

/** Fixed camera elevation angle — the Two Point diorama tilt. */
export const PITCH = 0.85;
const PAN_SPEED = 0.0016; // world units per px per unit distance
const ZOOM_SPEED = 0.0016;

export const DEFAULT_CAMERA: RtsCamera = { targetX: 0, targetZ: 0, yaw: 0.6, distance: 34 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function pan(cam: RtsCamera, dxPx: number, dyPx: number, bounds: RtsBounds): RtsCamera {
  const s = cam.distance * PAN_SPEED;
  // Screen right = camera-right on the ground; screen up = camera-forward.
  const rightX = Math.cos(cam.yaw);
  const rightZ = -Math.sin(cam.yaw);
  const fwdX = -Math.sin(cam.yaw);
  const fwdZ = -Math.cos(cam.yaw);
  return {
    ...cam,
    targetX: clamp(cam.targetX - (dxPx * rightX + -dyPx * fwdX) * s, -bounds.half, bounds.half),
    targetZ: clamp(cam.targetZ - (dxPx * rightZ + -dyPx * fwdZ) * s, -bounds.half, bounds.half),
  };
}

export function rotate(cam: RtsCamera, dYaw: number): RtsCamera {
  return { ...cam, yaw: cam.yaw + dYaw };
}

export function zoom(cam: RtsCamera, wheelDelta: number, bounds: RtsBounds): RtsCamera {
  return {
    ...cam,
    distance: clamp(cam.distance * Math.exp(wheelDelta * ZOOM_SPEED), bounds.minDistance, bounds.maxDistance),
  };
}

export function pose(cam: RtsCamera): {
  position: [number, number, number];
  lookAt: [number, number, number];
} {
  const r = cam.distance * Math.cos(PITCH);
  const h = cam.distance * Math.sin(PITCH);
  return {
    position: [cam.targetX + r * Math.sin(cam.yaw), h, cam.targetZ + r * Math.cos(cam.yaw)],
    lookAt: [cam.targetX, 0, cam.targetZ],
  };
}

/** Exponential approach — frame-rate independent smoothing. */
export function damp(from: RtsCamera, to: RtsCamera, rate: number, dt: number): RtsCamera {
  const k = 1 - Math.exp(-rate * dt);
  return {
    targetX: from.targetX + (to.targetX - from.targetX) * k,
    targetZ: from.targetZ + (to.targetZ - from.targetZ) * k,
    yaw: from.yaw + (to.yaw - from.yaw) * k,
    distance: from.distance + (to.distance - from.distance) * k,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

`pnpm exec vitest run src/game/engine/camera/rts-camera.test.ts` → PASS. If the camera-relative pan sign test fails, flip the sign convention in `pan` (not in the test): the invariant is "drag right → world slides right → target moves left in camera space".

- [ ] **Step 5: Write `src/game/engine/camera/GameCameraRig.tsx`** (input wiring — no unit test; verified live and by the T10 smoke mounting it)

```tsx
// Camera rig (M0 T6): input → goal state → damped actual state → camera.
// Left-drag pans, right-drag rotates, wheel zooms, WASD/arrows pan, Q/E
// rotate, pointer at viewport edges scrolls (the RTS staple).
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DEFAULT_CAMERA, damp, pan, pose, rotate, zoom, type RtsBounds, type RtsCamera } from "./rts-camera";

const KEY_PAN_PX = 640; // px-equivalent per second held
const KEY_ROT = 1.9; // rad per second
const EDGE_PX = 14;
const EDGE_PAN_PX = 480;
const DAMP_RATE = 9;

export function GameCameraRig({ bounds }: { bounds: RtsBounds }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const goal = useRef<RtsCamera>({ ...DEFAULT_CAMERA });
  const current = useRef<RtsCamera>({ ...DEFAULT_CAMERA });
  const keys = useRef(new Set<string>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ button: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) {
        drag.current = { button: e.button, x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
      goal.current =
        drag.current.button === 0 ? pan(goal.current, dx, dy, bounds) : rotate(goal.current, dx * 0.005);
    };
    const up = () => (drag.current = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      goal.current = zoom(goal.current, e.deltaY, bounds);
    };
    const ctx = (e: Event) => e.preventDefault();
    const keydown = (e: KeyboardEvent) => keys.current.add(e.code);
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const leave = () => (pointer.current = null);

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", ctx);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", ctx);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl, bounds]);

  useFrame((_, dt) => {
    const k = keys.current;
    const px = KEY_PAN_PX * dt;
    let dx = 0;
    let dy = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) dy += px;
    if (k.has("KeyS") || k.has("ArrowDown")) dy -= px;
    if (k.has("KeyA") || k.has("ArrowLeft")) dx += px;
    if (k.has("KeyD") || k.has("ArrowRight")) dx -= px;
    if (k.has("KeyQ")) goal.current = rotate(goal.current, -KEY_ROT * dt);
    if (k.has("KeyE")) goal.current = rotate(goal.current, KEY_ROT * dt);

    // Edge scroll only while the pointer is over the canvas and not dragging.
    const p = pointer.current;
    if (p && !drag.current && document.hasFocus()) {
      const r = gl.domElement.getBoundingClientRect();
      const e = EDGE_PAN_PX * dt;
      if (p.x - r.left < EDGE_PX) dx += e;
      if (r.right - p.x < EDGE_PX) dx -= e;
      if (p.y - r.top < EDGE_PX) dy += e;
      if (r.bottom - p.y < EDGE_PX) dy -= e;
    }
    if (dx !== 0 || dy !== 0) goal.current = pan(goal.current, dx, dy, bounds);

    current.current = damp(current.current, goal.current, DAMP_RATE, dt);
    const { position, lookAt } = pose(current.current);
    camera.position.set(...position);
    camera.lookAt(...lookAt);
  });

  return null;
}
```

- [ ] **Step 6: Wire into `GameShell` and verify live**

In `src/game/app/GameShell.tsx`, add inside `<GameCanvas>`:

```tsx
<GameCameraRig bounds={{ half: 40, minDistance: 8, maxDistance: 60 }} />
```

(import from `@/game/engine/camera/GameCameraRig`). Run `pnpm dev`, open `?game`: left-drag pans, right-drag orbits, wheel zooms with limits, WASD/QE work, pointer at the window edge scrolls. Kill server.

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run src/game
git add src/game/engine/camera src/game/app/GameShell.tsx
git commit -m "feat(game): RTS camera — pure math core + input rig"
```

---

### Task 7: Environment system (types, registry, store)

**Files:**

- Create: `src/game/world/environments/types.ts`
- Create: `src/game/world/environments/registry.tsx`
- Create: `src/game/world/environments/registry.test.tsx`
- Create: `src/game/world/environments/store.ts`
- Create: `src/game/world/environments/store.test.ts`

**Interfaces:**

- Produces: `interface GameEnvironment { id: string; name: string; emoji: string; sky: string; fog: { color: string; near: number; far: number }; ambient: { color: string; intensity: number }; hemisphere: { sky: string; ground: string; intensity: number }; sun: { position: [number, number, number]; color: string; intensity: number }; World: ComponentType }` — `World` renders terrain + decor + centerpieces (everything except lights/camera/effects); `ENVIRONMENTS: GameEnvironment[]`; `environmentById(id: string): GameEnvironment` (unknown → campus); `useGameEnvironment` store `{ id, init(), setEnvironment(id) }` persisted to the existing `world.environment` key, default `"campus"`.
- Consumes (forward): Task 10 provides `CampusWorld`; until then the registry uses a placeholder `World` that renders the T1 plane+box (replaced in T10).

- [ ] **Step 1: Write the failing tests**

`src/game/world/environments/registry.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { ENVIRONMENTS, environmentById } from "./registry";

describe("environment registry", () => {
  it("ships campus as the first environment", () => {
    expect(ENVIRONMENTS.map((e) => e.id)).toContain("campus");
  });

  it("falls back to campus for unknown ids", () => {
    expect(environmentById("desert-from-the-old-world").id).toBe("campus");
    expect(environmentById("campus").id).toBe("campus");
  });
});
```

`src/game/world/environments/store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { resetGameEnvironmentForTests, useGameEnvironment } from "./store";

describe("useGameEnvironment", () => {
  beforeEach(() => resetGameEnvironmentForTests());

  it("defaults to campus", () => {
    expect(useGameEnvironment.getState().id).toBe("campus");
  });

  it("loads a persisted id", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "sky" } as never);
    await useGameEnvironment.getState().init();
    expect(useGameEnvironment.getState().id).toBe("sky");
  });

  it("persists on change", () => {
    useGameEnvironment.getState().setEnvironment("campus");
    expect(commands.setSetting).toHaveBeenCalledWith("world.environment", "campus");
  });
});
```

- [ ] **Step 2: Run to verify both fail**

`pnpm exec vitest run src/game/world/environments` → FAIL (modules not found).

- [ ] **Step 3: Write `types.ts`, `registry.tsx`, `store.ts`**

`types.ts`:

```ts
import type { ComponentType } from "react";

/**
 * An environment owns everything AROUND the buildings (spec §Visual
 * direction): sky, fog, lighting rig, and the World component that renders
 * terrain + decor + centerpieces. Buildings, rooms and robots are identical
 * across environments.
 */
export interface GameEnvironment {
  id: string;
  name: string;
  emoji: string;
  sky: string;
  fog: { color: string; near: number; far: number };
  ambient: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; color: string; intensity: number };
  World: ComponentType;
}
```

`registry.tsx`:

```tsx
// Environment registry (M0 T7). Campus ships in M0; Desert/Island/Sky land in
// M4 as new entries here — nothing else changes.
import type { GameEnvironment } from "./types";

// Placeholder until T10 wires CampusWorld — keeps the registry testable now.
function PlaceholderWorld() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[80, 80]} />
      <meshToonMaterial color="#7ec850" />
    </mesh>
  );
}

const campus: GameEnvironment = {
  id: "campus",
  name: "Campus",
  emoji: "🏫",
  sky: "#aee2f7",
  fog: { color: "#c9ecf9", near: 60, far: 160 },
  ambient: { color: "#ffffff", intensity: 0.55 },
  hemisphere: { sky: "#bfe6ff", ground: "#9ed98a", intensity: 0.5 },
  sun: { position: [28, 42, 18], color: "#fff3d6", intensity: 2.6 },
  World: PlaceholderWorld,
};

export const ENVIRONMENTS: GameEnvironment[] = [campus];

export function environmentById(id: string): GameEnvironment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? campus;
}
```

`store.ts`:

```ts
// Environment selection (M0 T7): the old world's store pattern, same settings
// key (`world.environment`) so the choice carries across the rebuild. Unknown
// ids (old biomes before their M4 ports) fall back at lookup time.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const ENVIRONMENT_SETTING_KEY = "world.environment";
export const DEFAULT_GAME_ENVIRONMENT = "campus";

interface GameEnvironmentState {
  id: string;
  init: () => Promise<void>;
  setEnvironment: (id: string) => void;
}

let requested = false;

export const useGameEnvironment = create<GameEnvironmentState>((set) => ({
  id: DEFAULT_GAME_ENVIRONMENT,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(ENVIRONMENT_SETTING_KEY);
      if (res.status === "ok" && res.data) set({ id: res.data });
    } catch {
      // backend unavailable (unit tests, plain browser) — keep the default
    }
  },

  setEnvironment: (id) => {
    set({ id });
    void commands.setSetting(ENVIRONMENT_SETTING_KEY, id).catch(() => undefined);
  },
}));

/** Test hook: rerun init after a reset. */
export function resetGameEnvironmentForTests(): void {
  requested = false;
  useGameEnvironment.setState({ id: DEFAULT_GAME_ENVIRONMENT });
}
```

- [ ] **Step 4: Run to verify green, commit**

```bash
pnpm exec vitest run src/game/world/environments && pnpm exec tsc --noEmit
git add src/game/world/environments
git commit -m "feat(game): environment system — registry + persisted selection, campus first"
```

---

### Task 8: Campus layout (pure, seeded)

**Files:**

- Create: `src/game/world/campus/layout.ts`
- Create: `src/game/world/campus/layout.test.ts`

**Interfaces:**

- Produces: `const CAMPUS = { half: 40, plazaRadius: 7, pathHalfWidth: 1.1 }`; `interface Placement { x: number; z: number; rot: number; scale: number }`; `interface Rect { x: number; z: number; w: number; d: number }`; `type ScatterKind = "treeDefault" | "treeOak" | "treeDetailed" | "treeFat" | "treePine" | "rockLarge" | "rockSmall" | "flowerRed" | "flowerYellow" | "flowerPurple" | "bush" | "grassTuft"`; `type PropKind = "lantern" | "bench" | "hedge" | "banner"`; `interface CampusLayout { pathTiles: Placement[]; plots: Rect[]; scatter: Record<ScatterKind, Placement[]>; props: Record<PropKind, Placement[]> }`; `campusLayout(): CampusLayout` (deterministic); helpers `insidePlaza(x, z, margin): boolean`, `nearPath(x, z, margin): boolean`, `insidePlot(x, z, plots, margin): boolean`.

- [ ] **Step 1: Write the failing test `src/game/world/campus/layout.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { CAMPUS, campusLayout, insidePlaza, insidePlot, nearPath } from "./layout";

describe("campusLayout", () => {
  const layout = campusLayout();

  it("is deterministic", () => {
    expect(campusLayout()).toEqual(layout);
  });

  it("lays four path arms plus a plaza ring", () => {
    expect(layout.pathTiles.length).toBeGreaterThan(40);
  });

  it("reserves four building plots clear of paths and plaza", () => {
    expect(layout.plots).toHaveLength(4);
    for (const p of layout.plots) {
      expect(insidePlaza(p.x, p.z, 0)).toBe(false);
      expect(nearPath(p.x, p.z, 0)).toBe(false);
    }
  });

  it("scatters every kind, all inside bounds", () => {
    for (const placements of Object.values(layout.scatter)) {
      expect(placements.length).toBeGreaterThan(0);
      for (const p of placements) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(CAMPUS.half);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(CAMPUS.half);
      }
    }
  });

  it("keeps trees off the plaza, paths and plots", () => {
    const trees = [
      ...layout.scatter.treeDefault,
      ...layout.scatter.treeOak,
      ...layout.scatter.treeDetailed,
      ...layout.scatter.treeFat,
      ...layout.scatter.treePine,
    ];
    expect(trees.length).toBeGreaterThan(30);
    for (const t of trees) {
      expect(insidePlaza(t.x, t.z, 1)).toBe(false);
      expect(nearPath(t.x, t.z, 1)).toBe(false);
      expect(insidePlot(t.x, t.z, layout.plots, 0.5)).toBe(false);
    }
  });

  it("places plaza props: benches face the fountain, lanterns line the paths", () => {
    expect(layout.props.bench).toHaveLength(4);
    expect(layout.props.lantern.length).toBeGreaterThanOrEqual(8);
    expect(layout.props.banner).toHaveLength(4);
    expect(layout.props.hedge.length).toBeGreaterThan(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`pnpm exec vitest run src/game/world/campus/layout.test.ts` → FAIL.

- [ ] **Step 3: Write `src/game/world/campus/layout.ts`**

```ts
// Campus ground truth (M0 T8) — pure, seeded, three.js-free. One quad, a
// plaza at the origin, four path arms to the edges, four building plots
// (M1+ buildings land there), and seeded nature scatter everywhere else.

export const CAMPUS = { half: 40, plazaRadius: 7, pathHalfWidth: 1.1 } as const;

export interface Placement {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type ScatterKind =
  | "treeDefault"
  | "treeOak"
  | "treeDetailed"
  | "treeFat"
  | "treePine"
  | "rockLarge"
  | "rockSmall"
  | "flowerRed"
  | "flowerYellow"
  | "flowerPurple"
  | "bush"
  | "grassTuft";

export type PropKind = "lantern" | "bench" | "hedge" | "banner";

export interface CampusLayout {
  pathTiles: Placement[];
  plots: Rect[];
  scatter: Record<ScatterKind, Placement[]>;
  props: Record<PropKind, Placement[]>;
}

/** mulberry32 — tiny seeded PRNG; the world must render identically forever. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function insidePlaza(x: number, z: number, margin: number): boolean {
  return Math.hypot(x, z) < CAMPUS.plazaRadius + margin;
}

export function nearPath(x: number, z: number, margin: number): boolean {
  const w = CAMPUS.pathHalfWidth + margin;
  return (Math.abs(x) < w && Math.abs(z) < CAMPUS.half) || (Math.abs(z) < w && Math.abs(x) < CAMPUS.half);
}

export function insidePlot(x: number, z: number, plots: Rect[], margin: number): boolean {
  return plots.some((p) => Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin);
}

const SEED = 0x517ec0de;

export function campusLayout(): CampusLayout {
  const rand = rng(SEED);
  const { half, plazaRadius } = CAMPUS;

  // Path arms: stone tiles every 2 units from the plaza edge to the border.
  const pathTiles: Placement[] = [];
  for (let d = plazaRadius + 1; d <= half - 2; d += 2) {
    pathTiles.push({ x: d, z: 0, rot: 0, scale: 2 });
    pathTiles.push({ x: -d, z: 0, rot: 0, scale: 2 });
    pathTiles.push({ x: 0, z: d, rot: Math.PI / 2, scale: 2 });
    pathTiles.push({ x: 0, z: -d, rot: Math.PI / 2, scale: 2 });
  }
  // Plaza ring: tiles laid tangentially around the fountain.
  const RING = 16;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    pathTiles.push({
      x: Math.sin(a) * (plazaRadius - 1),
      z: Math.cos(a) * (plazaRadius - 1),
      rot: a + Math.PI / 2,
      scale: 2,
    });
  }

  // Four building plots on the diagonals — buildings arrive in M1+.
  const plots: Rect[] = [
    { x: 22, z: 22, w: 14, d: 12 },
    { x: -22, z: 22, w: 14, d: 12 },
    { x: 22, z: -22, w: 14, d: 12 },
    { x: -22, z: -22, w: 14, d: 12 },
  ];

  const taken: { x: number; z: number; r: number }[] = [];
  const place = (count: number, minR: number, scaleLo: number, scaleHi: number): Placement[] => {
    const out: Placement[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 60) {
      const x = (rand() * 2 - 1) * (half - 2);
      const z = (rand() * 2 - 1) * (half - 2);
      if (insidePlaza(x, z, 2)) continue;
      if (nearPath(x, z, 1.5)) continue;
      if (insidePlot(x, z, plots, 1)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < Math.max(t.r, minR))) continue;
      taken.push({ x, z, r: minR });
      out.push({ x, z, rot: rand() * Math.PI * 2, scale: scaleLo + rand() * (scaleHi - scaleLo) });
    }
    return out;
  };

  const scatter: Record<ScatterKind, Placement[]> = {
    treeDefault: place(16, 3, 1.6, 2.4),
    treeOak: place(12, 3, 1.6, 2.4),
    treeDetailed: place(10, 3, 1.6, 2.2),
    treeFat: place(8, 3, 1.6, 2.2),
    treePine: place(10, 3, 1.8, 2.6),
    rockLarge: place(8, 2.5, 1.2, 2),
    rockSmall: place(14, 1, 0.8, 1.4),
    flowerRed: place(14, 0.6, 1, 1.6),
    flowerYellow: place(14, 0.6, 1, 1.6),
    flowerPurple: place(14, 0.6, 1, 1.6),
    bush: place(18, 1.6, 1.2, 2),
    grassTuft: place(80, 0.5, 0.9, 1.5),
  };

  // Lanterns flank the four arms every 8 units, alternating sides.
  const lantern: Placement[] = [];
  let side = 1;
  for (let d = plazaRadius + 3; d <= half - 6; d += 8) {
    const off = (CAMPUS.pathHalfWidth + 0.9) * side;
    lantern.push({ x: d, z: off, rot: 0, scale: 1.4 });
    lantern.push({ x: -d, z: -off, rot: 0, scale: 1.4 });
    lantern.push({ x: off, z: d, rot: 0, scale: 1.4 });
    lantern.push({ x: -off, z: -d, rot: 0, scale: 1.4 });
    side = -side;
  }

  // Benches on the plaza diagonals, rotated to face the fountain.
  const bench: Placement[] = [45, 135, 225, 315].map((deg) => {
    const a = (deg / 180) * Math.PI;
    const r = plazaRadius - 2.6;
    return { x: Math.sin(a) * r, z: Math.cos(a) * r, rot: a + Math.PI, scale: 1.3 };
  });

  // Hedge arcs between the plaza exits.
  const hedge: Placement[] = [];
  const HEDGES = 12;
  for (let i = 0; i < HEDGES; i++) {
    const a = (i / HEDGES) * Math.PI * 2 + Math.PI / HEDGES;
    // Skip segments blocking the four path exits (near the axes).
    const nearAxis = Math.abs(Math.sin(a)) < 0.28 || Math.abs(Math.cos(a)) < 0.28;
    if (nearAxis) continue;
    hedge.push({
      x: Math.sin(a) * (plazaRadius + 1.2),
      z: Math.cos(a) * (plazaRadius + 1.2),
      rot: a + Math.PI / 2,
      scale: 1.6,
    });
  }

  // A banner where each path meets the world edge — "welcome to campus".
  const banner: Placement[] = [
    { x: half - 3, z: 1.8, rot: Math.PI / 2, scale: 1.6 },
    { x: -(half - 3), z: -1.8, rot: -Math.PI / 2, scale: 1.6 },
    { x: 1.8, z: half - 3, rot: 0, scale: 1.6 },
    { x: -1.8, z: -(half - 3), rot: Math.PI, scale: 1.6 },
  ];

  return { pathTiles, plots, scatter, props: { lantern, bench, hedge, banner } };
}
```

- [ ] **Step 4: Run to verify it passes**

`pnpm exec vitest run src/game/world/campus/layout.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/world/campus
git commit -m "feat(game): seeded campus layout — plaza, path arms, plots, nature scatter"
```

---

### Task 9: Campus world render (terrain + instanced decor)

**Files:**

- Create: `src/game/world/campus/InstancedModel.tsx`
- Create: `src/game/world/campus/Terrain.tsx`
- Create: `src/game/world/campus/CampusWorld.tsx`
- Create: `src/game/world/campus/campus-world.smoke.test.tsx`
- Modify: `src/game/world/environments/registry.tsx` (campus `World: CampusWorld`, drop the placeholder)

**Interfaces:**

- Consumes: `campusLayout()` (T8), `useModel`/`collectMeshes` (T4), `modelUrl` (T3).
- Produces: `CampusWorld` component (terrain + paths + scatter + plaza props, no lights); `InstancedModel({ id, placements }: { id: ModelId; placements: Placement[] })`.

- [ ] **Step 1: Write `src/game/world/campus/InstancedModel.tsx`**

```tsx
// One draw call per sub-mesh regardless of placement count (M0 T9). drei's
// <Merged> turns each kit sub-mesh (trunk, leaves, …) into an InstancedMesh;
// we stamp the full model once per placement.
import { useMemo } from "react";
import { Merged } from "@react-three/drei";
import type { ComponentType } from "react";
import { collectMeshes } from "@/game/assets/collect-meshes";
import { useModel } from "@/game/assets/use-model";
import type { ModelId } from "@/game/assets/manifest";
import type { Placement } from "./layout";

export function InstancedModel({ id, placements }: { id: ModelId; placements: Placement[] }) {
  const scene = useModel(id);
  const meshes = useMemo(() => collectMeshes(scene), [scene]);
  if (placements.length === 0) return null;
  return (
    <Merged meshes={meshes} castShadow receiveShadow>
      {(...Parts: ComponentType[]) => (
        <>
          {placements.map((p, i) => (
            <group key={i} position={[p.x, 0, p.z]} rotation-y={p.rot} scale={p.scale}>
              {Parts.map((Part, j) => (
                <Part key={j} />
              ))}
            </group>
          ))}
        </>
      )}
    </Merged>
  );
}
```

- [ ] **Step 2: Write `src/game/world/campus/Terrain.tsx`**

```tsx
// The campus ground (M0 T9): one big toon plane, slightly darker apron
// beyond the playable bounds so the world edge reads as designed, not cut.
import { CAMPUS } from "./layout";

const GRASS = "#82c95b";
const APRON = "#6cb14b";

export function Terrain() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[CAMPUS.half * 2 + 80, CAMPUS.half * 2 + 80]} />
        <meshToonMaterial color={APRON} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[CAMPUS.half * 2, CAMPUS.half * 2]} />
        <meshToonMaterial color={GRASS} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 3: Write `src/game/world/campus/CampusWorld.tsx`**

```tsx
// The Campus environment's World (M0 T9/T10): terrain, paths, nature scatter,
// plaza props. Lights live in GameShell (per-environment rig), not here.
import { useMemo } from "react";
import type { ModelId } from "@/game/assets/manifest";
import { InstancedModel } from "./InstancedModel";
import { Terrain } from "./Terrain";
import { campusLayout, type ScatterKind } from "./layout";

const SCATTER_MODEL: Record<ScatterKind, ModelId> = {
  treeDefault: "tree-default",
  treeOak: "tree-oak",
  treeDetailed: "tree-detailed",
  treeFat: "tree-fat",
  treePine: "tree-pine",
  rockLarge: "rock-large",
  rockSmall: "rock-small",
  flowerRed: "flower-red",
  flowerYellow: "flower-yellow",
  flowerPurple: "flower-purple",
  bush: "bush",
  grassTuft: "grass-tuft",
};

export function CampusWorld() {
  const layout = useMemo(() => campusLayout(), []);
  return (
    <group>
      <Terrain />
      <InstancedModel id="path-stone" placements={layout.pathTiles} />
      {(Object.keys(SCATTER_MODEL) as ScatterKind[]).map((kind) => (
        <InstancedModel key={kind} id={SCATTER_MODEL[kind]} placements={layout.scatter[kind]} />
      ))}
      <InstancedModel id="lantern" placements={layout.props.lantern} />
      <InstancedModel id="bench" placements={layout.props.bench} />
      <InstancedModel id="hedge" placements={layout.props.hedge} />
      <InstancedModel id="banner-green" placements={layout.props.banner} />
    </group>
  );
}
```

- [ ] **Step 4: Point the registry at it**

In `registry.tsx`: delete `PlaceholderWorld`, add `import { CampusWorld } from "@/game/world/campus/CampusWorld";` and set `World: CampusWorld` on the campus entry.

- [ ] **Step 5: Write the failing smoke test `src/game/world/campus/campus-world.smoke.test.tsx`**

useGLTF cannot fetch in jsdom — mock it to return a tiny toon model; everything else (Merged instancing, layout, hierarchy) is real:

```tsx
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const fakeGltf = () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene };
  };
  const useGLTF = Object.assign(vi.fn(fakeGltf), { preload: vi.fn(), clear: vi.fn() });
  return { ...real, useGLTF };
});

import { CampusWorld } from "./CampusWorld";

describe("CampusWorld smoke", () => {
  it("mounts terrain and instanced decor into a scene graph", async () => {
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const scene = renderer.scene;
    // Instanced meshes exist (one per model kind mounted via Merged) …
    const instanced = scene.findAll((n) => (n.instance as THREE.Object3D).type === "InstancedMesh");
    expect(instanced.length).toBeGreaterThanOrEqual(15);
    // … and the terrain planes are there.
    const meshes = scene.findAllByType("Mesh");
    expect(meshes.length).toBeGreaterThanOrEqual(2);
    await renderer.unmount();
  });
});
```

- [ ] **Step 6: Run the test**

`pnpm exec vitest run src/game/world/campus` → PASS. If `Merged` misbehaves under the test renderer (it needs no GL, only scene graph — it should work), stub `Merged` in the mock the way the old world stubs `ContactShadows`, and assert on `Mesh` counts instead; note the substitution in the test comment.

- [ ] **Step 7: Verify live + commit**

Update `GameShell` (temporary until T10 finishes the shell): replace the placeholder plane/box with `<CampusWorld />` inside `<Suspense fallback={null}>`. Run `pnpm dev` → `?game`: green campus, stone paths, trees/rocks/flowers, lantern-lined arms, hedged plaza. Kill server.

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run src/game
git add src/game/world src/game/app/GameShell.tsx
git commit -m "feat(game): campus world — terrain, paths, instanced nature + plaza props"
```

---

### Task 10: Plaza centerpiece, clouds, per-environment lighting, final shell

**Files:**

- Create: `src/game/world/campus/Fountain.tsx`
- Create: `src/game/world/CloudPuffs.tsx`
- Create: `src/game/engine/Lights.tsx`
- Modify: `src/game/world/campus/CampusWorld.tsx` (add fountain + clouds)
- Modify: `src/game/app/GameShell.tsx` (final composition: environment-driven sky/fog/lights)

**Interfaces:**

- Consumes: `GameEnvironment` (T7), `useQuality`/`QUALITY` (T5).
- Produces: `Lights({ env }: { env: GameEnvironment })` (ambient + hemisphere + shadow-casting sun sized by quality); `Fountain` (model + animated water disc); `CloudPuffs({ count?: number })` (drifting flat-toon puffs, seeded).

- [ ] **Step 1: Write `src/game/engine/Lights.tsx`**

```tsx
// Per-environment lighting rig (M0 T10). The sun's shadow camera is fitted to
// the campus bounds once — no per-frame work.
import { useQuality, QUALITY } from "@/game/engine/quality";
import type { GameEnvironment } from "@/game/world/environments/types";
import { CAMPUS } from "@/game/world/campus/layout";

export function Lights({ env }: { env: GameEnvironment }) {
  const tier = useQuality((s) => s.tier);
  const mapSize = QUALITY[tier].shadowMapSize;
  const b = CAMPUS.half + 6;
  return (
    <group>
      <ambientLight color={env.ambient.color} intensity={env.ambient.intensity} />
      <hemisphereLight
        color={env.hemisphere.sky}
        groundColor={env.hemisphere.ground}
        intensity={env.hemisphere.intensity}
      />
      <directionalLight
        position={env.sun.position}
        color={env.sun.color}
        intensity={env.sun.intensity}
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-b}
        shadow-camera-right={b}
        shadow-camera-top={b}
        shadow-camera-bottom={-b}
        shadow-camera-near={4}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
      />
    </group>
  );
}
```

- [ ] **Step 2: Write `src/game/world/campus/Fountain.tsx`**

```tsx
// Plaza centerpiece (M0 T10): the fantasy-town fountain with a slowly
// rotating translucent water disc — cheap, charming, alive.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { useModel } from "@/game/assets/use-model";

export function Fountain() {
  const model = useModel("fountain");
  const water = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (water.current) water.current.rotation.y += dt * 0.4;
  });
  return (
    <group>
      <primitive object={model} scale={4} />
      <mesh ref={water} position-y={0.55} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.7, 24]} />
        <meshToonMaterial color="#7fd4f2" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
```

(The water disc's radius/height are eyeballed against the scaled model — tune both visually in Step 6 until the disc sits inside the basin.)

- [ ] **Step 3: Write `src/game/world/CloudPuffs.tsx`**

```tsx
// Flat-toon clouds (M0 T10): merged sphere trios drifting slowly overhead.
// Seeded positions; drift pauses under reduced motion.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";

const COUNT = 7;
const ALT = 26;
const RANGE = 70;

export function CloudPuffs() {
  const reducedMotion = usePrefersReducedMotion();
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(() => {
    // Fixed table, not Math.random(): identical sky every launch.
    return Array.from({ length: COUNT }, (_, i) => ({
      x: ((i * 37) % RANGE) - RANGE / 2,
      z: ((i * 53) % RANGE) - RANGE / 2,
      s: 2.2 + (i % 3) * 0.9,
      v: 0.4 + (i % 4) * 0.15,
    }));
  }, []);

  useFrame((_, dt) => {
    if (reducedMotion || !group.current) return;
    group.current.children.forEach((c, i) => {
      c.position.x += seeds[i].v * dt;
      if (c.position.x > RANGE / 2) c.position.x = -RANGE / 2;
    });
  });

  return (
    <group ref={group}>
      {seeds.map((s, i) => (
        <group key={i} position={[s.x, ALT + (i % 2) * 3, s.z]} scale={s.s}>
          <mesh>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#ffffff" />
          </mesh>
          <mesh position={[1.1, -0.15, 0.2]} scale={0.7}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-1.05, -0.2, -0.15]} scale={0.6}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#f4fbff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 4: Add fountain + clouds to `CampusWorld`**

In `CampusWorld.tsx`, inside the root `<group>`: add `<Fountain />` and `<CloudPuffs />` (imports at top). Remove the `path-circle` note: the plaza ring already comes from layout.

- [ ] **Step 5: Final `GameShell` composition**

Replace `src/game/app/GameShell.tsx` contents:

```tsx
// Game shell (M0): environment-driven sky/fog/lights around the selected
// World, RTS camera, quality-aware canvas. The HUD overlay lands in T12.
import { Suspense, useEffect } from "react";
import { GameCanvas } from "@/game/engine/GameCanvas";
import { Lights } from "@/game/engine/Lights";
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import { preloadModels } from "@/game/assets/use-model";
import { CAMPUS } from "@/game/world/campus/layout";
import { environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { useQuality } from "@/game/engine/quality";

export default function GameShell() {
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);

  useEffect(() => {
    void useGameEnvironment.getState().init();
    void useQuality.getState().init();
    preloadModels();
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        <color attach="background" args={[env.sky]} />
        <fog attach="fog" args={[env.fog.color, env.fog.near, env.fog.far]} />
        <Lights env={env} />
        <Suspense fallback={null}>
          <env.World />
        </Suspense>
        <GameCameraRig bounds={{ half: CAMPUS.half, minDistance: 8, maxDistance: 60 }} />
      </GameCanvas>
    </div>
  );
}
```

Also update `GameCanvas.tsx` to take dpr from quality:

```tsx
import { useQuality, QUALITY } from "@/game/engine/quality";
// inside the component:
const tier = useQuality((s) => s.tier);
// on <Canvas>:
dpr={[1, QUALITY[tier].dprMax]}
```

- [ ] **Step 6: Verify live and tune**

`pnpm dev` → `?game`. Checklist: fountain sits centered with water disc inside the basin (tune scale/height); clouds drift; shadows soft and correctly-bounded (no shadow acne, no clipped shadows at world edge); paths/trees/lanterns/hedges/banners all present; camera limits feel right. Tune `Fountain` scale, sun position/intensity, fog distances until it looks like a sunny toy diorama. Kill server.

- [ ] **Step 7: Test suite + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run src/game
git add src/game
git commit -m "feat(game): fountain, drifting clouds, environment lighting — the campus breathes"
```

---

### Task 11: Post-processing — ink outline, SSAO, vignette

**Files:**

- Create: `src/game/engine/effects/ink-outline.ts`
- Create: `src/game/engine/effects/ink-outline.test.ts`
- Create: `src/game/engine/effects/Effects.tsx`
- Modify: `src/game/app/GameShell.tsx` (mount `<Effects />` inside the canvas)

**Interfaces:**

- Consumes: `QUALITY`/`useQuality` (T5).
- Produces: `class InkOutlineEffect extends Effect` (postprocessing custom effect, depth + color edge detection); `Effects()` component (EffectComposer chain: N8AO when tier allows → InkOutline → Vignette; MSAA per tier).

- [ ] **Step 1: Write the failing test `src/game/engine/effects/ink-outline.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { InkOutlineEffect } from "./ink-outline";

describe("InkOutlineEffect", () => {
  it("constructs with tunable uniforms", () => {
    const fx = new InkOutlineEffect();
    expect(fx.name).toBe("InkOutlineEffect");
    for (const u of ["outlineColor", "depthBias", "depthMul", "colorMul"]) {
      expect(fx.uniforms.get(u)).toBeDefined();
    }
  });

  it("accepts overrides", () => {
    const fx = new InkOutlineEffect({ depthMul: 2 });
    expect(fx.uniforms.get("depthMul")!.value).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`pnpm exec vitest run src/game/engine/effects/ink-outline.test.ts` → FAIL.

- [ ] **Step 3: Write `src/game/engine/effects/ink-outline.ts`**

```ts
// Ink outline (M0 T11) — the single biggest "it's a game now" lever. A
// custom postprocessing Effect: depth discontinuities give silhouettes,
// color discontinuities give interior lines between toon fill bands.
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Color, Uniform } from "three";

const fragmentShader = /* glsl */ `
  uniform vec3 outlineColor;
  uniform float depthBias;
  uniform float depthMul;
  uniform float colorMul;

  float ink_depth(const in vec2 uv) {
    return viewZToOrthographicDepth(getViewZ(readDepth(uv)), cameraNear, cameraFar);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec2 t = texelSize;
    float dC = ink_depth(uv);
    float depthEdge =
      abs(ink_depth(uv + vec2(t.x, 0.0)) - dC) +
      abs(ink_depth(uv - vec2(t.x, 0.0)) - dC) +
      abs(ink_depth(uv + vec2(0.0, t.y)) - dC) +
      abs(ink_depth(uv - vec2(0.0, t.y)) - dC);
    depthEdge = smoothstep(depthBias, depthBias * 3.0, depthEdge) * depthMul;

    vec3 cC = inputColor.rgb;
    vec3 cR = texture2D(inputBuffer, uv + vec2(t.x, 0.0)).rgb;
    vec3 cU = texture2D(inputBuffer, uv + vec2(0.0, t.y)).rgb;
    float colorEdge = (length(cR - cC) + length(cU - cC)) * colorMul;

    float edge = clamp(depthEdge + colorEdge, 0.0, 1.0);
    outputColor = vec4(mix(inputColor.rgb, outlineColor, edge), inputColor.a);
  }
`;

export interface InkOutlineOptions {
  color?: string;
  depthBias?: number;
  depthMul?: number;
  colorMul?: number;
}

export class InkOutlineEffect extends Effect {
  constructor({
    color = "#233043",
    depthBias = 0.0012,
    depthMul = 0.9,
    colorMul = 0.28,
  }: InkOutlineOptions = {}) {
    super("InkOutlineEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ["outlineColor", new Uniform(new Color(color))],
        ["depthBias", new Uniform(depthBias)],
        ["depthMul", new Uniform(depthMul)],
        ["colorMul", new Uniform(colorMul)],
      ]),
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

`pnpm exec vitest run src/game/engine/effects/ink-outline.test.ts` → PASS.

- [ ] **Step 5: Write `src/game/engine/effects/Effects.tsx`**

```tsx
// The post chain (M0 T11), quality-aware: N8AO grounds objects, the ink
// outline draws the world, a soft vignette frames the diorama.
import { useMemo } from "react";
import { EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { QUALITY, useQuality } from "@/game/engine/quality";
import { InkOutlineEffect } from "./ink-outline";

export function Effects() {
  const tier = useQuality((s) => s.tier);
  const cfg = QUALITY[tier];
  const outline = useMemo(() => new InkOutlineEffect(), []);

  if (cfg.ssao) {
    return (
      <EffectComposer multisampling={cfg.multisampling}>
        <N8AO aoRadius={1.4} intensity={2.2} distanceFalloff={1} />
        <primitive object={outline} />
        <Vignette eskil={false} offset={0.22} darkness={0.5} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={cfg.multisampling}>
      <primitive object={outline} />
      <Vignette eskil={false} offset={0.22} darkness={0.5} />
    </EffectComposer>
  );
}
```

- [ ] **Step 6: Mount and verify live**

In `GameShell.tsx` add `<Effects />` as the last child inside `<GameCanvas>` (import from `@/game/engine/effects/Effects`). Run `pnpm dev` → `?game`:

- Crisp dark outlines around trees/fountain/lanterns, interior lines between toon bands.
- If the screen is entirely outlined/noisy: raise `depthBias` (try 0.002–0.004); if outlines are missing: lower it. Tune `colorMul` 0.15–0.4.
- Objects visually "sit" on the ground (AO contact darkening).
- If `viewZToOrthographicDepth`/`getViewZ`/`readDepth` are reported undefined by the shader compiler, postprocessing's helper names changed — check `node_modules/postprocessing/build/index.js` for the current depth helpers and adapt (they exist for every effect with `EffectAttribute.DEPTH`).

Kill the server.

- [ ] **Step 7: Full suite + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec vitest run
git add src/game
git commit -m "feat(game): post chain — ink outline, N8AO grounding, vignette"
```

---

### Task 12: HUD overlay, FPS probe, perf verification

**Files:**

- Create: `src/game/hud/HudOverlay.tsx`
- Create: `src/game/hud/FpsProbe.tsx`
- Modify: `src/game/app/GameShell.tsx` (mount overlay + probe)

**Interfaces:**

- Consumes: `useGameEnvironment`, `ENVIRONMENTS` (T7), `useQuality` (T5).
- Produces: `HudOverlay` (chunky bottom-left badge: environment name + quality tier cycler), `FpsProbe({ onSample })` (in-canvas, samples fps once per second — same approach as `src/panels/world/WorldHud.tsx`).

- [ ] **Step 1: Write `src/game/hud/FpsProbe.tsx`**

```tsx
// FPS sampling inside the frameloop (M0 T12) — the WorldHud approach.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function FpsProbe({ onSample }: { onSample: (fps: number) => void }) {
  const frames = useRef(0);
  const t0 = useRef(0);
  useFrame(({ clock }) => {
    frames.current += 1;
    const t = clock.elapsedTime;
    if (t - t0.current >= 1) {
      onSample(Math.round(frames.current / (t - t0.current)));
      frames.current = 0;
      t0.current = t;
    }
  });
  return null;
}
```

- [ ] **Step 2: Write `src/game/hud/HudOverlay.tsx`**

```tsx
// Minimal M0 HUD: environment badge + quality cycler + fps. The real game
// bar (roster, build, day/night) is M1/M2 scope — this is the debug face.
import { ENVIRONMENTS, environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { useQuality, type QualityTier } from "@/game/engine/quality";

const NEXT_TIER: Record<QualityTier, QualityTier> = { low: "medium", medium: "high", high: "low" };

export function HudOverlay({ fps }: { fps: number }) {
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);
  const tier = useQuality((s) => s.tier);
  const setTier = useQuality((s) => s.setTier);
  const setEnvironment = useGameEnvironment((s) => s.setEnvironment);
  const idx = ENVIRONMENTS.findIndex((e) => e.id === env.id);
  const next = ENVIRONMENTS[(idx + 1) % ENVIRONMENTS.length];

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2">
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-emerald-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Switch environment"
        onClick={() => setEnvironment(next.id)}
      >
        {env.emoji} {env.name}
      </button>
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-sky-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Cycle quality tier"
        onClick={() => setTier(NEXT_TIER[tier])}
      >
        ✨ {tier}
      </button>
      <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90">
        {fps} fps
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Mount in `GameShell`**

```tsx
const [fps, setFps] = useState(0);
```

(add `useState` import), `<FpsProbe onSample={setFps} />` as a canvas child, `<HudOverlay fps={fps} />` as a sibling AFTER `</GameCanvas>`.

- [ ] **Step 4: Full verification pass**

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm dev
```

In the browser at `?game`:

1. Campus renders complete (terrain, paths, plaza+fountain, trees, lanterns, hedges, banners, clouds, outlines, AO, vignette).
2. FPS badge reads ≥ 60 at `medium` on this machine; cycle tiers and confirm low > medium > high fps ordering and visible shadow/AO differences.
3. Camera: all inputs + edge scroll + limits.
4. Quality choice survives reload (Tauri only — in a plain browser the KV write fails silently by design).

Also run inside the real shell: `pnpm tauri dev`, then navigate the main window to `?game` (or temporarily set the route) and confirm the KV persistence works.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat(game): M0 HUD — environment badge, quality cycler, fps probe"
```

---

### Task 13: Finish — CHANGELOG, screenshot verification, PR

- [ ] **Step 1: Update `CHANGELOG.md`** under Unreleased: `- feat(game): M0 "Gorgeous empty campus" — new game frontend behind ?game: CC0 asset pipeline, toon+ink-outline rendering, RTS camera, environment system (Campus), quality tiers.`
- [ ] **Step 2: End-to-end verification** — use the superpowers:verification-before-completion skill: full `pnpm exec vitest run`, `pnpm exec tsc --noEmit`, `pnpm build`, live screenshot of `?game` compared against the M0 exit criterion ("fly around an empty campus; it already looks stunning").
- [ ] **Step 3: Commit + PR** — use the superpowers:finishing-a-development-branch skill; PR from `feat/game-m0-campus`, title `feat(game): M0 — gorgeous empty campus`, body links `docs/superpowers/specs/2026-07-02-campus-game-rebuild-design.md` and this plan.
- [ ] **Step 4: Update Linear** — mark the M0 issues Done (issues created before implementation started).
