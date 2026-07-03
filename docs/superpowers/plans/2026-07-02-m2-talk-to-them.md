# M2 — Talk To Them Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full conversations with Claude Code threads without leaving the game idiom — click a robot, a game-styled chat rises; short replies appear as speech bubbles; permission/question prompts are "the robot asks you" cards; hire/link/adopt creates characters; each character has a voice-model picker.

**Architecture:** New `src/game/chat/` (HUD-level React over the canvas — NOT inside it — plus in-canvas speech bubbles) consuming the REAL data layer: `useTranscripts` store (items/order/pendingPermissions/pendingQuestions), `commands.sendToSession/spawnSession/respondToPermission/answerQuestion`, `useAgentsStore`/`useBindingsStore`. The old panels are copy-sources only (never imported): `use-bot-chat.ts` line helpers, `prompts/PermissionPrompt|QuestionPrompt` logic, `crew-status.ts agentSpawnSpec`, `HistoryFooter` take-over spec, `lib/speech.ts` bubble helpers.

**Tech Stack:** unchanged. No new dependencies.

## Global Constraints

- pnpm; colocated Vitest; typecheck `pnpm exec tsc --noEmit`; pre-commit prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict (exactOptionalPropertyTypes); alias `@/`.
- NO imports from `src/panels/**` (copy + cite source in a comment). Allowed imports: `@/stores/**`, `@/ipc/**`, `@/components/**` (Button, Card, ModelPicker, EmptyState, use-reduced-motion), `@/game/**`.
- Transcripts only flow after `startTranscriptStream()` (idempotent, `src/stores/transcripts.ts:238`); backfill per session via `useTranscripts.getState().openSession(sid)`.
- Key sessions by `sessionKey(id)` = `"provider:id"` everywhere (`@/stores/transcripts`).
- Voice model default for hire: keep the agent's `default_model ?? DEFAULT_MODEL` behavior from `agentSpawnSpec`; the hire dialog's ModelPicker overrides `spec.model` explicitly. (Spec says Sonnet-default for voice — the DIALOG defaults its picker to `"sonnet"`, but a saved agent default wins if the user doesn't touch the picker: initialize picker to `agent.default_model ?? "sonnet"`.)
- Game visual language: chunky rounded cards, character-color accents, backdrop-blur — match the HUD chips in `src/game/hud/HudOverlay.tsx`, not shadcn panel styling.
- Old panels/workspace remain untouched and functional.
- Branch: `feat/game-m2-chat` cut from `feat/game-m1-robots`.
- Reference map (verified 2026-07-02): sendToSession `bindings.ts:12`, spawnSession `:11`, SpawnSpec `:861`, respondToPermission `:13`, answerQuestion `:18`, addPermissionRule (see prompts/PermissionPrompt.tsx), PermissionRequest `:642`, PermissionResponse `:649`, QuestionRequest `:703`, QuestionResponse `:712`, TranscriptItem `:956`, Agent `:298`; transcripts store fns `openSession:135`, `resolvePrompt:198`, `startTranscriptStream:238`; hire spec `panels/crew/crew-status.ts:32`; take-over `panels/chat/HistoryFooter.tsx:14,43`; bubbles `panels/world/lib/speech.ts:24` + `use-speech-bubbles.ts`; line helpers `panels/world/use-bot-chat.ts:19,25`.

### M1 carry-over touchups (fold into whichever task touches the file first, else Task 6)

- Extract shared `src/game/sim/rand.ts` (mulberry32 + hashCode) — dedupe copies in `sim.ts`, `layout.ts`.
- `characters.smoke.test.tsx`: tighten bulb assertion to per-bot colors.
- `sim/characters.test.ts`: add stale-parent-name regression test.

---

### Task 1: Chat lines + open-chats store (pure data layer)

**Files:** Create `src/game/chat/lines.ts`, `lines.test.ts`, `store.ts`, `store.test.ts`.

**Interfaces:**

- `interface ChatLine { seq: number; who: "user" | "bot" | "note"; text: string; ts: number | null }`
- `chatLinesFrom(items: Map<number, TranscriptItem>, order: number[]): ChatLine[]` — UserText→user, AssistantText→bot, SystemNote→note; trims/flattens whitespace, clamps 600 chars (port `chatLine`/`linesFromItems` semantics from `use-bot-chat.ts:19-38`, but seq-keyed from the real store shape). Skips Thinking/ToolUse/etc.
- `interface OpenChat { key: string; min: boolean }` ; zustand `useGameChats { chats: OpenChat[]; open(key): void; close(key): void; setMin(key, min): void; raise(key): void }` — port of `use-world-chats.ts` minus the seed-line concept (real transcripts replace it). Max 3 open, oldest auto-closes (test).

**Steps:** failing tests (line mapping incl. clamp + skip kinds; store open/dedupe/raise/max-3/close) → implement → `pnpm exec vitest run src/game/chat` → commit `feat(game): chat lines + open-chats store`.

---

### Task 2: Speech bubbles over robots

**Files:** Create `src/game/chat/speech.ts`, `speech.test.ts`, `use-speech-bubbles.ts`, `SpeechBubble.tsx`; modify `src/game/characters/Characters.tsx` (render bubble per actor).

**Interfaces:**

- Copy `speechFromEvent(ev, now)` + `SpeechMap` + TTL pruning from `panels/world/lib/speech.ts` (pure; cite source). Tests ported/adapted.
- `useGameSpeechBubbles(): SpeechMap` — copy of `panels/world/use-speech-bubbles.ts` subscription (its own `onEngineEvent` — independent of the transcript store), 1s prune.
- `SpeechBubble({ text }: { text: string })` — in-canvas: `Billboard` at y≈2.7 with a rounded-plane backdrop + `Text` (fontSize 0.24, maxWidth 3.4, dark text on `#ffffffee`), inside its own `<Suspense fallback={null}>` (M1 lesson: troika fonts suspend).
- Characters.tsx: thread `speech: SpeechMap` down (prop from a hook call in `Characters`) — actor renders `{speech[key] && <SpeechBubble text={...} />}`.

**Steps:** tests for pure speech.ts → implement → smoke: characters smoke test extended with a mocked engine-event bubble OR (if event mocking is heavy) a direct `<SpeechBubble>` mount assertion — document choice → verify `pnpm exec vitest run src/game` → commit `feat(game): speech bubbles — assistant lines float over robots`.

---

### Task 3: Diegetic chat window + click-to-open

**Files:** Create `src/game/chat/ChatWindow.tsx`, `ChatWindows.tsx` (host mapping `useGameChats` → windows), `use-chat-session.ts`; modify `src/game/characters/Characters.tsx` (robot click), `src/game/app/GameShell.tsx` (mount host + selection wiring).

**Interfaces:**

- `use-chat-session.ts`: `useChatSession(key: string)` → `{ lines: ChatLine[]; status: SessionStatus | undefined; send(text): Promise<void>; pending: { permissions: PermissionRequest[]; questions: QuestionRequest[] } }`. Internals: `startTranscriptStream()` once on mount; parse `key` → SessionId (`provider:id` split — first `:` only); `openSession(sid)` on mount; read `useTranscripts((s) => s.sessions[key])`; `chatLinesFrom(t.items, t.order)`; `send` = `commands.sendToSession(sid, text)` (no optimistic echo — engine echoes UserText within ~100ms; simpler and dedupe-free; note this differs from the old panel).
- `ChatWindow({ chatKey, name, color, status, onClose, onMinimize, minimized, stackIndex })` — fixed-position game card bottom-right, stacked by index; header (color dot, name, status glyph, ModelHint later), body = scrollable line list (user right-aligned bubbles, bot left, notes centered small), footer composer (`<input>` + send Button, Enter submits, disabled while `status === "Ended"`). Chunky game styling per Global Constraints. Minimized → circular avatar bubble.
- Robot click: in `CharacterActor`'s group add `onClick={(e) => { e.stopPropagation(); onSelect(botKey) }}` (R3F pointer events already work on meshes); `Characters` gains `onSelect?: (key: string) => void`; GameShell wires `onSelect={(k) => useGameChats.getState().open(k)}` and renders `<ChatWindows />` as an HTML sibling of the canvas.
- Resting crew bots (`agent:` prefix keys, no session) — clicking opens the HIRE dialog instead (Task 5); until Task 5 lands, clicking them is a no-op (guard on key prefix, comment pointing at T5).

**Steps:** window renders lines from a mocked store (jsdom test with mocked `@/stores/transcripts` + `@/ipc/bindings`); send calls sendToSession with parsed id (assert mock); Enter key works → implement → visual check deferred to controller → `pnpm exec vitest run src/game` + tsc → commit `feat(game): diegetic chat window — click a robot, talk to its thread`.

---

### Task 4: "The robot asks you" — permission & question cards

**Files:** Create `src/game/chat/PermissionCard.tsx`, `QuestionCard.tsx`, `prompt-cards.test.tsx`; modify `ChatWindow.tsx` (render pending cards above composer).

**Interfaces:**

- Port LOGIC from `panels/chat/prompts/PermissionPrompt.tsx` + `QuestionPrompt.tsx` (cite): PermissionCard shows tool + pretty input summary, buttons Allow once / Always allow (writes `commands.addPermissionRule({ agent_id, tool_pattern: tool })` first — agent_id from the character's binding if any, else skip the Always button) / Deny (optional reason input); on answer → `commands.respondToPermission(sid, request_id, response)` → `useTranscripts.getState().resolvePrompt(sid, request_id, receiptText)`.
- QuestionCard: options as chunky buttons (multi_select → toggle list + confirm) → `commands.answerQuestion(sid, { request_id, answers })` → `resolvePrompt`.
- Game framing: card headed by "🤖 {name} asks:" with the character color as border accent.
- ChatWindow renders `pending.permissions.map(...)` + `pending.questions.map(...)` between lines and composer. ALSO: minimized chat bubble + robot HUD get an attention ping when pending exists (red dot) — minimized bubble only for M2; in-world "!" is already conveyed by raise-hand.

**Steps:** jsdom tests with mocked bindings + transcripts store: allow-once flow calls respondToPermission with `{kind:"AllowOnce"}` then resolvePrompt; deny sends message; always-allow writes rule first; question single + multi flows → implement → commit `feat(game): permission and question prompts as robot-asks-you cards`.

---

### Task 5: Hire / link / adopt + voice-model picker

**Files:** Create `src/game/chat/HireDialog.tsx`, `hire.ts`, `hire.test.ts`; modify `src/game/hud/HudOverlay.tsx` (`+ Hire` button), `src/game/app/GameShell.tsx` (dialog state), `src/game/characters/Characters.tsx` (crew-bot click → hire dialog for that agent).

**Interfaces (pure logic in `hire.ts`, UI thin):**

- `buildHireSpec(agent: Agent, opts: { model: ModelTierId; prompt: string | null }): SpawnSpec | { error: string }` — port `agentSpawnSpec` (crew-status.ts:32, cite) with model override.
- `buildAdoptSpec(meta: SessionMeta, opts: { model: ModelTierId; fork: boolean }): SpawnSpec` — port HistoryFooter `go()` (resume_session = old id; take-over fork:false / fresh-fork fork:true) + `canTakeOver(meta)` predicate.
- `hireAgent(agent, opts)` → getSpawnProvider → spawnSession → `useBindingsStore.getState().upsert({ session_id, agent_id: agent.id, room_id: null, display_name: null, pinned: false })` → returns new SessionId; open its chat (`useGameChats.open(sessionKey(sid))`).
- `HireDialog`: HTML overlay (game-styled Card) with two tabs — **Hire crew** (agent list from `useAgentsStore`; ModelPicker initialized `agent.default_model ?? "sonnet"`; optional first-message input; Hire button) and **Adopt session** (recent list from `useSessionsView()` where `canTakeOver(meta)` OR live-External → live ones just open chat (link), settled ones offer Take over / Fork via buildAdoptSpec). Errors (missing project_path) shown inline.
- HUD: `+ Hire` chip opens the dialog.

**Steps:** unit tests for buildHireSpec (model override, error on missing project_path), buildAdoptSpec (take-over vs fork flags), canTakeOver port → jsdom test: hire flow calls spawnSession + upsert + opens chat (mocked bindings/stores) → implement UI → commit `feat(game): hire, link and adopt — characters from new or existing threads`.

---

### Task 6: Polish — selection focus, M1 touchups, demo chat

**Files:** Modify `src/game/engine/camera/GameCameraRig.tsx` + `rts-camera.ts` (optional focus), `src/game/characters/Characters.tsx`, `src/game/sim/rand.ts` (new shared), `sim.ts`, `world/campus/layout.ts`, tests listed in carry-overs.

**Interfaces:**

- `rts-camera.ts`: `focusOn(cam: RtsCamera, x: number, z: number): RtsCamera` (returns cam with target moved to x,z — pure, tested). Rig accepts `focus?: {x,z} | null` prop; when set, goal target damps there once (then user input takes back over — clearing focus on first pan/rotate input).
- GameShell: opening a chat focuses its robot once.
- M1 carry-overs (rand.ts extraction + the two test tightenings) land here if not already done.
- Demo mode: clicking demo robots opens the chat window shell (transcript empty, composer disabled with a "demo thread" note) so the visual pass can verify the diegetic UI without Tauri.

**Steps:** focusOn test → implement → carry-over tests → full `pnpm exec vitest run src/game` + tsc → commit `feat(game): chat focus, shared rand, M1 test touchups`.

---

### Task 7: Finish — verification, CHANGELOG, final review, PR

- [ ] Full suite + tsc + `pnpm build`.
- [ ] Controller visual pass (headless screenshots, `?game&demo`): chat window opens on robot click, styling reads as game UI, bubbles render, hire dialog opens; fix-loop small visual nits.
- [ ] Real-session pass: `pnpm tauri dev` — send a message to a live/fake-claude session from the game chat, watch the echo + reply; permission card round-trip if obtainable.
- [ ] CHANGELOG Unreleased entry (M2 "Talk to them" — EKI-15x).
- [ ] Final whole-branch review (most capable model) with minors triage; ONE fix wave if findings.
- [ ] PR `feat/game-m2-chat` → main (or stacked on the M1 PR if it hasn't merged); close Linear.
