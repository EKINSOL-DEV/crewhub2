# CrewHub 3.0 — "The Campus" Game-First Rebuild

**Date:** 2026-07-02 · **Status:** APPROVED DIRECTION — decisions D1–D4 confirmed by Nicky 2026-07-02 · **Supersedes the visual/world direction of** `docs/plans/2026-06-12-world-beauty-restoration.md`

## Problem

CrewHub 2.0's world feels like an application that shows a 3D view, not a game. Root causes, confirmed in the codebase:

1. **Zero authored assets.** Everything under `src/panels/world/` is procedural geometry (rounded boxes, capsules, toon material). Two Point Museum/Campus/Hospital charm comes from authored, characterful models under one strong art direction — procedural primitives have a hard ceiling and 2.0 hit it.
2. **No simulation.** `WorldScene` passively visualizes session state. Characters don't _behave_ — no walking to a desk to work, no queueing, no ambient life.
3. **Non-diegetic UI.** Chat is a shadcn panel floating over a canvas. In the target style, every interaction happens in the game's own visual language.

## Goal

Rebuild the visual/world experience as a game — a stylized campus where robot characters ARE the AI threads — while keeping the entire backend "API layer" (Claude Code connection, data model, IPC, stores) as-is.

## What we keep (untouched)

- **Rust engine** `src-tauri/src/engine/**`: CLI `stream-json` sessions, transcript watcher, hooks, permission protocol, headless `claude -p` runs (per ADR-0001).
- **Store layer** `src-tauri/src/store/**` + SQLite migrations; MCP server `src-tauri/src/mcp/**`; orchestrator; hooks installer.
- **Typed IPC contract** (`src/ipc/bindings.ts`, `src/ipc/events.ts`) and **Zustand stores** (`src/stores/*`) — the seam the new game consumes.
- Existing model-tier infra: `SpawnSpec.model`, per-feature `model_policy` settings, haiku-default headless runs.

## What we delete and rebuild

- `src/panels/world/**` (all R3F rendering, procedural bots/props/environments, world chat windows).
- The HUD shell: `src/app/WorldView.tsx`, `GameHud.tsx`, `WorldOverlayHost.tsx`, `WorldMovedPanel.tsx`.
- **The 2D workspace window** (`?window=workspace`, `WorkspaceShell.tsx`) and eventually the 2D panels (D4: the game is the only UI). Timing: panels stay as a debugging surface through M0–M2, then are removed once game-native equivalents exist (chat/permissions in M2; final cleanup in M4). Non-visual internals (transcript virtualization, markdown/tool-card rendering, composer logic) are salvaged as hooks/components for the diegetic chat.

## Core concept — Characters with two brains

A **Character** is a persistent robot in the world (extends the existing `agents` entity). Add one three ways: **hire fresh** (spawn a new managed Claude Code session), **link** to an existing/terminal thread, or **adopt** from the session list (existing `session_bindings` mechanics).

| Brain      | Does                                                                       | Powered by                                                                                                               | Cost          |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **Body**   | walking, pathfinding, desk choice, idle wander, queueing, status reactions | pure simulation code (state machine + grid pathfinding, 10Hz tick) — **no LLM**                                          | $0            |
| **Flavor** | thought bubbles, ambient quips, personality                                | throttled headless `claude -p` one-shots on **Haiku 4.5**, fed transcript snippets; ≤1 run per character per few minutes | pennies       |
| **Voice**  | the real conversation = the actual Claude Code thread                      | **Sonnet 5 default**, per-character model picker, fallback to best available tier                                        | the real work |

Rationale vs. "two threads per character": LLM-driven movement would be slow, expensive, and worse than simulation. Simulation gives 60fps life for free; Haiku supplies personality on top; the Voice brain is the managed session that already exists.

**Status → behavior mapping:** working → sits at desk, typing sparks · waiting-for-permission → walks to front of room, raises hand + HUD ping · thinking → paces with thought bubble · idle → coffee machine / chats with neighbors · error → sits sadly, smoke puff.

## Visual direction

- **Art source (D1, DECIDED 2026-07-02):** CC0 glTF kits (Kenney, Quaternius, Poly Pizza) for campus/buildings/furniture; **custom rigged robots** (walk/sit/type/wave/think/celebrate animations) as the bespoke centerpiece. The pipeline is source-agnostic, so upgrading later (Synty, commissioned art) stays cheap.
- **Unification:** toon shading (3-step gradient) + **ink outline post-process**, soft shadows, SSAO, ACES tone mapping, optional subtle tilt-shift.
- **Palette:** locked saturated pastels (Two Point greens/creams/coral roofs).
- **Camera:** game camera — pan/rotate/zoom with limits, edge scrolling, smooth focus-on-character.
- **Environment:** an open campus — grass quad, paths, trees, fountain. Buildings on plots; existing room entities live inside buildings with **cutaway walls** facing the camera.
- **Sound:** CC0 UI pops, footsteps, ambient birdsong.
- **Diegetic UI:** click a robot → chunky game-styled dialog (transcript + composer + permission/question cards as "the robot asks you"). Short replies double as speech bubbles. HUD = game bar: roster with status portraits, build button, day/night, notifications.
- **Build mode (Two Point core loop):** grid overlay → drag room footprint onto a plot → place furniture from a kit palette → characters use what you place.

## Architecture

```
src/game/
  engine/      renderer, postprocessing (toon+outline), asset loader, quality tiers
  assets/      manifest + glTF pipeline (draco/meshopt); binaries in public/assets/
  sim/         PURE TS, three.js-free: character state machines, pathfinding,
               desk assignment, day cycle — fully unit-tested
  world/       campus scene, terrain, buildings, cutaway rooms
  characters/  robot models, animation controller, expressions, bubbles
  build/       build mode: room + furniture placement, grid editor
  chat/        diegetic chat window, composer, permission/question cards
  hud/         game bar, roster, notifications, settings
```

Data flow: Zustand stores → `toCharacters()` join (sessions + agents + bindings + projects + tasks; successor of `toWorldBots`) → **sim** (the new layer 2.0 never had) → render.

During the rebuild, extract the spawn/model logic currently living in `WorldChatWindow.tsx` / `panels/crew/crew-status.ts` (`agentSpawnSpec`) into a shared store/service.

### Backend deltas (small)

- Migration: character fields on `agents` (`robot_variant`, `voice_model`, `personality`); world-layout tables (`plots`, `placements`, room geometry).
- One new IPC command for flavor generation (clone of the `world_generate_prop` seam).
- Settings: `model_policy.character_flavor = haiku`, `model_policy.character_voice = sonnet`.

## Milestones

| #   | Milestone                                                                                                     | Exit criteria                                         |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| M0  | **Gorgeous empty campus** — asset pipeline, toon+outline renderer, terrain, trees, game camera, quality tiers | Fly around an empty campus; it already looks stunning |
| M1  | **Robots alive** — rigged robots, sim loop, status→behavior from live sessions                                | Real Claude Code threads walk around as robots        |
| M2  | **Talk to them** — diegetic chat, bubbles, permission cards, hire/link/adopt flow, voice-model picker         | Full conversations without leaving the game idiom     |
| M3  | **Build it** — build mode, rooms, furniture, persistence, characters use furniture                            | Lay out your own campus                               |
| M4  | **It breathes** — Haiku flavor bubbles, day/night, sound, "new campus" onboarding, remove 2D workspace/panels | Feels like a game you want to leave open              |

M0+M1 are the proof point before any build-mode investment. Each milestone gets its own implementation plan (superpowers:writing-plans) when picked up.

## Error handling

- Session events lag or vanish → characters degrade gracefully to idle; never block the render loop on IPC.
- Flavor runs fail/rate-limit → skip silently (flavor is decorative); hard per-character throttle prevents cost runaway.
- Asset load failure → per-asset fallback primitive + console warning; the world always boots.
- WebGL context loss → existing guard behavior (transient loss is non-fatal) carries over.

## Testing

- `sim/` pure TS, full unit coverage (vitest), zero three.js imports.
- Scene smoke tests via `@react-three/test-renderer` (mounts per quality tier).
- E2E boot test (WebdriverIO) — campus renders, roster shows a fake-claude session.
- Performance budget: ≥60fps with demo dataset; instancing for all repeated geometry.

## Decisions (all confirmed by Nicky, 2026-07-02)

1. **D1 Art source** — CC0 kits (Kenney/Quaternius/Poly Pizza) + custom rigged robots.
2. **D2 Robot look** — evolve the boxy v1 robots (boxy head/body, big eyes, blush, antenna status bulb) into rigged, animated glTF characters.
3. **D3 Flavor brain** — on by default with a strict throttle and a visible cost indicator.
4. **D4 2D workspace** — **removed**; the game is the only UI (panels linger as a debug surface until M2 game-native equivalents, deleted by M4).

## Non-goals

- No engine switch: React Three Fiber stays (Tauri+React seam, existing knowledge; the gap is art direction + simulation, not the engine).
- No multiplayer, web app, or non-Claude runtimes (unchanged from v2 plan §non-goals).
- No changes to the engine/store/IPC contract beyond the listed deltas.
