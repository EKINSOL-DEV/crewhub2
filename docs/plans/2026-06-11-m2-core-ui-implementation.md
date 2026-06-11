# M2 — Core UI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily-drivable cockpit that replaces terminal tabs for solo Claude Code work: one workspace shell (tabs → split tree → panels), a full-fidelity chat panel driven by the M1 engine, crew/agent management, and live sessions/activity/history panels. M2 ends at the **dogfood gate** — the author runs their real Claude Code work inside CrewHub v2, every day, by choice.

**Architecture:** Everything renders inside a single workspace shell (master plan §4.2 D6 — one UI shell, three was too many). The shell is data-driven: a panel registry describes every panel once; the layout tree, command palette, keyboard map, and empty states all consume it. Panels talk to the engine exclusively through generated bindings (`src/ipc/bindings.ts`) and Zustand stores fed by the `EngineEvent`/`DomainEvent` streams. The throwaway `src/panels/debug/` from M1 dies at the end of this milestone. Two standing principles apply to every task: **playfulness is a core product value** (§1 D-M2-6 names the touches — they are ACs, not garnish) and **haiku-default / model-adaptive** (§1 D-M2-7).

**Tech Stack additions (frontend only — Rust adds no new crates):** `@tanstack/react-virtual` (chat virtualization) · `cmdk` (command palette) · `react-markdown` + `remark-gfm` + `shiki` (markdown/code, lazy-loaded) · `motion` (micro-animations) · `tauri-plugin-clipboard-manager` + `tauri-plugin-shell` (handoff, Rust-side only).

**Linear mapping:** Epic 9 Workspace Shell = EKI-7 (9.1 EKI-11 L, 9.2 EKI-16 M, 9.3 EKI-20 M, 9.4 EKI-22 S) · Epic 10 Crew & Agents = EKI-27 (10.1 EKI-32 L, 10.2 EKI-36 M, 10.3 EKI-40 M) · Epic 11 Chat = EKI-43 (11.1 EKI-49 L, 11.2 EKI-52 M, 11.3 EKI-58 M, 11.4 EKI-60 M, 11.5 EKI-64 S) · Epic 12 Sessions & Activity = EKI-70 (12.1 EKI-74 M, 12.2 EKI-76 M, 12.3 EKI-78 M, 12.4 EKI-80 S) · chore EKI-109 (route history/MCP IPC via provider registry).

**Diagram:** `docs/plans/2026-06-11-m2-core-ui.drawio` (page 1: UI architecture; page 2: task graph with lane assignments).

**Grounding:** Current IPC surface audited against `src/ipc/bindings.ts` + `src-tauri/src/ipc/mod.rs` on 2026-06-11 (M0+M1 merged to `main`). The gaps in §2 are real holes found in that audit, not hypotheticals. v1 UX wisdom sourced from `crewhub/frontend/src/components/zen/` (panel registry, split-tree layout, keyboard map) and `crewhub/frontend/src/components/chat/ChatMessageBubble.tsx` (958 lines of hand-rolled markdown — the lesson is in D-M2-5).

---

## 1. Design decisions (made now, argued here, binding for the milestone)

### D-M2-1 — Layout model: workspace tabs → binary split tree → leaf panels

v1's zen layout proved the model: a `LayoutNode` is either a `leaf` (one panel) or a `split` (direction + ratio + exactly two children). Binary splits keep resize math, keyboard navigation, and persistence trivial; arbitrary N-way grids are a v1 non-lesson (nobody used them). _Alternative considered:_ `react-resizable-panels` or golden-layout — both impose their own state model and fight tab-level persistence; our tree is ~150 lines of pure functions that we can unit-test exhaustively. We port the v1 **concept** (`useZenLayout.ts`), not the code.

```ts
// src/app/layout-tree.ts — pure data + pure functions, no React
export type PanelKind = "chat" | "sessions" | "activity" | "history" | "crew" | "settings" | "welcome";

export type LayoutNode =
  | {
      type: "leaf";
      id: string; // stable uuid — focus/maximize target
      kind: PanelKind;
      params?: Record<string, string>; // e.g. { sessionId } for chat
    }
  | {
      type: "split";
      id: string;
      dir: "row" | "col";
      ratio: number; // 0.1..0.9, first child's share
      a: LayoutNode;
      b: LayoutNode;
    };

export interface WorkspaceTab {
  id: string;
  name: string; // user-editable; default = preset name
  root: LayoutNode;
  projectFilter: string | null; // project id — EKI-22, persisted per tab
}

// Pure ops (each ≤15 lines, each unit-tested):
// splitLeaf(root, leafId, dir, newKind) / closeLeaf / setRatio /
// swapLeaves / findLeaf / leaves(root) / replaceKind
```

**Persistence shape:** one settings key per concern, via the existing `get_setting`/`set_setting` KV (no new tables): `workspace.tabs` = `WorkspaceTab[]` JSON, `workspace.active_tab` = tab id, `workspace.presets` = named `LayoutNode` templates (ships with `focus` chat-only, `cockpit` chat|sessions/activity, `monitor` sessions|activity). Writes debounced 500 ms; corrupted JSON → fall back to default preset, never crash (test).

### D-M2-2 — Panel registry: one data structure, four consumers

The registry is the v1 idea kept whole: command palette, empty-panel picker, keyboard shortcuts, and the layout renderer all read it; adding a panel in M3+ (kanban, docs, world3d) is one entry + one lazy component.

```ts
// src/app/panel-registry.tsx
export interface PanelDefinition {
  kind: PanelKind;
  label: string;
  emoji: string; // playfulness: every panel has a face, e.g. "💬"
  description: string;
  keywords: string[]; // palette fuzzy search
  shortcutHint?: string; // single key inside the empty-panel picker
  component: React.LazyExoticComponent<React.ComponentType<PanelProps>>;
  emptyState: { emoji: string; title: string; hint: string }; // D-M2-6 names
}
export interface PanelProps {
  leafId: string;
  params: Record<string, string>;
  setParams: (p: Record<string, string>) => void; // persists into the tree
}
export const PANELS: Record<PanelKind, PanelDefinition> = {
  /* … */
};
```

### D-M2-3 — Full session history: `get_session_transcript` + the seq stitch contract

The watcher deliberately suppresses history on discovery (`watcher.rs:319` — "history is loaded on demand") and only streams _new_ items. The chat panel therefore needs a read-the-past command. Crucially, the watcher's `Item.seq` is already the **absolute item index from the start of the transcript file** (first parse reads from byte 0; `entry.seq` accumulates across the suppressed initial batch). We make that the contract instead of fighting it:

```rust
// engine/provider.rs — new trait method (default impl returns Unsupported)
async fn read_transcript(&self, id: &SessionId, offset: u64, limit: u32)
    -> anyhow::Result<TranscriptPage>;

// engine/types.rs
#[derive(Serialize, Deserialize, specta::Type)]
pub struct TranscriptPage {
    pub items: Vec<SeqItem>,     // SeqItem { seq: u64, item: TranscriptItem }
    pub total: u64,              // items currently in the file
}
// ipc: get_session_transcript(id, offset, limit) -> TranscriptPage
```

Claude impl reuses `transcript.rs::parse_line` over the JSONL on disk (path resolved the way `history.rs::transcript_path` already does), counting items exactly like the watcher does — **one parser, one numbering** (engine test asserts watcher-seq ↔ page-seq parity on a fixture). Frontend: the per-session transcript store is a sparse `Map<seq, TranscriptItem>` + a sorted index; live `Item` events and history pages merge by seq with zero dedup logic. Chat opens with the newest page (`offset = max(0, total - 200)`), older pages load on scroll-up. _Alternative considered:_ emit full history as events on demand — rejected: floods the broadcast channel every other consumer shares.

### D-M2-4 — Virtualization: `@tanstack/react-virtual`, dynamic heights, stick-to-bottom

The 60 fps / 5k-item AC (EKI-49) rules out naive rendering. Choice: **TanStack Virtual** — headless (our markup, our theme vars), `measureElement` handles variable-height markdown/tool items, tiny (~4 kB), and pairs with the TanStack stack the master plan already names. _Alternatives:_ `react-virtuoso` has chat niceties (followOutput) built in but is heavier and styles-opinionated; hand-rolling windowing under variable heights + streaming appends is a known multi-week tarpit. We hand-roll only the two chat-specific behaviors on top: **stick-to-bottom** (pin while `scrollBottom < 80px`; a playful "⬇ new stuff" pill otherwise) and **prepend-without-jump** (anchor scroll offset around `scrollHeight` delta when an older page arrives). Budget enforcement: a dev-only `?perf` route mounts a synthetic 5k-item transcript fixture; an E2E probe scrolls it and asserts frame time p95 < 16.7 ms via CDP tracing (non-blocking CI job, same spirit as M1's `#[ignore]` perf tests).

### D-M2-5 — Transcript-item rendering: one mapping table, library markdown

v1's `ChatMessageBubble.tsx` is 958 lines because it hand-rolled markdown, sanitization, and media handling. Lessons ported; implementation not. v2 uses `react-markdown` + `remark-gfm` (no raw HTML — sanitization by construction) with `shiki` syntax highlighting lazy-loaded per language. Every `TranscriptItem.kind` maps to exactly one renderer component:

```tsx
// src/panels/chat/items/index.tsx — the renderer mapping (EKI-49 core)
export const ITEM_RENDERERS: Record<TranscriptItem["kind"], React.ComponentType<ItemProps>> = {
  UserText: UserBubble, //  right-aligned, markdown
  AssistantText: AssistantBubble, //  markdown + code blocks (shiki)
  Thinking: ThinkingBlock, //  collapsed >500 chars; redacted ⇒ "🔒 thinking privately…" placeholder
  ToolUse: ToolCallCard, //  foldable input, per-tool emoji chip (D-M2-6)
  ToolResult: ToolCallCard, //  joined to its ToolUse by tool_use_id; error ⇒ red edge
  Image: ImageItem, //  thumbnail + lightbox (media_type only in M2 — see §2 gap G8)
  SystemNote: SystemRow, //  dim single line
  Usage: null as never, //  folded into the session meta strip, not rendered inline
  Unknown: UnknownRow, //  "🤷 unsupported item (raw_type)" — never crash (M1 contract)
};
```

Subagent grouping (v1 lesson: readable names, never `parent=`): items from child sessions render as a collapsible inline group titled by the child's humanized name (lineage already resolved by the M1 parser).

### D-M2-6 — Playfulness inventory (named, concrete, per panel — these are ACs)

| Name                | Where              | What                                                                                                                                                                                                                                 |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status Critters** | crew bar, sessions | status emoji set: Working `🔨` (subtle 1 s wiggle via `motion`), WaitingForInput `💬` , WaitingForPermission `🙋` (gentle bounce — the #1 "look at me" signal), Idle `😴`, Ended `🪦`                                                |
| **Pop-in**          | crew bar, sessions | newly spawned/discovered sessions scale-spring in (motion, 250 ms); killed sessions fade-shrink                                                                                                                                      |
| **Tool Chips**      | chat               | per-tool emoji on tool cards: Read `📖`, Edit/Write `✏️`, Bash `💻`, Grep/Glob `🔎`, WebFetch `🌐`, mcp\_\_crewhub `🏠`, fallback `🛠️`                                                                                               |
| **Quiet Office**    | empty states       | per-panel friendly empty states from the registry: chat "💤 Nobody's talking yet — summon a crew member", sessions "🏢 The office is quiet", activity "🍃 All calm", history "🗄️ No past lives yet", crew "🧑‍🚀 Hire your first agent" |
| **Typing Bot**      | chat               | while `status == Working` with no streaming text yet: animated `●●●` ellipsis with the agent's emoji avatar                                                                                                                          |
| **Confetti Hire**   | agent editor       | creating an agent fires a 1 s confetti burst (CSS only, respects `prefers-reduced-motion`)                                                                                                                                           |
| **Palette wink**    | command palette    | empty-query footer rotates playful hints ("try: spawn a scout 🔭")                                                                                                                                                                   |

All animations respect `prefers-reduced-motion` (test: media-query mock renders static variants).

### D-M2-7 — Model-adaptive UI: haiku-default, cost hints

One shared `ModelPicker` component (used by agent editor, spawn dialog, take-over dialog): tiers rendered with cost glyphs — haiku `$` "thrifty", sonnet `$$`, opus `$$$` — plus a one-line hint ("haiku is great for quick tasks"). Defaults: **quick spawns** (palette "Spawn session", composer-initiated one-offs) default to haiku; **agent-bound spawns** use `agent.default_model` (agent editor's model field itself defaults to haiku for new agents). Setting `model.default_spawn` (settings UI, EKI-20) overrides the global default. Nothing hardcodes an expensive model; the picker never hides the choice.

### D-M2-8 — Handoff security: Rust-side shell, explicit capability register update

EKI-80 ("open in Terminal/VS Code") is the first feature needing `shell`. Per master plan §5.2 the webview gets **no raw shell**: a typed Rust command `handoff(project_path, target)` validates `project_path` against `security::paths`, maps `target` (enum: `Terminal | Iterm | Warp | Vscode | RevealInFinder`) to a fixed argv (`open -a <app> <path>` on macOS), and executes via `tauri-plugin-shell` from Rust. **Capability-register update (explicit):** `src-tauri/capabilities/main.json` gains only the new IPC command identifiers + `clipboard-manager:allow-write-text` (for "copy path" / "copy `claude --resume <id>`"); `shell` permissions are NOT granted to the webview at all — the plugin is invoked Rust-side only. Each added permission gets its one-line justification in `src-tauri/capabilities/README.md` (M0 Epic 2 rule).

---

## 2. Current IPC surface — audit & gaps (what Lane 0 must add)

What exists and is sufficient: `listAllSessions`, `providerCaps`, `spawnSession` (incl. resume/fork/model/append_system_prompt), `sendToSession`, `respondToPermission`, `interruptSession`, `killSession`, `searchTranscripts`, agents/projects/rooms/tasks/settings CRUD, `mcpStatus`/enable/disable, `EngineEvent` + `DomainEvent` streams.

Gaps found (each becomes a Lane-0 task step):

| #   | Gap                                                                                                                                                                                                                                               | Blocks     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| G1  | **No `answer_question` IPC command.** `SessionProvider::answer_question` exists and `SessionEvent::Question` is emitted, but no tauri command / binding exposes it — questions and plan approvals are currently unanswerable from the UI          | EKI-58     |
| G2  | **No transcript read command.** Watcher streams only new items (`watcher.rs:319`); chat cannot load history. Need `get_session_transcript(id, offset, limit)` (D-M2-3)                                                                            | EKI-49/60  |
| G3  | **No `session_bindings` access.** Table exists since M0 (`001_init.sql`) but there is no store module and no IPC — bindings, display names, pinning are unreachable                                                                               | EKI-40/36  |
| G4  | **No permission-rule list/revoke IPC.** `engine/rules.rs` matching exists (settings key `perm.rules`) but the M1 AC "listable/revocable via IPC" shipped as raw KV only; settings UI needs typed `list_permission_rules`/`revoke_permission_rule` | EKI-20     |
| G5  | **No handoff commands; capability file is `core:default` only.** D-M2-8                                                                                                                                                                           | EKI-80     |
| G6  | **`list_archived_sessions` takes no filter** and `ipc/mod.rs:219` carries the `TODO(M1-T9)` — history/MCP IPC reach into `engine::claude` directly. EKI-109 fixes routing + adds `project_path?` filter                                           | EKI-78/109 |
| G7  | **Checkpoints invisible.** Parser skips `file-history-snapshot` lines (`transcript.rs:39`); EKI-64 needs `TranscriptItem::Checkpoint { id, ts }`                                                                                                  | EKI-64     |
| G8  | **No slash-command/skill listing.** EKI-52 AC wants composer hints from the project's `.claude/commands`/skills — needs `list_slash_commands(project_path)` (path-policy-checked)                                                                 | EKI-52     |
| G9  | **No CLAUDE.md materialization command.** EKI-32 AC offers writing a fenced persona block into the project's `CLAUDE.md` — reuse the hooks-installer fencing approach                                                                             | EKI-32     |

`SessionMeta` has no `agent_id` — by design (engine stays CrewHub-agnostic). The UI joins `session_bindings` ↔ `SessionMeta` by session id in the sessions store; no engine change.

---

## 3. Cross-cutting test strategy

1. **Pure-function-first UI.** Layout tree ops, transcript stitch buffer, palette action filtering, status-emoji mapping are plain TS modules with exhaustive vitest coverage _before_ components mount them (same TDD discipline as M1's Rust modules).
2. **Mocked bindings, real stores.** Component tests mock `@/ipc/bindings` (the M0 pattern in `src/test/`) and drive stores by emitting fake `EngineEvent`s; every panel gets at least: renders-empty-state, renders-data, reacts-to-event tests. The v1 "stuck loading state" activity bug ships as a named regression test (EKI-76 AC).
3. **Rust additions are M1-style.** New commands tested against `StubProvider`/fixtures (`ipc/mod.rs` tests pattern); `read_transcript` gets the watcher-parity fixture test (D-M2-3).
4. **E2E happy path grows** (existing WDIO harness): boot → shell renders default preset → palette opens chat → spawn against fake-claude → streamed reply visible → permission prompt answered inline → session visible in sessions panel. This becomes the M2 release gate.
5. **Perf probes:** the `?perf` 5k-item route (D-M2-4) + an idle-CPU spot-check with 10 watched sessions (budget from master plan §7).

---

## 4. File structure (locked in)

```
crewhub2/
├── src-tauri/src/
│   ├── ipc/mod.rs                 # T1–T5: new commands (G1–G9); stays provider-neutral after T1
│   ├── engine/
│   │   ├── provider.rs            # T2: read_transcript trait method
│   │   ├── types.rs               # T2: TranscriptPage/SeqItem; T2: Checkpoint item
│   │   └── claude/{mod,transcript,history}.rs   # T2: impl + checkpoint mapping
│   ├── store/session_bindings.rs  # T4: NEW store module (table exists)
│   ├── workspace/handoff.rs       # T5: NEW — target→argv mapping + path policy
│   └── capabilities/main.json     # T5: clipboard + new command identifiers (D-M2-8)
│       capabilities/settings.json # T10: NEW — settings window capability
├── src/
│   ├── app/                       # Lane A owns src/app/** exclusively
│   │   ├── layout-tree.ts         # T6: pure tree model (D-M2-1)
│   │   ├── panel-registry.tsx     # T7: D-M2-2
│   │   ├── WorkspaceShell.tsx     # T7/T8: tabs, splitters, panel chrome, drag
│   │   ├── CommandPalette.tsx     # T9 (cmdk)
│   │   └── keymap.ts              # T8: v1 zen map ported (Ctrl+K, Ctrl+1..9, Ctrl+\ …)
│   ├── stores/                    # ownership: workspace/palette=A · transcripts=B · sessions/bindings/activity=C
│   │   ├── workspace.ts  palette.ts  settings.ts(extended)
│   │   ├── transcripts.ts         # T12: sparse seq buffer (D-M2-3)
│   │   └── sessions.ts  bindings.ts  activity.ts
│   ├── panels/
│   │   ├── chat/                  # Lane B owns src/panels/chat/** exclusively
│   │   │   ├── ChatPanel.tsx  Composer.tsx  VirtualTranscript.tsx
│   │   │   ├── items/             # D-M2-5 renderer per TranscriptItem kind
│   │   │   └── prompts/           # T15: PermissionPrompt, QuestionPrompt, PlanApproval
│   │   ├── sessions/  activity/  history/        # Lane C
│   │   ├── crew/                  # Lane C: CrewBar, AgentCard, AgentEditor, PersonaComposer
│   │   └── settings/              # Lane A: theme/density/font, model defaults, perm rules
│   ├── components/{ModelPicker,EmptyState,StatusEmoji,Markdown}.tsx   # shared, Lane A seeds
│   └── theme/themes.ts            # T10: +6 ported v1 themes (9 total)
└── src/panels/debug/              # DELETED in T25
```

---

## Lane 0 — IPC additions (sequential, first; owns `src-tauri/**` + regenerated bindings)

### Task 1: EKI-109 — provider-routed history/MCP IPC + filters (S)

- [ ] Move `list_archived_sessions`/`search_transcripts` behind the provider seam: add trait methods (`list_archived(filter)` / `search(query)`) with default `Unsupported`; `ClaudeCodeProvider` implements by delegating to `engine/claude/history.rs`; `ipc/mod.rs` routes via `ProviderRegistry` — the `TODO(M1-T9)` comment and the `ClaudeConfig` states leave `ipc/mod.rs`. Add `project_path: Option<String>` filter to `list_archived_sessions`.
- [ ] Naming-firewall grep (M1 §1 rule) re-run as a test of done: `ipc/mod.rs` contains no `engine::claude` paths except MCP registration (which keeps its documented exception or moves behind a small `McpRegistrar` trait — decide in PR, one paragraph).
- [ ] AC (EKI-109): commands behave identically from the UI; bindings regenerate with only the new filter param; firewall grep clean; commit.

### Task 2: `get_session_transcript` + checkpoint items (M) — unblocks EKI-49/60/64

- [ ] TDD `engine/types.rs`: `TranscriptPage { items: Vec<SeqItem>, total: u64 }`, `SeqItem { seq, item }`; new `TranscriptItem::Checkpoint { id: String, ts: i64 }` mapped from `file-history-snapshot` lines (today skipped at `transcript.rs:39`); update fixtures test expectations (Unknown count stays 0).
- [ ] `provider.rs`: `read_transcript(&self, id, offset, limit) -> Result<TranscriptPage>`; Claude impl streams the JSONL once, counts items with the **same numbering as the watcher** (D-M2-3), returns the `[offset, offset+limit)` window + `total`.
- [ ] Parity test: feed a fixture through the watcher (temp-dir harness from M1 T5) and through `read_transcript`; assert identical `(seq, item)` pairs.
- [ ] IPC `get_session_transcript(id, offset, limit)`; regenerate bindings; commit.

### Task 3: `answer_question` + permission-rule IPC (S) — G1/G4, unblocks EKI-58/20

- [ ] IPC `answer_question(id: SessionId, response: QuestionResponse)` routing via registry (trait method already exists — this is plumbing + bindings only). StubProvider test.
- [ ] IPC `list_permission_rules() -> Vec<PermissionRule>` / `add_permission_rule(rule)` / `revoke_permission_rule(index)` wrapping the `perm.rules` settings JSON with validation (reject empty pattern); emits `SettingChanged`. Unit tests; commit.

### Task 4: session-bindings store + IPC (S) — G3, unblocks EKI-40/36

- [ ] `store/session_bindings.rs` (table exists since M0): `get(session_id)`, `upsert(SessionBinding { session_id, agent_id?, room_id?, display_name?, pinned })`, `list()`, `delete(session_id)`; unit tests (in-memory store pattern).
- [ ] IPC `list_session_bindings` / `upsert_session_binding` / `delete_session_binding`; `DomainEvent::SessionBindingChanged { session_id }` added; bindings regenerated; commit.

### Task 5: handoff + slash-commands + persona materialization (M) — G5/G8/G9

- [ ] `workspace/handoff.rs`: `HandoffTarget` enum → fixed argv (`open -a Terminal <path>` etc.); path validated by `security::paths`; executed via `tauri-plugin-shell` **Rust-side**. IPC `handoff(project_path, target)` + `handoff_targets()` (detect installed apps: `Terminal` always, iTerm/Warp/VS Code by bundle presence). Tests: path-policy rejection (`../`), argv snapshot per target.
- [ ] IPC `list_slash_commands(project_path) -> Vec<SlashCommand { name, description? }>`: reads `.claude/commands/*.md` + `~/.claude/commands` (path-policy-checked, read-only). Fixture-dir test.
- [ ] IPC `materialize_persona(project_id, content)`: writes/updates a fenced `<!-- crewhub:persona:start -->` block in the project's `CLAUDE.md`, reusing the hooks-installer fencing discipline (idempotent; removal restores user content byte-identical — round-trip test).
- [ ] **Capability register (explicit, D-M2-8):** add new command identifiers + `clipboard-manager:allow-write-text` to `capabilities/main.json`; NO shell permission in the webview capability; one-line justification per permission in `capabilities/README.md`; commit.

## Lane A — Shell, palette, theming, filter (owns `src/app/**`, `src/stores/{workspace,palette}.ts`, `src/theme/**`, `src/components/*` seeds, `src/panels/settings/**`)

### Task 6: Layout tree model + workspace store (part 1 of EKI-11, M)

- [ ] TDD `src/app/layout-tree.ts` pure ops (D-M2-1 sketch verbatim): split/close/ratio/swap/find/leaves/replaceKind; closing the last leaf yields a `welcome` leaf, never an empty tree; ratios clamped 0.1–0.9.
- [ ] `stores/workspace.ts` (zustand): tabs CRUD, active tab, focused leaf, maximized leaf; persistence to `workspace.*` settings keys (debounced 500 ms; corrupt JSON → default preset — test); presets `focus`/`cockpit`/`monitor`.
- [ ] AC: store survives reload round-trip (mocked bindings); commit.

### Task 7: Panel registry + shell rendering (part 2 of EKI-11, M)

- [ ] `panel-registry.tsx` per D-M2-2 with all M2 panels (lazy imports; B/C panels stub as their **Quiet Office** empty states until their lanes land — the registry contract is what unblocks parallelism).
- [ ] `WorkspaceShell.tsx`: tab bar (rename inline, ⌘T new / ⌘W close), recursive split renderer with drag-to-resize splitters (pointer events on the divider; ratio → store), panel chrome (emoji+title, focus ring, maximize/close buttons), `welcome` leaf = registry-driven picker grid with `shortcutHint` keys. Error boundary per panel (a crashing panel renders "💥 this panel tripped — reopen?" without taking the shell down — test).
- [ ] Replace `App.tsx` body with `<WorkspaceShell/>` (debug panel stays reachable behind a `?debug` query until T25).
- [ ] AC: E2E asserts default preset renders two panels and splitter drag persists; commit.

### Task 8: Drag-rearrange, maximize, keymap (part 3 of EKI-11 → completes the L)

- [ ] Drag a panel by its chrome onto another panel: edge drop-zones (N/S/E/W = split in that direction, center = swap) — hand-rolled HTML5 drag with visual drop hints (fallback decision: if flaky across webview, switch to `@dnd-kit` — timebox 1 day before switching).
- [ ] Maximize toggle (store already models it) with a `motion` spring (Pop-in family); Esc restores.
- [ ] `keymap.ts` porting the v1 zen map: ⌘K palette, ⌘1..9 focus panel N, ⌘\ split-h / ⌘⇧\ split-v, ⌘⇧W close panel, ⌘⇧M maximize, Tab/⇧Tab cycle focus (outside inputs), ⌘/ shortcut help sheet (registry-generated).
- [ ] AC (EKI-11 complete): tabs → splits → panels, drag rearrange, maximize, close, presets save/restore, shortcuts work, registry data-driven; vitest on keymap matcher table; commit.

### Task 9: Command palette (EKI-16, M)

- [ ] `cmdk`-based palette; actions sourced from an **extensible action registry** (`palette.ts` store: `registerActions(source)`): open/replace panel (from panel registry), switch project filter (from projects), spawn session (quick-spawn → ModelPicker default haiku, D-M2-7), new task, open settings, switch theme, layout presets.
- [ ] Fuzzy search across label+keywords; recent-actions ranking (settings key `palette.recents`); **Palette wink** rotating footer hints (D-M2-6).
- [ ] AC (EKI-16): ⌘K opens; all listed action groups present; action registry accepts later registrations (M3 panels) without palette changes; tests on filtering/ranking; commit.

### Task 10: Theming & settings UI (EKI-20, M)

- [ ] Port the remaining 6 v1 zen themes (catppuccin-mocha, dracula, github-light, gruvbox-dark, one-dark, solarized-dark) into `theme/themes.ts` (9 total incl. existing); extend theme vars as needed by panels (status colors, chat bubble surfaces) — keep the `applyTheme` CSS-var mechanism.
- [ ] Density (`comfortable|compact` → CSS var scale) + font size (3 steps); persisted (`ui.density`, `ui.font_size`).
- [ ] Settings surface: a `settings` panel kind (registry) **plus** a separate Tauri settings window (master plan AC) sharing the same React routes; new `capabilities/settings.json` granting only settings/theme/permission-rule commands (capability README updated — D-M2-8 discipline).
- [ ] Sections: Appearance (theme picker with live preview swatches), Models (default spawn model — D-M2-7), Permissions (rules list from T3 with revoke buttons), Integrations (MCP/hooks status, read-only links to M1 install flows).
- [ ] AC (EKI-20): theme/density/font persisted and applied on boot; settings window opens with its own capability file; permission rules revocable; commit.

### Task 11: Global project filter (EKI-22, S)

- [ ] Tab-scoped filter (D-M2-1 `WorkspaceTab.projectFilter`) with a shell-header project switcher (palette action too); `useProjectFilter()` hook exposes the active project + a `matchesFilter(projectPath)` predicate (matches `SessionMeta.project_path` against `project.folder_path` prefix).
- [ ] All M2 panels consume the hook (chat session pickers, sessions, activity, history, crew spawn defaults).
- [ ] AC (EKI-22): selecting a project scopes all panels; persisted per workspace tab; filter survives restart; tests on the predicate (worktree paths under the project root match); commit.

## Lane B — Chat panel (owns `src/panels/chat/**`, `src/stores/transcripts.ts`, `src/components/Markdown.tsx`)

### Task 12: Transcript store — the seq stitch buffer (part 1 of EKI-49, M)

- [ ] TDD `stores/transcripts.ts`: per-session sparse buffer (`Map<seq, TranscriptItem>` + sorted seq index + `total`); `ingestLive(seq, item)` from `EngineEvent::Item`; `ingestPage(TranscriptPage)`; `loadOlder()` issues `get_session_transcript` for the gap below the lowest loaded seq; duplicate seqs are idempotent (the dedup-by-construction promise of D-M2-3).
- [ ] Pending-state machinery: `PermissionRequest`/`Question` events attach to the session as pending prompts; answering clears them (consumed by T15).
- [ ] AC: stitch tests — live-then-page, page-then-live, gap fill, out-of-order pages — all converge to one identical ordered list; commit.

### Task 13: Virtualized transcript renderer (completes EKI-49, the L)

- [ ] `VirtualTranscript.tsx` per D-M2-4: TanStack Virtual + `measureElement`, stick-to-bottom pin, "⬇ new stuff" pill, prepend-without-jump on `loadOlder()`.
- [ ] `items/` renderers per the D-M2-5 mapping table: markdown via shared `Markdown.tsx` (react-markdown+gfm, shiki lazy), `ThinkingBlock` (collapsed >500 chars; `redacted` ⇒ "🔒 thinking privately…" placeholder), `ToolCallCard` joining ToolUse↔ToolResult by `tool_use_id` with **Tool Chips** emoji + foldable input/output + error edge, `ImageItem` thumbnail+lightbox, subagent collapsible groups with humanized names, `UnknownRow` ("🤷").
- [ ] Session meta strip (top of panel): model, usage totals, git branch, **Status Critter**, interrupt button.
- [ ] `?perf` route + 5k synthetic fixture; CDP frame-time probe (non-blocking E2E job).
- [ ] AC (EKI-49): all `TranscriptItem` kinds render; thinking/tool/image/subagent behaviors per AC; 60 fps probe on 5k items passes locally; **Quiet Office** chat empty state; commit.

### Task 14: Composer & streaming send (EKI-52, M)

- [ ] `Composer.tsx`: Enter sends / Shift+Enter newline; autosize textarea; sends via `sendToSession`; while `status == Working` the send button becomes "queue" (input is deliverable mid-run per M1 — the queue is purely a UI affordance showing the message as "queued ⏳" until the matching `UserText` item streams back); interrupt button wired to `interruptSession`; **Typing Bot** indicator (D-M2-6).
- [ ] Slash-command hints: `/` prefix opens a popover fed by `list_slash_commands` (T5) for the session's project; fuzzy filter; insert on Tab.
- [ ] Spawn-from-chat: an unbound chat panel offers agent pick + ModelPicker (haiku default for one-offs — D-M2-7) and calls `spawnSession`.
- [ ] AC (EKI-52): live streaming response renders token-by-token (fake-claude E2E); slash hints listed; queue + interrupt work; commit.

### Task 15: Permission, question & plan prompts (EKI-58, M)

- [ ] `prompts/PermissionPrompt.tsx`: inline card on `PermissionRequest` — tool name + pretty-printed `input_json` (collapsed beyond 20 lines), buttons Allow once / **Always allow** (writes rule via T3 then responds) / Deny with optional reason; **Status Critter** flips to `🙋` while pending.
- [ ] `prompts/QuestionPrompt.tsx`: options as buttons (multi-select → checkboxes + confirm); `prompts/PlanApproval.tsx`: `kind == "plan"` renders plan markdown full-width with Approve / Request changes (deny with message). All answered via `respondToPermission`/`answer_question` (T3).
- [ ] AC (EKI-58): all three prompt types answerable inline; answered prompts collapse to a one-line receipt ("✅ allowed Edit on src/foo.rs"); fake-claude E2E covers the permission round-trip; commit.

### Task 16: History mode & take-over (EKI-60, M)

- [ ] Chat panel `params.mode = "history"`: read-only render of any past/external session (pages via `get_session_transcript`; no composer — instead a footer action bar).
- [ ] "Take over": enabled when origin External/Ended and status Idle/Ended — calls `spawnSession({ resume_session, fork: false })`, panel swaps to live mode. "Fork from here": `fork: true`, opens a new chat panel on the returned id.
- [ ] AC (EKI-60): open archived session read-only with full fidelity; take-over and fork produce working managed sessions (fake-claude E2E); commit.

### Task 17: Checkpoint/rewind surface (EKI-64, S)

- [ ] Render `TranscriptItem::Checkpoint` (T2) as a subtle timeline marker ("📍 checkpoint"); hover → "Rewind to here" → confirm dialog → `spawnSession({ resume_session, fork: true })` annotated as a rewind in the new panel title.
- [ ] Degrade gracefully: no checkpoint items → no markers, no UI residue (AC).
- [ ] AC (EKI-64): markers on fixture with snapshots; rewind spawns fork; absent-checkpoints case clean; commit.

## Lane C — Crew, sessions, activity, history, handoff (owns `src/panels/{crew,sessions,activity,history}/**`, `src/stores/{sessions,bindings,activity}.ts`)

### Task 18: Sessions store + bindings store (S, foundation for the lane)

- [ ] `stores/sessions.ts`: seeded by `listAllSessions`, maintained by `Discovered/Updated/Removed`; `stores/bindings.ts`: seeded by `list_session_bindings` (T4), maintained by `SessionBindingChanged`; a `useSessionsView()` selector joins them (display name ?? short id, bound agent, room) and applies the project filter (T11 hook).
- [ ] AC: join + event-driven update tests (mocked bindings); commit.

### Task 19: Agent CRUD + persona composer (EKI-32, L)

- [ ] `AgentEditor.tsx`: name, emoji/icon picker, color, project path picker (from registered projects), ModelPicker (haiku default — D-M2-7), permission mode (BypassPermissions behind a warning gate — master plan §5.5), auto-spawn + pinned toggles. **Confetti Hire** on create (D-M2-6).
- [ ] `PersonaComposer.tsx`: presets (port v1 Executor/Advisor/Explorer) + trait sliders (thoroughness, risk appetite, verbosity, tone) composing into a live-preview system prompt; persisted to `agents.persona_json` + materialized `system_prompt`; pure compose function TDD'd first (slider → prompt fragment table).
- [ ] "Materialize": writes `agent.system_prompt` (used as `append_system_prompt` at spawn) and/or offers the fenced `CLAUDE.md` block via `materialize_persona` (T5) with a preview diff.
- [ ] AC (EKI-32): full CRUD; preset+sliders → previewable prompt; both materialization paths work; compose-function unit tests; commit.

### Task 20: Crew bar & agent cards (EKI-36, M)

- [ ] `CrewBar.tsx` docked in the shell sidebar (Lane A reserves the slot in T7): pinned agents as avatar cards with **Status Critters** + **Pop-in** (status derived: agent → bound live sessions via T18 join); click → opens/focuses a chat panel bound to that agent's session (spawn if none, using agent defaults); hover quick actions: spawn/stop, auto-spawn toggle.
- [ ] **Quiet Office** crew empty state → "Hire" button → AgentEditor.
- [ ] AC (EKI-36): live status within 1 s of `EngineEvent`s (test via fake events); spawn/stop from the bar work; commit.

### Task 21: Session binding UI (EKI-40, M)

- [ ] In sessions panel + chat meta strip: bind/unbind agent (combobox), assign room, inline-editable display name, pin toggle — all via T4 IPC; optimistic updates with rollback on error (test).
- [ ] External sessions: binding is the explicit "adopt into the crew" gesture (copy v1 mental model); room rules auto-assignment stays M3 — manual only here, note in panel.
- [ ] AC (EKI-40): bindings persist across restart; display names render everywhere a session is named (sessions, chat title, activity, crew bar); commit.

### Task 22: Sessions panel (EKI-74, M)

- [ ] Table/cards toggle of `useSessionsView()`: origin badge (Managed/External), **Status Critter** + activity detail, model, usage (compact `12.3k ▸ 4.1k` tokens), room, agent, git branch, relative last-activity; sort by activity; row actions: open chat, bind (T21), interrupt, kill (confirm), handoff menu (T24).
- [ ] **Quiet Office** sessions empty state; **Pop-in** on discovery.
- [ ] AC (EKI-74): managed + external both listed live; all actions wired; project filter respected; commit.

### Task 23: Activity feed panel (EKI-76, M)

- [ ] `stores/activity.ts`: bounded ring buffer (1k entries) over `Signal`, `Item` (collapsed: one entry per tool-use / message, not per token), `Conflict`, lifecycle (`Discovered/Removed`), permission events; per-agent/per-session filter; time grouping (Today/Earlier).
- [ ] Panel: live stream with filter chips, click-through opens the session's chat panel at that point; conflict events render loud (`⚠️ two sessions editing src/foo.rs`).
- [ ] **Named regression test:** loading state must resolve to empty-state when no events arrive within the initial fetch (the v1 `ActivityLogStream` stuck-spinner bug, carried per AC).
- [ ] AC (EKI-76): real-time entries with filters + grouping + click-through; stuck-loading regression test green; commit.

### Task 24: History panel + handoff actions (EKI-78 M + EKI-80 S)

- [ ] History panel: `list_archived_sessions(project?)` (T1 filter) grouped by date/project, search box wired to `searchTranscripts` with snippet hits; click → chat panel in history mode (T16); **Quiet Office** empty state.
- [ ] Handoff menu (sessions panel rows + chat meta strip): "Open in Terminal/iTerm/Warp/VS Code" via `handoff` (T5, targets from `handoff_targets`), "Copy path", "Copy `claude --resume <id>`" via clipboard plugin.
- [ ] AC (EKI-78): browse/search archived sessions, open read-only. AC (EKI-80): all handoff actions work within capability scope (manual checklist in PR); commit.

## Closing

### Task 25: Debug panel removal + shell becomes the app (S)

- [ ] Delete `src/panels/debug/**` and its tests; remove the `?debug` escape hatch; `App.tsx` is the workspace shell, period. Verify every debug-panel capability has a real home (spawn → palette/crew, raw events → activity, permissions → chat prompts, MCP status → settings).
- [ ] AC: grep for `panels/debug` returns nothing; E2E suite green; commit.

### Task 26: M2 exit review — the DOGFOOD GATE

- [ ] Full local + CI gates (clippy, cargo test, tsc, vitest, E2E, Sonar); bindings drift check clean; capability README covers every granted permission.
- [ ] Linear AC walk over EKI-11/16/20/22/32/36/40/49/52/58/60/64/74/76/78/80/109.
- [ ] **Dogfood checklist (the gate — M3 does not start until all hold for one real week of daily use):**
  - [ ] Author's daily Claude Code work runs inside CrewHub v2 — terminal tabs not opened for routine sessions.
  - [ ] A terminal-spawned session appears, is bound, taken over, and continued in chat without data loss.
  - [ ] Permission prompts, questions, and plan approvals are answered in-app, never in a terminal.
  - [ ] Restart restores tabs, layout, theme, project filter, crew bar exactly.
  - [ ] 5k-item transcript scrolls at 60 fps; idle CPU < 2% with 10 watched sessions.
  - [ ] Played with it and smiled at least once (Status Critters / Quiet Office are present, not TODO).
- [ ] File friction list from the dogfood week as M3 input issues; close milestone.

---

## Build order & parallelism (3 lanes + Lane 0 first)

```
Lane 0 (serial, first): T1 (EKI-109) → T2 → T3 → T4 → T5          [owns src-tauri/** + bindings.ts]
        └─ after T2+T3+T4+T5: bindings frozen for the milestone

Lane A (shell):    T6 → T7 → T8 → T9 → T10 → T11                  [src/app, stores/{workspace,palette}, theme, panels/settings]
Lane B (chat):     T12 → T13 → T14 → T15 → T16 → T17              [panels/chat, stores/transcripts, components/Markdown]
Lane C (crew+ops): T18 → T19 → T20 → T21 → T22 → T23 → T24        [panels/{crew,sessions,activity,history}, stores/{sessions,bindings,activity}]

A starts after T1 (settings KV only). B starts after T2+T3 land. C starts after T4 (T18) — T24 also needs T5.
B and C mount inside A's registry: until T7 lands they develop against a bare harness route and register at the end
(the PanelDefinition contract in §1 D-M2-2 is fixed on day one, so nobody blocks on the shell).
Shared seeds (ModelPicker, EmptyState, StatusEmoji, Markdown) are created by the first lane that needs them in
src/components/ and owned by Lane A thereafter — B/C may consume, only A edits.

T25 → T26 close out after all lanes merge.
```

## Risks specific to M2

| #     | Risk                                                                                             | Mitigation                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2-R1 | Virtualized chat with dynamic markdown heights janks under streaming appends                     | D-M2-4 picks measured-element virtualization + the `?perf` probe lands with T13, not at exit; fallback: `react-virtuoso` swap is contained to one component                                               |
| M2-R2 | Watcher `seq` semantics drift (e.g. rotation/truncation resets) breaking the stitch contract     | T2 parity test pins the contract in CI; truncation already triggers `Removed`→rediscovery which resets both sides consistently (add fixture test)                                                         |
| M2-R3 | Hand-rolled panel drag-and-drop flaky in the Tauri webview                                       | T8 timeboxes 1 day, then switches to `@dnd-kit`; keyboard splits (⌘\) ship first so drag is never the only path                                                                                           |
| M2-R4 | Playfulness becomes scope creep (animation rabbit holes)                                         | D-M2-6 is a closed, named inventory — anything not named there is M5; all touches are CSS/motion one-liners with reduced-motion variants                                                                  |
| M2-R5 | Three UI lanes collide in shared files (stores, registry, App.tsx)                               | File-ownership table in the build order is enforced in review; bindings are frozen after Lane 0; registry registration is each lane's final, tiny diff                                                    |
| M2-R6 | `answer_question`/plan-approval shapes unverified against real CLI (M1 built them from fixtures) | T15 includes one `#[ignore]`-style real-CLI smoke of a plan approval before EKI-58 closes; shapes live behind M1's control.rs so fixes don't touch UI                                                     |
| M2-R7 | Settings window (second Tauri window) drags in capability/window plumbing late                   | T10 stubs the window with the settings **panel** first (registry), window second; if Tauri windowing fights back, panel-only ships and the window slips to M6 polish without violating any AC's substance |

---

## Appendix A — Keymap (T8, ported from the v1 zen map; ⌘ on macOS, Ctrl elsewhere)

| Keys           | Action                                   | Source        |
| -------------- | ---------------------------------------- | ------------- |
| ⌘K             | Command palette                          | registry      |
| ⌘T / ⌘W        | New workspace tab / close tab            | shell         |
| ⌘1..9          | Focus panel N (visual order)             | layout tree   |
| Tab / ⇧Tab     | Cycle panel focus (outside inputs)       | layout tree   |
| ⌘\ / ⌘⇧\       | Split focused panel horizontal/vertical  | layout tree   |
| ⌘⇧W            | Close focused panel                      | layout tree   |
| ⌘⇧M            | Maximize/restore focused panel           | shell         |
| ⌘⇧ + arrows    | Resize focused split                     | layout tree   |
| ⌘/             | Shortcut help sheet (registry-generated) | registry      |
| Esc            | Restore maximize / close modal/palette   | shell         |
| Enter / ⇧Enter | Send / newline (composer only)           | chat composer |

Single-letter `shortcutHint` keys (c/s/a/h/…) work only inside the `welcome` panel picker — never globally (v1 lesson: global single-key shortcuts fight text inputs).

## Appendix B — Settings KV keys introduced in M2 (single source of truth)

| Key                    | Shape                       | Writer               |
| ---------------------- | --------------------------- | -------------------- |
| `workspace.tabs`       | `WorkspaceTab[]` JSON       | workspace store (T6) |
| `workspace.active_tab` | tab id                      | workspace store (T6) |
| `workspace.presets`    | named `LayoutNode` JSON map | workspace store (T6) |
| `palette.recents`      | action-id array             | palette store (T9)   |
| `ui.density`           | `comfortable \| compact`    | settings UI (T10)    |
| `ui.font_size`         | `s \| m \| l`               | settings UI (T10)    |
| `model.default_spawn`  | model id (default `haiku`)  | settings UI (T10)    |
| `theme`                | theme name (exists, M0)     | settings UI (T10)    |
| `perm.rules`           | `PermissionRule[]` (M1)     | typed IPC only (T3)  |

Rule: stores read settings once at boot and own the in-memory truth; `SettingChanged` events reconcile cross-window (settings window ↔ main window).

## Appendix C — Deliberately NOT in M2 (so nobody "helpfully" adds them)

- **Kanban board, docs panel, rooms CRUD UI, room-rule auto-assignment** — M3 (Epic 13/14). M2's room references are read/assign-only via session bindings.
- **Meetings, standups, runs/scheduler UI, subagent tree panel** — M4. The chat panel's inline subagent groups are the only lineage UI in M2.
- **3D world panel** — M5; the registry entry seam is proven by the M2 panels, that is enough.
- **Desktop notifications & tray** — M6 (Epic 22); pending-permission visibility in M2 is Status Critters + dock-less.
- **Detachable/multi-window chat** — master plan Q2, deferred; the settings window (T10) is the only second window.
- **Voice input, media uploads beyond image render** — deferred (master plan §2); `Image` items render, nothing uploads.
