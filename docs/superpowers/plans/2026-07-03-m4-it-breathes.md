# M4 — It Breathes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The campus feels alive and becomes THE app: Haiku-powered thought bubbles (the flavor brain), Desert/Island/Sky environments, day/night, sound, a welcome ceremony — and the game replaces the old world as the main window, deleting `src/panels/world/**`.

**Architecture:** Flavor rides the EXISTING generic headless seam `commands.worldGenerateProp(prompt, model) → HeadlessRun {status, text}` (verified: provider-neutral, frontend owns the prompt, haiku default — zero Rust changes). Environments become data: the campus world is parametrized by a `Biome` config (terrain palette, scatter substitutions, lighting) so Desert/Island/Sky are registry entries sharing layout/buildings/sim. The main-window switch deletes only the OLD 3D world; `?window=workspace` + panels stay for features without game equivalents yet (board/meetings/settings) — documented partial-D4.

**Tech Stack:** unchanged; new CC0 assets (Kenney nature-kit cacti/palms — already downloaded; Kenney Interface Sounds pack for SFX).

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict (exactOptionalPropertyTypes); alias `@/`; NO src/panels/\*\* imports in src/game (T6 deletes that tree — any lingering import breaks the build, which is the point).
- Flavor cost discipline (spec D3): default ON with hard budget — per-character cooldown ≥ 240s, global max 1 in-flight, session counter surfaced in the HUD, kill-switch setting `game.flavor.enabled`, model from `model_policy.character_flavor` setting (default "haiku"). No flavor calls in demo mode or for resting crew (no session context).
- Pure modules stay pure (no Date.now/Math.random — inject).
- Perf rules stand: FrameLimiter untouched; new decor via InstancedModel; biome swap = remount (rare, fine); no per-frame allocation.
- Existing suites stay green EXCEPT tests of deleted old-world files (T6 removes those tests with their subjects).
- Branch: `feat/game-m4-breathe` cut from `feat/game-m3-build`.

---

### Task 1: Flavor engine — throttled Haiku thoughts (pure core + store)

**Files:** Create `src/game/flavor/engine.ts`, `engine.test.ts`, `prompt.ts`, `prompt.test.ts`.

**Contracts:**

```ts
// prompt.ts (pure)
export function flavorPrompt(c: { name: string; status: SessionStatus; activity: string | null }): string
// Short instruction: "You are <name>, a robot working on a software campus... reply with ONE playful thought (<=12 words) about: <activity/status>. No quotes."
export function sanitizeThought(text: string): string | null
// trim, strip wrapping quotes/markdown, first line only, clamp 90 chars, null when empty/error-ish.

// engine.ts — zustand store + scheduler:
export const FLAVOR_SETTING_KEY = "game.flavor.enabled";   // "0" disables; default enabled
export const FLAVOR_MODEL_KEY = "model_policy.character_flavor"; // default "haiku"
export interface Thought { text: string; ts: number }
useFlavor: {
  thoughts: Record<string, Thought>;   // character key -> latest thought
  runs: number;                        // session counter (HUD cost hint)
  enabled: boolean;
  init(): Promise<void>;               // load both settings, idempotent
  maybeThink(c: Character, nowMs: number): void;  // fire-and-forget; respects cooldown 240s/char + global in-flight=1 + enabled + skip agentId/demo keys
}
// maybeThink internals: worldGenerateProp(flavorPrompt(c), model) -> sanitizeThought -> set thoughts[key] (+runs+1); failures silent; cooldown recorded at ATTEMPT time (failures don't retry-storm). TTL: thoughts expire after 30s (pruned by the consumer or a getter — pick and document).
```

**Steps:** TDD — prompt determinism + sanitizer cases (quotes/markdown/multiline/error text/empty); engine: cooldown gating, global in-flight, disabled short-circuit, demo/crew skip, counter, expiry; mocked `@/ipc/bindings` + injected nowMs. → implement → `pnpm exec vitest run src/game/flavor` → commit.

---

### Task 2: Thought bubbles UI + HUD cost hint

**Files:** Create `src/game/flavor/ThoughtBubble.tsx`; modify `src/game/characters/Characters.tsx` (render thought when no speech bubble active — speech wins), `src/game/characters/use-sim.ts` OR a new tiny hook `useFlavorTicker` in flavor/ (choose: a 15s interval in Characters that calls `maybeThink` for each live session character with Working/WaitingForInput status, injected Date.now at call site), `src/game/hud/HudOverlay.tsx` (chip `💭 {runs}` visible when runs > 0).

**Details:** ThoughtBubble = Billboard at y≈3.15, cloud-styled (white rounded backdrop, small trailing dots), italic grey Text prefixed "💭 " — own Suspense (font lesson). Speech-vs-thought precedence in the actor: `speechText ?? thoughtText`, speech wins. Tests: precedence unit (render actor with both mocked — speech shows), HUD chip renders count, ticker calls maybeThink for eligible characters only (jsdom, fake timers).

---

### Task 3: Biomes — Desert 🏜️ / Island 🏝️ / Sky ✨

**Files:** Create `src/game/world/biome.ts` (+test); modify `src/game/assets/manifest.json` (+`cactus-short`, `cactus-tall`, `tree-palm`, `tree-palm-tall` — files verified in nature-kit), run `pnpm assets:build` (commit GLBs), `src/game/world/campus/CampusWorld.tsx` + `Terrain.tsx` (biome-driven colors + scatter model substitution map), `src/game/world/environments/registry.tsx` (3 new entries with lighting/sky/fog + `World` bound to the parametrized campus world), `campus-world.smoke.test.tsx` (mounts per biome).

**Contracts:**

```ts
// biome.ts (pure)
export interface Biome {
  id: "campus" | "desert" | "island" | "sky";
  grass: string;
  apron: string;
  path: string;
  /** ScatterKind -> ModelId overrides (e.g. desert: treeDefault->cactus-tall, bush->rock-small...). Missing = keep campus default. */
  scatter: Partial<Record<ScatterKind, ModelId>>;
  /** kinds to SKIP entirely (island skips pines; sky skips rocks...) */
  skip?: ScatterKind[];
}
export const BIOMES: Record<Biome["id"], Biome>;
```

Registry entries (lighting values — tune later in my visual pass): desert warm `#ffd9a0` sun / sand `#e7c384`; island bright / lagoon fog `#bfeaf5`; sky cool `#dfe7ff`, denser CloudPuffs (prop `count`). Environment store already persists selection; HUD cycle button already cycles ENVIRONMENTS. Foliage hue fix stays campus/island-only (cacti/palms judge by their own hues — the cyan-band shift is safe for both; leave `foliage` flags as-is and note).

**Steps:** TDD biome map validity (all override values are manifest ids); manifest+build+commit GLBs; parametrize; registry; smoke per biome; commit.

---

### Task 4: Day / night

**Files:** Create `src/game/world/night.ts` (+test — pure lighting interpolator); modify `src/game/world/environments/store.ts` (night flag, `world.night` KV — port old-world semantics, cite), `src/game/engine/Lights.tsx` (lerp between day/night rigs via useFrame damp on intensities/colors — mutate ref-held light objects, react-compiler-safe), `src/game/hud/HudOverlay.tsx` (☀️/🌙 chip), `src/game/app/GameShell.tsx` (sky/fog colors lerp too — damp a THREE.Color ref applied via `<color attach>`? Simpler: compute night sky/fog variants in night.ts and swap with a CSS-free instant change + only LIGHTS lerp; document).

**Contract:** `nightRig(env: GameEnvironment): GameEnvironment["sun" | "ambient" | "hemisphere"] variants` — pure derivation (dim ambient 0.25, hemi moon-blue, sun → moonlight #9db8ff intensity 0.6 opposite azimuth). Test: derivation deterministic, intensities within sane bounds.

---

### Task 5: Sound — CC0 UI sfx

**Files:** Modify `scripts/assets/fetch-kits.mjs` (add kenney `interface-sounds` pack) + create `scripts/assets/build-sfx.mjs` (copy ~6 picked files → `public/assets/sfx/*.ogg`, commit + LICENSE note); create `src/game/audio/sfx.ts` (+test): `playSfx(name: "click"|"place"|"remove"|"chat-open"|"send"|"hire")`, lazy AudioContext, per-name buffer cache, `game.muted` KV setting + `useMuted` store + HUD 🔊/🔇 chip; hooks: BuildPalette clicks, BuildControls place/remove, ChatWindows open, ChatWindow send, HireDialog success.

**Steps:** verify the kenney page scrape finds interface-sounds zip (same pattern); pick files by ls; sfx store TDD (mute gating, cache, missing-file silence — Audio mocked); wire call sites (one-liners); commit. If the pack's scrape fails, fall back to synthesizing 3 tiny WebAudio blips (oscillator envelopes — no assets) and document.

---

### Task 6: The switch — game becomes the main window; old world deleted

**Files:** Modify `src/App.tsx` (MainWindow = GameShell + OnboardingWizard + WhatsNewDialog overlays; `?game` param now redundant but kept as alias; `?window=workspace` unchanged); DELETE `src/panels/world/**` (all), `src/app/WorldView.tsx`, `src/app/GameHud.tsx`, `src/app/WorldOverlayHost.tsx`, `src/app/WorldMovedPanel.tsx` + their tests; update `src/app/panel-registry.tsx`, `palette-actions.ts`, `keymap.ts`, `open-chat.ts`, onboarding wizard end-step, and any other referencers (grep `WorldView|world panel|panels/world` — fix each); create `src/game/app/WelcomeCard.tsx` (first-run ceremony: game card "🏫 Welcome to your campus" + 3 hint lines + Let's go; `game.welcomed` KV).

**Rules:** WorkspaceShell + all non-world panels stay functional (partial-D4, documented in code + plan). App tests updated: main window renders game shell; workspace window unaffected; onboarding overlays the game. Run FULL suite; every failure from a deleted subject → delete/replace its test deliberately (list them in the report — no blind deletions of unrelated tests).

---

### Task 7: Debt sweep

**Files:** As needed per item — keep each item a separate commit:

1. Per-kind edit versions in `useCampusEdits` (or a `versionByKind` map) so one item's move remounts only its kind's InstancedModel; rotate-key repeat gating (throttle rotateItem persist to ≤4/s).
2. Robot-click vs item tool: `onPointerDown` stopPropagation in CharacterActor (clicking a robot while placing must not place-under + open chat).
3. Shared mapping helper: CampusWorld placed-decor mapping calls `applyEdits` (or shared fn); export ROT_STEP from one place.
4. ChatWindow Ended composer → "Wake up" button when the character has an agent binding (port wakeAndSend semantics from the deleted world's WorldChatWindow — copy BEFORE T6 deletes it; simplest: buildHireSpec + prompt = the draft, reuse hireAgent flow).
5. e2e (EKI-148): the 3 flaky old-world boot specs — rewrite the boot spec against the game main window (game-shell testid + HUD chips visible), keep the workspace spec, delete obsolete ones. (Runs in CI only — implement by reading e2e/\*.spec and adapting selectors.)
6. infoRef nameplate staleness: include name+color in the sync key (cheap fix now that it exists).

---

### Task 8: Finish — verification, CHANGELOG, final review, PR

- [ ] Full suite + tsc + build; perf re-measure (script, port 14211) — must stay ≤ ~45%; controller visual pass per biome + night + thought bubble (screenshots).
- [ ] CHANGELOG (M4 + debts). Final whole-branch review (most capable model) + one fix wave. PR `feat/game-m4-breathe` (stacked). Linear close; update the campus spec's D4 note (partial: workspace retained until game-native equivalents).
