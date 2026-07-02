# World Beauty Restoration — bring v1's charm back, better

**Date:** 2026-06-12 · **Branch:** `feat/world-beauty-restoration` · **Linear:** CrewHub v2 Rebuild, milestones M1–M4 (world beauty)

## Problem

The v2 3D world is architecturally solid (R3F v9, pure `WorldScene`, theme-aware palette, 118+ fps) but visually a serious regression from v1:

- **No environments.** v1 had four selectable biomes (Desert 🏜️, Grass 🌿, Island 🏝️, Sky Platform ✨) with procedural decor — cacti, dunes, tumbleweeds, grass tufts, clouds, a floating island. v2 renders rooms floating in a dark void.
- **Colors are gone.** v1 rooms were saturated (pink, teal, orange, yellow, purple, green) with walls tinted per room. v2 derives everything from theme CSS vars → muted, near-monochrome.
- **The robots lost their charm.** v1 bots were boxy little robots — rounded-box head + body, big eyes with highlights, blush cheeks, expressive mouths, arms, feet, per-variant antenna accessories. v2 bots are plain capsules.
- **No toon shading.** v1's look was cel-shaded (`meshToonMaterial`, 3-step gradient). v2 uses standard PBR materials.

v1 reference implementation: `crewhub/frontend/src/components/world3d/` (fully procedural — no external assets — so everything is portable).

## Goal

Restore v1's sunny, playful look in v2 **and improve on it** (real soft shadows, better lighting per biome, cleaner silhouettes), without giving up v2's architecture: pure render components, math in `lib/`, data via props from `WorldPanel`, theme system intact.

## Design

### 1. Environment system (`src/panels/world/environments/`)

An environment owns the _world outside the building_: sky, fog, ground, lighting rig, decor, and the vibrant room-floor fallback palette.

```ts
interface WorldEnvironment {
  id: string; // "desert" | "grass" | "island" | "sky" | "theme"
  name: string;
  emoji: string;
  /** Palette overrides; merged over the theme palette when active. */
  colors: Partial<Pick<WorldPalette, "sky" | "fog" | "ground" | "lobby" | "floors" | "grid" | "gridSection">>;
  /** Hide the debug-ish grid on natural terrain. */
  showGrid: boolean;
  lighting: {
    ambient: { color: string; intensity: number };
    hemisphere?: { sky: string; ground: string; intensity: number };
    sun: { position: [number, number, number]; color: string; intensity: number };
    fill?: { position: [number, number, number]; color: string; intensity: number };
  };
  /** Procedural scenery around the building; receives world bounds. */
  Decor: ComponentType<{ bounds: WorldBounds; reducedMotion: boolean }>;
}
```

- **Registry** (`environments/registry.tsx`): `desert`, `grass`, `island`, `sky`, plus **`theme`** — the current theme-derived look, kept as a first-class option (no regression for minimal-look fans; CSS-var mapping stays useful).
- **Default: `desert`** (v1's default, the screenshots Nicky loves).
- **Persistence**: settings KV key `world.environment`, same pattern as `props/store.ts` (zustand + `commands.getSetting/setSetting`, best effort).
- **Palette merge**: `applyEnvironment(themePalette, env)` → `WorldPalette`. Pure, unit-tested.
- **Decor is seeded-deterministic** (hash of grid coords, like v1) and instanced — no `Math.random()` in render, cheap draw calls.
- **Switcher UI**: a small overlay control in `WorldPanel` (next to "Edit props") cycling/choosing the environment.

### 2. Vibrant rooms (`Rooms3D.tsx`)

- **Per-room wall tint** (v1 look): walls take the room color (darkened/desaturated mix) instead of one global wall color; walls remain instanced — color via per-instance color attribute.
- **Vibrant floor fallbacks** in environments: the v1 family — pink `#EC4899`, teal `#2DD4BF`, orange `#F97316`, yellow `#FACC15`, purple `#8B5CF6`, green `#34D399` — softened to floor-plate tints; explicit `room.color` still wins.
- **HQ**: elevated platform (+0.2), procedural checkered floor, gold (`#FFD700`) accent ring — the v1 "command center" read.
- **Hover feedback**: emissive tint on the floor plate on pointer-over.
- **Corner caps**: small cylinders on wall corners (v1's rounded-post silhouette).
- **Toon materials** everywhere: shared 3-step gradient map in `lib/toon.ts`.

### 3. Robot charm (`Bot3D.tsx` + new `BotModel.tsx`)

Port v1's boxy robot body onto v2's motion system (wander/spring/squash/blink all stay):

- Rounded-box **head** (eyes with pupils + highlights, blush cheeks, smile) on rounded-box **body** with darker lower band, capsule **arms**, little dark **feet**.
- **Antenna + status bulb stays** (v2's best idea — readable status from across the room) on top of the head.
- Toon material, body in `bot.color`; subagents keep the 0.7 scale.
- Eyes group keeps the `eyes` ref so the existing blink keeps working; body group keeps squash-and-stretch.
- Status glow ring, speech bubbles, nameplates: unchanged.

### 4. Graphics polish (better than v1)

- **Soft shadows**: the sun directional gets `castShadow` + PCFSoft, shadow camera fitted to world bounds; floors/ground receive. ContactShadows stays for grounding.
- **Per-biome lighting**: warm desert sun (`#FFD4A0`), fresh grass daylight, golden island light, cool sky-platform glow.
- **Clouds** (grass/island/sky): a few flat-shaded puffs drifting slowly (static under reduced motion).
- ACES filmic tone mapping stays.

## What does NOT change

- `WorldScene` stays a pure render component; all data still flows from `WorldPanel`.
- `lib/` stays three.js-free pure math where it is today.
- Theme system, task walls, props/creator mode, camera rig, first-person mode, WebGL guard: untouched APIs.
- Performance bar: instancing for all decor; target ≥ 60 fps with the demo dataset.

## Milestones (Linear)

| #   | Milestone          | Contents                                                                                                          |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| M1  | World Environments | Registry, persistence, switcher UI, Desert + Grass + Island + Sky decor, `theme` fallback env                     |
| M2  | Vibrant Rooms      | Per-room wall tints, vibrant floor palette, HQ platform + checker + gold, hover glow, corner caps, toon materials |
| M3  | Robot Charm        | Boxy bot model port, faces (eyes/blush/smile), arms/feet, toon shading, antenna status kept                       |
| M4  | Graphics Polish    | Soft shadows, per-biome lighting rigs, clouds, tone-mapping tuning                                                |

## Test plan

- Pure logic (palette merge, seeded placement, environment store) → vitest unit tests next to the code, like the rest of `lib/`.
- `world-scene.smoke.test.tsx` extended: scene mounts with each environment.
- Manual: `pnpm dev`, demo data, all four environments + theme env, orbit/FP/edit modes, reduced motion.
