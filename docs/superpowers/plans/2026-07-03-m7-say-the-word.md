# M7 — Say The Word (location-aware chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (user, verbatim intent):** make the chat location-aware — tell a bot to go to a room or the headquarters, tell it to do an animation, or ask for a joke and the answer lands in its speech bubble; a cheap Haiku session interprets the free text where needed.

**Architecture:** A two-stage intent layer sits in front of chat send. Stage 1 is a PURE deterministic parser (zero cost) catching common commands (`go to <room|hq|plaza>`, `dance/spin/cheer/wave`, `come out`). Stage 2 — only when the parser misses — is a Haiku interpreter over the existing `worldGenerateProp` headless seam that maps free text onto a strict JSON intent (`goto | emote | say | none`) given the live target catalog (linked room names, hq, plaza) and emote list. Intents execute in the game: the sim gains a per-bot command override (`goto` with hold-then-resume, `emote` as new timed Motions with poses), `say` pushes a local speech bubble + chat note. Live sessions keep their real conversation: text that parses as a WORLD COMMAND is executed locally and NOT sent to the model; everything else goes to the session as today (a live session's joke already comes back as a bubble via M2). Session-less bots (resting crew, demo) get a voice: their non-command messages route to the Haiku interpreter's `say`.

**Tech Stack:** unchanged; rides M6's HQ (targets include `hq`).

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict (exactOptionalPropertyTypes); alias `@/`; NO src/panels imports in src/game.
- Sim purity + determinism: commands enter via an explicit `sim.command()` call (React side); inside the sim everything stays seeded/tick-driven. No Math.random/Date.now in pure modules.
- Cost discipline (D3 lineage): parser first — Haiku ONLY on parser miss, ONLY on explicit user sends (never ambient), same `model_policy.character_flavor` model + `game.flavor.enabled` kill switch; counts into the existing 💭 HUD counter; per-send (no cooldown needed — user-initiated); prompt carries the target catalog clamped (≤24 targets, names ≤40 chars).
- A world command NEVER reaches the real Claude session (no token waste, no confusing context); a normal message NEVER triggers Haiku for a LIVE session (the session answers it).
- Branch: `feat/game-m7-say` cut from `feat/game-m6-hq` (stacked).

---

### Task 1: Intent layer — parser + Haiku interpreter (pure + engine)

**Files:** Create `src/game/intents/parse.ts` (+parse.test.ts), `interpret.ts` (+interpret.test.ts).

**Contracts:**

```ts
// parse.ts (pure)
export type IntentTarget = { type: "hq" } | { type: "plaza" } | { type: "room"; buildingKey: string };
export type Intent =
  | { kind: "goto"; target: IntentTarget }
  | { kind: "emote"; emote: "dance" | "spin" | "cheer" | "wave" }
  | { kind: "say"; text: string };
export interface IntentContext {
  rooms: { buildingKey: string; name: string }[];
} // linked rooms: name = project name
export function parseIntent(text: string, ctx: IntentContext): Intent | null;
// Case-insensitive, trimmed. Patterns (document each with tests):
//   go to (the)? (headquarters|hq|home base) -> goto hq
//   go to (the)? plaza|center|fountain -> goto plaza
//   go to (the)? <name> -> goto room (name matched against ctx.rooms, case-insensitive substring; ambiguous -> null)
//   (do a |)?(dance|spin|cheer|wave)( for me)?! ? -> emote
//   come out|go outside -> goto plaza
// Anything else -> null. NO false positives on ordinary sentences ("let's go to production" must NOT match — require the message to BE the command, i.e. anchored, <= 6 words).

// interpret.ts — Haiku fallback over worldGenerateProp (cite flavor/engine.ts patterns):
export function buildInterpretPrompt(text: string, ctx: IntentContext): string;
// strict instruction: reply ONLY minified JSON {"action":"goto"|"emote"|"say"|"none", "target"?: "hq"|"plaza"|<room name>, "emote"?: ..., "text"?: string<=200}
export function parseInterpretReply(raw: string, ctx: IntentContext): Intent | null;
// tolerant JSON extraction (strip fences), validate against the catalog/emote union, "say" text sanitized (flavor sanitizeThought-style, clamp 200), "none"/invalid -> null.
export async function interpretIntent(text: string, ctx: IntentContext): Promise<Intent | null>;
// enabled/model from the flavor engine's settings (export the needed getters from flavor/engine.ts — one-line sanctioned edit), bumps the flavor runs counter on success, silent null on failure. In-flight guard: one at a time (module flag).
```

TDD: every parser pattern + anti-false-positive cases; prompt determinism; reply parsing (fenced JSON, bad action, unknown room, oversize text, error-ish); interpret wiring with mocked bindings.

---

### Task 2: Sim — command override + emote motions

**Files:** Modify `src/game/sim/sim.ts` (+sim.test.ts), `src/game/characters/pose.ts` (+pose test if exists), `src/game/characters/Characters.tsx` (motion rendering only if a new field is needed).

**Contracts:**

```ts
// sim.ts
export type SimCommand =
  | { kind: "goto"; x: number; z: number; holdTicks?: number }   // default 100 (10s)
  | { kind: "emote"; emote: "dance" | "spin" | "cheer" | "wave"; durTicks?: number }; // default 30 (3s)
export interface Sim { ...; command(key: string, cmd: SimCommand): void }
```

- `goto`: overrides current behavior — release nothing (desk claims KEPT — the bot returns), path to the point (nearestWalkable snap), motion "walk" then "stand" holding `holdTicks`, then resume normal status behavior (replan). A second command replaces the first. Sync/status change DURING an override: status recorded, override finishes first (document; except Ended — bot leaves).
- `emote`: new Motion variants in pose.ts — `dance` (bounce + alternating arms), `spin` (body yaw 2 turns), `cheer` (both arms up + hop), `wave` exists? (check pose.ts — waving is the WaitingForPermission raise-hand; reuse the arm mechanics for a friendlier wave). Emote plays in place for durTicks then resumes. While seated: bot stands at its seat, emotes, sits back.
- Determinism: commands are inputs like sync — same command stream ⇒ same world.

TDD: goto walks + holds + resumes (desk retained and re-seated); command replace; emote motion set + duration + resume; seated emote round-trip; determinism with interleaved commands.

---

### Task 3: Chat wiring — send interception, local notes, bubbles for say

**Files:** Modify `src/game/chat/use-chat-session.ts` (+test via chat-window.test.tsx), `src/game/chat/ChatWindow.tsx` (hint placeholder + local-note rendering already handles "note" lines), `src/game/chat/speech.ts` or `use-speech-bubbles.ts` (+test: a `pushLocalBubble(key, text)` path), `src/game/app/GameShell.tsx` / `src/game/characters/use-sim.ts` (expose `sim.command` to the chat layer — simplest: a module-level command bus `src/game/sim/command-bus.ts` (new, tiny): `postCommand(key, cmd)` + `drainCommands()` consumed by use-sim each frame before tick; document why (chat is outside the Canvas)).

**Behavior in `send(text)`:**

1. Build IntentContext from linked buildings (projects join — reuse the use-sim annotation helpers or a small selector; buildingKey = "plot:N" | placed id; goto target point = building door, hq → HQ interior center, plaza → ring point).
2. `parseIntent` hit → post command; append a local note line to the chat ("🏃 heading to <name>" / "💃 dancing"); push a small speech bubble ("On my way!"/emote emoji); playSfx("send"); DO NOT send to the session. Works for demo bots too (demo guard lifted for intents — the sim is real there).
3. Parser miss + live session → `commands.sendToSession` exactly as today.
4. Parser miss + NO live session (crew resting/demo/Ended) → `interpretIntent`: goto/emote → as (2); `say` → push speech bubble with the text + a bot chat line; null → note "…(scratches head)" locally. Errors silent → same note.
5. Composer placeholder gains a hint: `Message <name>… (try: "go to HQ", "dance")`.

Local chat lines: transcripts store is engine-backed — do NOT write into it; keep a per-chat LOCAL lines overlay in the game chat store (merge by seq: local lines get synthetic negative seqs or a side array appended at render — pick, document, test ordering).

TDD (mocked sim bus + bindings): command send does not hit sendToSession and posts the right command; live-session passthrough unchanged; crew "tell me a joke" → interpret say → bubble + line; ordering of local lines; demo goto works.

---

### Task 4: Finish — verify, changelog, final review, PR

- [ ] Full vitest + tsc + build; perf unchanged (no per-frame additions beyond the bus drain); controller visual pass: goto-HQ command live, dance emote, crew joke bubble (screenshots where headless allows; sim-level tests carry the rest).
- [ ] CHANGELOG. Final whole-branch review (most capable model), one fix wave. PR stacked. Linear close.

---

## Open decisions (defaults chosen)

1. **Command scope**: commands work on ALL bots incl. demo (default) — they're sim-level, free, and fun everywhere.
2. **"come here"**: deferred (needs camera-position → world math; plaza covers the demo). Listed as a follow-up, not in M7.
3. **Multi-bot broadcast** ("everyone dance"): deferred follow-up.
