# M9 — Bot Dossier (info panel + Haiku bio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (user, verbatim intent):** info on bots — a panel when clicked, with a bio written by Haiku and information about the bot; choose the available information that makes sense.

**Architecture:** Clicking a robot opens a game-styled **dossier card** (alongside chat/follow — composable, like M8). The card joins live data already in the stores: session meta (status + duration, model, project + linked room, git branch, usage totals, origin, parent/fork lineage, activity detail), agent binding (crew name/role, color, home project), and sim flavor (current motion — "currently: dancing"). The **bio** is a two-sentence personality blurb generated ONCE per bot by Haiku over the existing `worldGenerateProp` seam, persisted in the settings KV (`game.bio.<stable-key>`), with a 🔄 regenerate button; stable-key = agent id for crew, session id otherwise. Zero backend changes.

**Tech Stack:** unchanged; rides M7's flavor-engine getters (model/kill-switch) and M8's follow-cam (click composition).

## Global Constraints

- pnpm; colocated Vitest; `pnpm exec tsc --noEmit`; prettier fix-and-retry; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TypeScript strict; alias `@/`; NO src/panels imports in src/game.
- Bio cost discipline: generate only when the dossier opens AND no cached bio exists (or 🔄 pressed); one in-flight globally; `game.flavor.enabled` kill switch honored (card shows "—" when off); counts into the 💭 HUD counter; prompt inputs clamped (name 60, role/system-prompt excerpt 200).
- Bio persistence: settings KV `game.bio.<key>` (value = plain bio text ≤240 chars); defensive read; never regenerated silently.
- Formatting rules: durations humanized ("2h 14m"), token counts abbreviated ("128k in / 42k out"), cost only if `usage` carries it (check UsageTotals shape — bindings.ts).
- Branch: `feat/game-m9-dossier` cut from the M8 branch (stacked).

---

### Task 1: Dossier data join + bio engine (pure + store)

**Files:** Create `src/game/dossier/data.ts` (+data.test.ts), `bio.ts` (+bio.test.ts).

**Contracts:**

```ts
// data.ts (pure joins — inputs are store snapshots, NOT hooks)
export interface DossierInfo {
  key: string; name: string; color: string;
  status: SessionStatus | "resting"; statusSinceMs: number | null;
  model: string | null; origin: "Managed" | "External" | null;
  projectName: string | null; projectFolder: string | null; roomName: string | null;  // roomName = linked building's project name (same as projectName when seated) — drop if redundant, document
  gitBranch: string | null; activity: string | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null } | null; // adapt to real UsageTotals fields
  parentKey: string | null;   // forked-from
  agentRole: string | null;   // crew: agent name/role when bound
  motion: string | null;      // sim's current Motion kind, humanized ("dancing", "working at a desk")
}
export function buildDossier(key: string, snap: {...store snapshots...}): DossierInfo | null
export function humanizeDuration(ms: number): string
export function abbrevTokens(n: number): string

// bio.ts — KV-cached Haiku bio:
export const BIO_KEY_PREFIX = "game.bio.";
export function bioPrompt(info: DossierInfo): string   // "Write a playful 2-sentence bio for <name>, a robot ... personality hints from role/project. <=40 words. No quotes."
useBios: { bios: Record<string, string>; loading: string | null;
  ensure(info: DossierInfo): void;      // cached in state -> done; else KV read -> hit: cache; miss: generate via worldGenerateProp (flavor model/kill-switch getters from M7), sanitize (flavor-style, clamp 240), persist KV + state; failures silent (card shows placeholder)
  regenerate(info: DossierInfo): void;  // force a new generation + persist
}
```

TDD: join fields from fixture snapshots (live session w/ binding, external session, resting crew, forked session); humanize/abbrev cases; bio ensure (state hit / KV hit / generate / disabled / error) with mocked bindings; regenerate overwrites; prompt clamps.

---

### Task 2: The card + click wiring

**Files:** Create `src/game/dossier/DossierCard.tsx` (+dossier-card.test.tsx); modify `src/game/build/mode.ts` (+test — extend the ui-card union: `{ kind: "dossier"; key: string }` in the same slot as roomCard/hqCard, single-open semantics), `src/game/app/GameShell.tsx` (mount + bot-click wiring: clicking a robot opens chat + follow (M8) + dossier? NO — three at once is noisy. Default: robot click = chat + follow (existing); the dossier opens from an ℹ️ button in the CHAT WINDOW HEADER (+the HqCard crew roster rows). Document this composition), `src/game/chat/ChatWindow.tsx` (ℹ️ header button), `src/game/world/campus/HqCard.tsx` (roster rows clickable → dossier).

**Card layout (game-card style, HireDialog pattern):** header = color dot + name + status chip; bio paragraph (italic, placeholder "🤖 …" while loading, "—" when flavor disabled) + 🔄; info grid rows (only non-null): Model, Project (name + folder subtitle), Room, Branch, Activity, Usage, Origin, Forked from (click → that bot's dossier), Crew role, Currently (motion), Status since. Footer: [💬 Chat] [🎥 Follow] buttons (reuse existing opens; follow via M8 director).

TDD (jsdom, mocked stores): renders joined fields, hides null rows; bio loading→text; 🔄 calls regenerate; ℹ️ opens from chat header; roster row opens; footer buttons wired; mode transitions.

---

### Task 3: Finish — verify, changelog, final review, PR

- [ ] Full vitest + tsc + build; perf unchanged; controller pass: dossier over a live session (fields sane), crew bio generation + persistence across reload.
- [ ] CHANGELOG. Final whole-branch review (most capable model), one fix wave. PR stacked. Linear close.

---

## Open decisions (defaults chosen)

1. **Entry point**: robot click keeps opening chat+follow; the dossier opens from an ℹ️ in the chat header and from HQ roster rows (default). Alternative: robot click opens the dossier first with a Chat button inside.
2. **Bio identity**: keyed by agent id for crew (stable across sessions), session id otherwise (default).
3. **Info set v1** (default): model, project+folder, room, git branch, activity, usage tokens(+cost if present), origin, fork lineage, crew role, current motion, status-since. Deferred: per-bot session history timeline, meeting attendance.
