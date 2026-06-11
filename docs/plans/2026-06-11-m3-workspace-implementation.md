# M3 — Workspace: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⛔ EXECUTION GATE:** M2 ends at the **dogfood gate** (M2 plan T26): the author runs real daily Claude Code work inside CrewHub v2 for one week, by choice. **This plan may be EXECUTED only after Nicky green-lights or explicitly waives that gate.** Friction issues filed during the dogfood week are M3 input — triage them into the lanes below before starting.

**Goal:** Human and crew share one board and one map of the work: full projects & rooms management (CRUD, folder picker, assignment rules, docs panel), a kanban board that agents move cards on _themselves_ via MCP, "Run with agent" turning a card into a managed session, task notifications (in-app toasts), and read-only git awareness (status strip + diff viewer).

**Architecture:** M3 adds four panels (`board`, `projects`, `docs`, `diff`) to the M2 registry — one `PanelDefinition` entry each, zero shell changes (that was the point of D-M2-2). All new privileged surface (docs file reads, git CLI, folder picker, task events) lives in Rust behind typed IPC, path-policy-checked; the webview still gets no `fs`, no `shell`, no `dialog` permission. The board is the first UI that is _written to by agents_: the MCP task tools (M1 Epic 8) already emit `DomainEvent::TaskChanged`, so the same store-fold that drives human edits drives agent edits — agent-driven and human-driven mutations are indistinguishable to the rendering layer, distinguishable in the event timeline. Standing principles apply to every task: **playfulness is a core product value** (§1 D-M3-8 names the touches — they are ACs, not garnish) and **haiku-default / model-adaptive** (§1 D-M3-6: Run-with-agent never hardcodes an expensive model).

**Tech Stack additions:** `@dnd-kit/core` + `@dnd-kit/sortable` (board drag-and-drop, D-M3-1) — frontend's only new dependency. Rust: `tauri-plugin-dialog` (folder picker, Rust-side invocation only, D-M3-7). Git via fixed-argv `git` CLI through `std::process::Command` (the handoff.rs precedent) — **no libgit2/gix crate** (D-M3-5). Desktop-notification plugin deliberately NOT added (D-M3-9: M3 ships in-app toasts; the Tauri notification plugin + tray is M6 Epic 22).

**Linear mapping:** Epic 13 Projects & Rooms = EKI-82 (13.1 project CRUD + folder picker + docs path EKI-85 M, 13.2 rooms CRUD + assignment rules EKI-87 M, 13.3 docs panel EKI-89 M) · Epic 14 Tasks = EKI-91 (14.1 kanban board panel EKI-93 L, 14.2 "Run with agent" EKI-95 M, 14.3 agent-driven board MCP e2e EKI-97 M, 14.4 task notifications EKI-99 S) · Epic 15 Git & Code Awareness = EKI-101 (15.1 project git status strip EKI-103 M, 15.2 diff viewer panel EKI-105 M).

**Diagram:** `docs/plans/2026-06-11-m3-workspace.drawio` (page 1: workspace architecture incl. the agent→MCP→board loop; page 2: task graph with lane assignments).

**Grounding:** Current IPC surface audited against `src/ipc/bindings.ts`, `src-tauri/src/ipc/mod.rs`, `src-tauri/src/store/**`, `src-tauri/src/mcp/tools.rs` and `migrations/001_init.sql` on 2026-06-11 (M0–M2 merged to `main`). The gaps in §2 are real holes from that audit. v1 UX wisdom sourced from `crewhub/frontend/src/components/tasks/` (TaskBoard/TaskCard/RunOrSelfDialog) — key lessons: v1 never had drag-and-drop (status moved via a quick-move menu — we keep that menu as the non-drag path), blocked tasks render as a loud strip not a buried column, status/priority config was duplicated 3× (v2: one `task-constants.ts`), and `room_id`-less tasks were invisible (already enforced in `mcp/tools.rs::create_task`).

---

## 1. Design decisions (made now, argued here, binding for the milestone)

### D-M3-1 — Board drag-and-drop: `@dnd-kit`, with the v1 quick-move menu as the always-available fallback

Choice: **`@dnd-kit/core` + `@dnd-kit/sortable`**. _Alternative considered:_ Atlassian's `pragmatic-drag-and-drop` — smaller core (~4.7 kB) and battle-tested in Trello/Jira, but it is an adapter over **native HTML5 drag events, which are exactly what M2-R3 flagged as flaky in the Tauri WKWebView** (M2's panel drag timeboxed hand-rolled HTML5 DnD for that reason and named `@dnd-kit` as its own fallback). dnd-kit uses pointer-event sensors (no HTML5 DnD), ships keyboard DnD + screen-reader announcements out of the box (space to lift, arrows to move — our reduced-motion/a11y posture for free), and tree-shakes to ~12 kB for core+sortable. Bundle stays lean: no modifiers package, no multiple-backends. One decision rule: dnd-kit is for the **board only** — the M2 panel-chrome drag stays hand-rolled; nobody "unifies" them.

Non-negotiable fallback (v1 lesson): every card keeps the **quick-move menu** (`⋯` → "Move to Review", "Mark blocked"…) ported from v1's `TaskCard.tsx` `getQuickStatusOptions`/`getMoveStatusOptions` tables. Drag is never the only path; the menu ships first (T10), drag second (T11).

### D-M3-2 — Optimistic updates + DomainEvent reconciliation: one fold, two writers

The board renders from `stores/tasks.ts`, which is folded from exactly two inputs — initial `listTasks()` and `DomainEvent::TaskChanged { task_id }` — regardless of who mutated (human IPC, agent MCP). Human edits apply **optimistically**: the store moves the card immediately, issues `updateTask`, and on error rolls back to the pre-move snapshot with an apologetic toast. Reconciliation: every `TaskChanged` triggers a single-task refetch via `get_task(task_id)` (new IPC, §2 G3); `null` result ⇒ task deleted, drop it. In-flight optimistic moves keep a `pendingVersion` so the echo of your own write never causes a flicker, and a _concurrent_ agent write wins last-writer (the event timeline shows both moves — conflict is visible, not hidden). _Alternative considered:_ full `listTasks` refetch per event — simple but O(board) per agent action; an agent burst (meeting action items in M4) would thrash. Single-task refetch is the same code path for create/update/delete.

```ts
// src/stores/tasks.ts — fold contract (pure reducer first, TDD)
type TasksState = {
  byId: Map<string, Task>;
  pending: Map<string, { snapshot: Task; version: number }>; // optimistic moves in flight
};
// apply(state, action) where action ∈
//   { kind: "seed", tasks } | { kind: "optimistic", task } |
//   { kind: "confirm", taskId } | { kind: "rollback", taskId } |
//   { kind: "reconcile", taskId, task: Task | null }   // ← from TaskChanged + get_task
```

### D-M3-3 — `task_events` is the timeline AND the linkage substrate (closed actor + event vocabulary)

The `task_events` table (M0 schema, **never written so far** — §2 G1) becomes the single record of "what happened to this card": the detail drawer's timeline, the run↔task linkage, and the notification source. Events are written **in the store layer** (`store/task_events.rs` helpers called from `create_task`/`update_task` wrappers), so human IPC and MCP tools produce identical rows.

| `event_type`     | `payload_json`                       | written by                           |
| ---------------- | ------------------------------------ | ------------------------------------ |
| `created`        | `{ title }`                          | store, on create                     |
| `status_changed` | `{ from, to }`                       | store, on update when status diffs   |
| `assigned`       | `{ agent_id }` (null = unassigned)   | store, on update when assignee diffs |
| `run_started`    | `{ session_id, agent_id, provider }` | Run-with-agent (T12)                 |
| `run_finished`   | `{ session_id, outcome }`            | Run-with-agent stop hook fold (T12)  |
| `status_update`  | `{ text }`                           | MCP `post_status_update` (T5)        |

`actor` format is closed: `human` \| `agent:<agent_id>` \| `mcp` (unattributed MCP fallback). A card's "linked session" = newest `run_started` without a matching `run_finished` — no schema change, no `tasks.session_id` column to keep consistent.

### D-M3-4 — MCP actor attribution: self-reported `acting_as`, validated, honestly badged

EKI-97 wants `created_by`/actor rendered. Hard truth: the MCP server cannot _derive_ the calling Claude Code session — all sessions share the one per-launch bearer token, and rmcp's stateless mode sees only HTTP requests. Cryptographic per-session identity is an M4+ item (per-session tokens minted at spawn). M3 ships the pragmatic, honest version: task tools gain an optional `acting_as` (agent id) parameter; the SessionStart context envelope (M1 7.3) already tells a bound agent who it is and now instructs it to pass `acting_as` on CrewHub tool calls. The server **validates** the id against the agents table (unknown id ⇒ tool error listing valid ids), records `actor = agent:<id>`, else falls back to `mcp`. The UI renders attributed actions with the agent's avatar plus a `via MCP 🔧` badge, and unattributed ones as "an agent 🤖". This is self-reported and the plan says so — the badge copy never claims verified identity. _Alternative considered:_ per-project URLs (`/mcp?project=…`) — gives project-, not agent-level attribution, and complicates 8.4 registration; rejected for M3.

### D-M3-5 — Git read-only, fixed-argv `git` CLI through Rust (no git library)

`src-tauri/src/git/mod.rs` shells out to `git` with **fixed argv** (the `workspace/handoff.rs` precedent: enum-mapped commands, `std::process::Command`, no shell interpolation), every path validated by `security::paths` first. Three commands, all read-only:

```rust
git_status(project_path) -> GitStatus {
  branch: String, ahead: u32, behind: u32, dirty: u32, untracked: u32,
  worktrees: Vec<Worktree { path, branch, is_current }>,
}            // porcelain v2: `git status --porcelain=v2 --branch` + `git worktree list --porcelain`
git_diff(project_path, base: Option<String>) -> GitDiff {
  files: Vec<DiffFile { path, status, additions, deletions, patch: String }>,
  truncated: bool,
}            // `git diff [--merge-base <base>]` + `--numstat`; per-file patch capped (256 KB), total capped (4 MB)
git_default_base(project_path) -> Option<String>   // `git symbolic-ref refs/remotes/origin/HEAD`, else "main"/"master" probe
```

_Why not `gix`/`libgit2`:_ a heavyweight dependency to reimplement what every Claude Code user already has on PATH; worktrees + porcelain v2 parsing via CLI is ~150 lines of fixture-tested Rust. Failure posture: missing `git`, not-a-repo, or timeout (2 s) all return a typed `GitUnavailable` variant — panels render "no git info 🤷", never an error wall. Polling: the status strip refreshes on panel focus + a 30 s timer + after `Signal{post-tool}` on Edit/Write for that project — no fs-watching of `.git` in v2.0. `SessionMeta.git_branch` (transcript-header-derived, often stale/absent) stays for the sessions table; the strip is the source of truth on project surfaces.

### D-M3-6 — "Run with agent": prompt envelope in, status auto-moves out (haiku-default)

From a card: pick an agent (or "one-off" — ModelPicker, **default haiku** per D-M2-7; agent-bound runs use `agent.default_model`) → `spawnSession` with the task envelope as `SpawnSpec.prompt`:

```
You are working on CrewHub task <id> — "<title>" (priority <p>, room <room>).
<description markdown>
When you make progress, call mcp__crewhub__update_task_status (task_id="<id>",
acting_as="<agent_id>"); move it to "review" when you believe it is done.
```

On successful spawn: task → `in_progress` (optimistic, same fold) + `run_started` event. Completion hook: the tasks store watches `EngineEvent` for the linked session — on `Signal { event: "stop" }` **or** status transition to `Idle`/`Ended`, if the task is still `in_progress`, raise a **suggestion toast** ("🔨 Botje finished — move _Fix the flaky test_ to review?" with one-click move); if the agent already moved it via MCP, stay silent (no double prompt). Linkage renders on the card: the bound agent's avatar + live **Status Critter** while a run is linked (D-M3-8). The card never moves to `review` automatically — the human (or the agent via MCP) does; CrewHub only suggests. v1's `RunOrSelfDialog` ("How do you want to work on this? 🎯 Run with agent / Do it myself") is ported as the entry dialog — "do it myself" just assigns + moves to in_progress.

### D-M3-7 — Folder picker & docs reading: privileged surface stays in Rust

**Folder picker (EKI-85):** add `tauri-plugin-dialog`, invoked **Rust-side only** via IPC `pick_folder() -> Option<String>` — the webview capability file gains **no** `dialog:*` permission (same discipline as D-M2-8's shell). The picked path is then validated/canonicalized and registered as a project root, which _extends_ the runtime `PathPolicy` (projects are allowed roots per master plan §5.2 — registration is the grant). **Capability register (explicit):** `capabilities/main.json` unchanged in permissions (app commands need no entry; the dialog plugin is not exposed to JS); `capabilities/README.md` gains a row documenting the plugin, its Rust-only invocation, and why no webview permission exists.

**Docs panel (EKI-89):** the webview has no `fs` — three read-only commands, every path `PathPolicy::validate(…, Access::Read)`-checked against the project's `docs_path` (fallback: `folder_path`):

- `list_doc_tree(project_id) -> Vec<DocEntry { rel_path, name, is_dir }>` — `.md`/`.markdown`/image extensions only, depth-capped (6), count-capped (2 000), symlinks resolved-then-revalidated (path-policy symlink tests already exist).
- `read_doc_file(project_id, rel_path) -> String` — markdown only, 2 MB cap.
- `read_doc_image(project_id, rel_path) -> DocImage { media_type, base64 }` — png/jpg/gif/webp/svg, 8 MB cap; the shared `Markdown.tsx` gets an `urlTransform` + image component that resolves relative `![…](…)` references through this command (object-URL cache per panel, revoked on unmount). _Alternative considered:_ a custom `crewhub-doc://` protocol handler — nicer streaming, but a new global surface to audit; base64-over-IPC is fine at an 8 MB cap, revisit only if dogfooding hurts.

### D-M3-8 — Playfulness inventory M3 (named, concrete, reduced-motion-aware — these are ACs)

| Name               | Where         | What                                                                                                                                                                                                                                    |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confetti Done**  | board         | a card dropped/moved into _Done_ fires a small confetti burst from the card (reuses M2 `confetti.css`, ≤1 s, skipped under `prefers-reduced-motion`)                                                                                    |
| **Drag Tilt**      | board         | the dragged card lifts with a 3° tilt + soft shadow (dnd-kit `DragOverlay`); drop springs it flat via `motion` (reduced-motion: opacity-only)                                                                                           |
| **Board Critters** | board cards   | a card with a live linked run shows the agent's avatar + **Status Critter** (`🔨` working / `🙋` waiting) pulsing gently — the board doubles as a who's-working map                                                                     |
| **Quiet Board**    | empty states  | per-column whispers when the whole board is empty ("🧹 nothing to do…", in-progress "😴 nobody's busy"); docs panel "📚 no docs yet — point me at a folder"; diff "🧘 working tree is clean"; projects "🗺️ register your first project" |
| **Toast Critters** | notifications | toasts open with the acting agent's avatar/emoji and verb-first copy ("🙌 Botje moved _Fix flaky test_ → review"); blocked toasts get a gentle shake (reduced-motion: static)                                                           |

Closed inventory — anything not named here is M5 world material. All touches are CSS/`motion` one-liners behind the existing `use-reduced-motion.ts` hook (media-query mock test renders static variants).

### D-M3-9 — Notifications in M3: rules table + in-app toast center; the OS plugin waits for M6

Master plan 14.4 AC: "basic toast in M3", Epic 22 (M6) owns real desktop notifications/tray. Scope decision, made now: M3 adds **typed CRUD IPC over the existing `notification_rules` table** (G7) plus a frontend `stores/notifications.ts` that folds `TaskChanged`-driven reconciliations and task_events into toast emissions — matching rules with triggers `task_moved` \| `task_blocked` \| `task_assigned` \| `task_mention` (mention = `@AgentName` appearing in a created/updated title/description or `status_update` text), scoped global/project/agent per the table's `scope` columns. Toasts render in a shared `ToastCenter` (stacked, bottom-right, auto-dismiss 6 s, hover-pins, click focuses the board panel at that task — the Epic 22 "click focuses relevant panel" contract proven early). `tauri-plugin-notification` is NOT added; M6 swaps the toast sink for the OS sink behind the same rule engine, which is why the matcher is a pure TS function (`matchRules(rules, event) -> Notification[]`), TDD'd.

### D-M3-10 — Room assignment rules: evaluate in Rust on discovery; manual override sticks by existence

`room_rules` (table exists, zero code — G2) get store CRUD + a pure evaluator `assign_room(rules, meta: &SessionMeta, summary: Option<&str>) -> Option<RoomId>`: rule types per schema — `keyword` (case-insensitive match on summary/first user text + project dir name), `model` (substring on `meta.model`), `path_pattern` (glob on `project_path`), `origin` (`managed`/`external`) — highest `priority` wins, ties break on newest rule. It runs **in Rust** on `SessionEvent::Discovered` (and once more when a summary first appears), writing `session_bindings.room_id` **only when no binding row exists for that session** — any manual bind/unbind from the M2 UI creates the row, so manual override sticks by construction (no flag column needed). Auto-assignments emit the normal `SessionBindingChanged`, and the sessions panel shows a small `auto` chip next to rule-assigned rooms (tooltip names the matching rule).

---

## 2. Current IPC surface — audit & gaps (what Lane 0 must add)

What exists and is sufficient: projects/rooms/tasks CRUD IPC with `DomainEvent` emission (M0), `session_bindings` IPC (M2 G3 fix), MCP task tools validating status/priority/room and emitting `TaskChanged` (M1 8.2), `SpawnSpec` rich enough for Run-with-agent (prompt, model, agent_id, permission_mode), `Signal`/status events for run completion, `PathPolicy` with symlink-hardened validate, `listArchivedSessions(project_path?)` for project auto-suggest + stats, shared `Markdown`/`EmptyState`/`ModelPicker`/`StatusEmoji` components, palette `registerActions` + panel registry seams ready for new panels.

Gaps found (each becomes a Lane-0 task step):

| #   | Gap                                                                                                                                                                                                                                                        | Blocks          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| G1  | **`task_events` never written, never readable.** Table + index exist since M0; no store module, no writes on create/update, no `list_task_events(task_id)` IPC — the drawer timeline, run linkage and notification source all need it (D-M3-3)             | EKI-93/95/97/99 |
| G2  | **`room_rules` has zero code.** Table exists; no store CRUD, no IPC, no evaluator — 13.2 is entirely unbuilt server-side (D-M3-10)                                                                                                                         | EKI-87          |
| G3  | **No `get_task(id)` IPC.** `Store::get_task` exists but is not exposed; `TaskChanged { task_id }` reconciliation needs single-task refetch (D-M3-2)                                                                                                        | EKI-93/97       |
| G4  | **No folder picker.** `tauri-plugin-dialog` absent from Cargo.toml/builder; project registration currently requires typing a path into the debug-era form (D-M3-7)                                                                                         | EKI-85          |
| G5  | **No docs file access.** Webview has no `fs` (by design); no `list_doc_tree`/`read_doc_file`/`read_doc_image` commands exist (D-M3-7)                                                                                                                      | EKI-89          |
| G6  | **No git commands.** `SessionMeta.git_branch` is transcript-header-derived only (stale, absent for never-watched projects); no status/ahead-behind/dirty/worktrees, no diff (D-M3-5)                                                                       | EKI-103/105     |
| G7  | **`notification_rules` has zero code.** Table exists; no CRUD IPC; no rule engine anywhere (D-M3-9)                                                                                                                                                        | EKI-99          |
| G8  | **MCP tools have flat attribution and skip the timeline.** `MCP_ACTOR = "agent:mcp"` constant; no `acting_as`; `create_task`/`update_task_status` bypass task_events (they will inherit G1's store-layer writes); `update_task_status` cannot set assignee | EKI-97          |
| G9  | **`DomainEvent` lacks granular task payloads** — fine (reconcile by refetch, D-M3-2), but deletion of projects/rooms cascades task deletes with **no per-task events**; the tasks store must also re-seed on `ProjectChanged`/`RoomChanged`                | EKI-93          |

No gap (checked, works today): project auto-suggest (`listArchivedSessions` yields distinct `project_path`s), project card stats (client-side join of sessions/archived/tasks), HQ room semantics (`rooms.is_hq`, `project_id NULL` allowed, MCP `get_room_context` already HQ-defaults).

---

## 3. Cross-cutting test strategy

1. **Pure-function-first.** The tasks-store reducer (D-M3-2), rule evaluator (D-M3-10, Rust) and notification matcher (D-M3-9, TS) are pure and exhaustively unit-tested before any component mounts them — same discipline as M1/M2.
2. **Rust additions are M1-style.** Store modules against `Store::open_in_memory()`; git module against **fixture repos built in temp dirs by the test** (`git init` + scripted commits/worktrees; tests `#[ignore]`-skip when `git` is absent — CI has it); docs commands against fixture dirs incl. traversal/symlink attacks; MCP changes extend the existing `mcp/tools.rs` test pattern.
3. **Agent-driven board e2e (EKI-97), three layers:**
   a. _Rust integration:_ an MCP **client** (rmcp) against the in-memory-store server — `create_task`/`update_task_status` with and without `acting_as`, asserting `DomainEvent::TaskChanged` on the broadcast channel, `task_events` rows with correct actor, and validation errors for unknown agent ids.
   b. _Component:_ vitest board test mocks bindings, seeds a board, then emits the same `TaskChanged` + `get_task` reconciliation a real agent move produces — card moves columns live, actor badge renders (D-M3-4).
   c. _Headless fake-CLI E2E:_ a new fake-claude scenario `mcp-board` reads `CREWHUB_MCP_URL`/`CREWHUB_MCP_TOKEN` from env and calls `create_task` + `update_task_status` over HTTP mid-"run"; the WDIO test spawns it headless and asserts the card appears and moves on the rendered board. This is the milestone's flagship test — the master-plan demo AC, automated.
4. **Mocked bindings, real stores** for all panels (M2 pattern): renders-empty (Quiet Board), renders-data, reacts-to-event, optimistic-rollback-on-error.
5. **E2E happy path grows:** boot → open board from palette → create task in a room → drag to in_progress (pointer-sensor drag; quick-move menu asserted as fallback) → Run-with-agent against fake-claude → stop ⇒ suggestion toast → accept ⇒ review column. Plus the `mcp-board` scenario above.
6. **A11y/reduced-motion:** keyboard DnD test (lift/move/drop via keyboard), media-query mock renders static variants of every D-M3-8 touch.

---

## 4. File structure (locked in — ownership per lane)

```
crewhub2/
├── src-tauri/src/                       # Lane 0 owns src-tauri/** + regenerated bindings.ts
│   ├── store/task_events.rs             # T1 NEW (table exists) — write helpers + list
│   ├── store/room_rules.rs              # T2 NEW — CRUD + pure assign_room evaluator
│   ├── store/notification_rules.rs      # T5 NEW — CRUD
│   ├── workspace/docs.rs                # T3 NEW — doc tree/file/image reads (PathPolicy)
│   ├── workspace/pick.rs                # T3 NEW — pick_folder via tauri-plugin-dialog (Rust-side)
│   ├── git/mod.rs                       # T4 NEW — status/diff/worktrees, fixed argv, caps
│   ├── mcp/tools.rs                     # T5 — acting_as, task_events writes, assignee
│   └── ipc/mod.rs                       # T1–T5 — new commands; DomainEvent unchanged
├── src/
│   ├── app/{layout-tree,panel-registry,palette-actions}.ts(x)   # T6 (main lane): +4 PanelKinds,
│   │                                    #   registry stubs, palette actions — then frozen
│   ├── stores/
│   │   ├── tasks.ts                     # Lane E (T10) — reducer fold of D-M3-2
│   │   ├── notifications.ts             # Lane E (T14) — matcher + toast queue
│   │   ├── projects.ts  rooms.ts        # Lane D (T7/T8)
│   │   └── git.ts                       # Lane F (T15) — per-project status cache
│   ├── panels/
│   │   ├── board/                       # Lane E: BoardPanel, Column, TaskCard, TaskDrawer,
│   │   │   └── …                        #   RunWithAgentDialog, task-constants.ts, quick-move.ts
│   │   ├── projects/                    # Lane D: ProjectsPanel, ProjectCard, ProjectForm,
│   │   │   └── …                        #   RoomsManager, RuleEditor
│   │   ├── docs/                        # Lane D: DocsPanel, DocTree, doc-image-cache.ts
│   │   └── diff/                        # Lane F: DiffPanel, FileList, diff-parse.ts
│   └── components/ToastCenter.tsx       # Lane E seeds; others consume, only E edits in M3
└── e2e/board.spec.ts + crates/fake-claude (mcp-board scenario)   # Lane E (T13)
```

Cross-lane touch points (explicit): Lane F adds a one-line git strip mount into `src/panels/sessions/SessionsPanel.tsx` meta row and Lane D consumes it in project cards — the strip component itself lives in `src/panels/diff/GitStrip.tsx` (Lane F owns). The board's project filter comes from the existing `useProjectFilter()` — no new wiring.

---

## Lane 0 — Backend gaps (serial, FIRST; owns `src-tauri/**` + `src/ipc/bindings.ts`)

### Task 1: task_events store + writes + `get_task`/`list_task_events` IPC (M) — G1/G3, unblocks the whole board lane

- [ ] TDD `store/task_events.rs`: `TaskEvent { id, task_id, event_type, actor, payload_json, created_at }`; `record_task_event(…)`, `list_task_events(task_id)` (ascending). Closed vocabularies from D-M3-3 as constants next to `TASK_STATUSES` (one source — port the v1 lesson of 3× duplicated config).
- [ ] Wire writes into `Store::create_task` / `Store::update_task` via an `actor: &str` parameter on new wrapper fns (`create_task_as`, `update_task_as`) so IPC (`human`) and MCP (`agent:<id>`/`mcp`) share one code path; `status_changed`/`assigned` diff detection unit-tested.
- [ ] IPC: `get_task(id) -> Option<Task>`, `list_task_events(task_id) -> Vec<TaskEvent>`; existing task IPC switches to the `_as("human")` wrappers. Regenerate bindings; commit.

### Task 2: room_rules store + CRUD IPC + auto-assign evaluator (M) — G2, unblocks EKI-87

- [ ] TDD `store/room_rules.rs`: CRUD (`RoomRule { id, room_id, rule_type, rule_value, priority }`) + pure `assign_room(rules, meta, summary) -> Option<String>` per D-M3-10 (keyword/model/path_pattern/origin; priority desc, newest-wins tiebreak; tests per rule type + precedence).
- [ ] Hook into the engine event fan-out (where IPC bridges `SessionEvent` today): on `Discovered` (and first summary), if no `session_bindings` row exists → evaluate → `upsert` with `room_id` + emit `SessionBindingChanged`. Manual-override-sticks test: pre-existing row (even all-null fields) is never touched.
- [ ] IPC: `list_room_rules(room_id?)`, `create_room_rule`, `update_room_rule`, `delete_room_rule` (validate rule_type against the schema CHECK; emit `RoomChanged`). Bindings regen; commit.

### Task 3: docs reading + folder picker (M) — G4/G5, unblocks EKI-85/89

- [ ] `workspace/docs.rs` per D-M3-7: `list_doc_tree` / `read_doc_file` / `read_doc_image` — every resolution `PathPolicy::validate(Access::Read)` against the project's `docs_path ?? folder_path`; extension whitelist, depth/count/size caps; tests: traversal (`../`), symlink escape, oversized file, non-whitelisted extension, happy tree.
- [ ] Add `tauri-plugin-dialog` (Cargo + builder registration); `workspace/pick.rs`: `pick_folder() -> Option<String>` invoked Rust-side (blocking dialog on the main thread per plugin docs); canonicalize result. **Capability register row:** `capabilities/README.md` documents the plugin + why `main.json` grants no `dialog:*` (Rust-only invocation, D-M3-7); `main.json` untouched.
- [ ] Project registration path: `create_project`/`update_project` now (a) validate `folder_path` exists + is a dir, (b) extend the runtime `PathPolicy` allowed roots (and on app boot, all registered projects are added — verify this M0 behavior still holds, add test if missing). Bindings regen; commit.

### Task 4: git module + IPC (M) — G6, unblocks EKI-103/105

- [ ] TDD `git/mod.rs` per D-M3-5: `git_status` (porcelain v2 + worktree list parsing — fixture repos in temp dirs), `git_diff` (numstat + per-file patches, 256 KB/file + 4 MB/total caps with `truncated` flag, `base` via `--merge-base`), `git_default_base`; 2 s timeout, `GitUnavailable` typed fallback (missing binary, not a repo).
- [ ] Fixed argv only, path-policy-validated `project_path`, `std::process::Command` with `cwd` set — never a shell string. Snapshot tests on argv per call (handoff.rs pattern).
- [ ] IPC: `git_status(project_path)`, `git_diff(project_path, base?)`, `git_default_base(project_path)`. Bindings regen; commit.

### Task 5: notification_rules CRUD + MCP attribution & timeline writes (M) — G7/G8, unblocks EKI-97/99 — **bindings freeze after this task**

- [ ] `store/notification_rules.rs` CRUD + IPC (`list/create/update/delete_notification_rule`; validate scope/trigger; emit `SettingChanged{key:"notification_rules"}` as the cheap invalidation signal — no new DomainEvent variant needed).
- [ ] `mcp/tools.rs` per D-M3-4: optional `acting_as` on `create_task`/`update_task_status`/`post_status_update`; validate against agents table (tool error names valid ids); actor `agent:<id>` else `mcp`; route through T1's `_as` wrappers so task_events appear; `update_task_status` gains optional `assignee_agent_id`; `post_status_update` with a `task_id` records a `status_update` task event (keeps the settings-key broadcast for the global feed). Extend the existing rmcp client integration test (§3.3a).
- [ ] Regenerate bindings; **declare the M3 bindings surface frozen** (UI lanes start from this commit); commit.

## Main lane — registry pre-seed, then Lane F

### Task 6: PanelKind + registry stubs + palette actions (S) — the parallelism unlock

- [ ] `layout-tree.ts`: `PanelKind` += `"board" | "projects" | "docs" | "diff"` (+ `PANEL_KINDS`); `panel-registry.tsx`: four `PanelDefinition` entries with emoji/keywords/Quiet-Board empty states (D-M3-8 copy), lazy components pointing at stub modules that render the empty state until each lane swaps in the real panel (the M2 T7 trick).
- [ ] Palette actions registered: "Open board", "Open projects", "Open docs", "Open diff", "New task" (already existed as a stub — now routes to the board's create dialog via panel params).
- [ ] AC: all four panels openable as Quiet-Board placeholders from palette + welcome picker; vitest registry-completeness test (every `PanelKind` has a definition); commit. **Lanes D, E, F fork from here.**

## Lane D — Projects, rooms, docs (owns `src/panels/{projects,docs}/**`, `src/stores/{projects,rooms}.ts`)

### Task 7: Projects panel — CRUD + folder picker + docs path + stats (EKI-85, M)

- [ ] `stores/projects.ts`: seed `listProjects`, fold `ProjectChanged`; `stores/rooms.ts` likewise (Lane D owns both; E/F consume read-only).
- [ ] `ProjectsPanel.tsx` + `ProjectForm`: name/description/icon/color, **folder picker button → `pick_folder()`**, optional `docs_path` (picker again, must live under or beside the project root — validated server-side anyway), status archive toggle.
- [ ] **Auto-suggest:** "Found in your session history" section — distinct `project_path`s from `listArchivedSessions()` minus already-registered roots, one-click register (name defaults to dir name).
- [ ] `ProjectCard`: icon/color, recent-session count + last activity (sessions store join), open-task count by status (tasks via `listTasks` until Lane E's store lands — then swap to the store selector), git strip slot (Lane F component, renders `null` until F lands), actions: open board scoped, open docs, handoff.
- [ ] AC (EKI-85): register via picker; path-policy-invalid folder shows a friendly error; auto-suggest works; cards show stats; project filter switcher picks up new projects live; commit.

### Task 8: Rooms manager + assignment rules editor (EKI-87, M)

- [ ] Rooms section inside the projects panel (per project + HQ): CRUD with icon/color/sort (drag-sort NOT in scope — up/down buttons), `is_hq` badge, delete guarded when tasks reference the room (confirm dialog explains task fate: `room_id` nulls ⇒ invisible — the v1 lesson, offer "move tasks to another room first").
- [ ] `RuleEditor` per room: list (priority-ordered), add/edit rows (`rule_type` select + value input with per-type placeholder/validation hints, glob preview for `path_pattern`), priority drag-free reorder (number stepper).
- [ ] Auto-assignment UX: sessions panel room cell gets the `auto` chip + tooltip (rule name) for rule-assigned bindings; manual change clears the chip (it is just a normal binding now) — covered by a component test.
- [ ] AC (EKI-87): rules CRUD round-trips; a fake-claude `Discovered` session with a matching rule lands in the room within 1 s; manual override sticks across restart (E2E asserts the Rust-side guarantee end-to-end); commit.

### Task 9: Docs panel (EKI-89, M)

- [ ] `DocsPanel.tsx`: project picker (defaults from tab filter) → `DocTree` (collapsible dirs, md/image icons) → content pane rendering `read_doc_file` through the shared `Markdown.tsx` (v1-grade fidelity is free — same renderer as chat).
- [ ] Relative links/images: `urlTransform` resolves `./`/`../` within the doc tree; images via `read_doc_image` + object-URL cache (`doc-image-cache.ts`, pure, tested: cache hit, eviction on project switch, revoke on unmount); external `http(s)` links open via the existing handoff/opener path, never in the webview.
- [ ] In-tree md links navigate within the panel (history stack, ⌘[ back); missing target → "🍂 that page isn't there".
- [ ] AC (EKI-89): markdown + images render from a fixture docs dir; tree caps respected; path escapes impossible (server-tested) and the UI degrades politely; Quiet-Board docs empty state when no `docs_path`; commit.

## Lane E — Board, run-with-agent, notifications (owns `src/panels/board/**`, `src/stores/{tasks,notifications}.ts`, `src/components/ToastCenter.tsx`)

### Task 10: Tasks store + board columns + quick-move (part 1 of EKI-93, M)

- [ ] TDD `stores/tasks.ts` reducer per D-M3-2 (seed/optimistic/confirm/rollback/reconcile; pending-version echo suppression; re-seed on `ProjectChanged`/`RoomChanged` — G9); selectors: by-status grouping, filter predicate (project/room/assignee/priority), HQ cross-project view.
- [ ] `BoardPanel.tsx` + `Column` + `TaskCard` (no drag yet): five columns (todo/in_progress/review/done/blocked) with `task-constants.ts` (single status/priority config — v1 lesson), counts, **blocked column header flares when non-empty** (v1's loud-blocked lesson, adapted: blocked is a real column, not a hidden strip, but it announces itself), card = title, priority chip, assignee avatar, room chip (HQ view: + project color chip), event-count dot.
- [ ] Quick-move menu (`⋯`) ported from v1's option tables; create-task dialog (title/description/room **required** — room defaults from filter/HQ, the `room_id` lesson enforced in the form too, priority, assignee); task detail drawer: markdown description (shared renderer), inline edit, **event timeline** from `list_task_events` (actor avatars + D-M3-4 badges).
- [ ] Filters row (project comes from `useProjectFilter()`; room/assignee/priority local; persisted in panel params); HQ toggle = cross-project view ignoring the tab filter (explicit "all projects" pill so it never feels broken).
- [ ] AC: board renders live from store; optimistic move + rollback test; quick-move works end-to-end; drawer timeline shows `created`/`status_changed`; Quiet Board empty states; commit.

### Task 11: Drag-and-drop + polish (completes EKI-93, the L)

- [ ] dnd-kit per D-M3-1: column droppables + sortable cards, `DragOverlay` with **Drag Tilt**; drop ⇒ optimistic status move (within-column ordering is visual-only in v2.0 — no `sort_order` column; documented in the panel).
- [ ] Keyboard DnD (dnd-kit sensors) + announcements; reduced-motion variants; **Confetti Done** on entering done; **Board Critters** on cards with a live linked run (joins sessions store by D-M3-3 linkage).
- [ ] Pointer-sensor activation constraint (8 px) so card clicks (open drawer) and drags don't fight — regression test.
- [ ] AC (EKI-93 complete): drag across all columns incl. blocked; filters + HQ view; drawer + timeline; 60-card board drags smoothly (manual perf check, no formal probe); commit.

### Task 12: Run with agent (EKI-95, M)

- [ ] `RunWithAgentDialog` (from card or drawer): v1's run-or-self fork; agent picker (agents store) or one-off spawn (ModelPicker, haiku default); prompt preview (editable) assembled per D-M3-6 — pure `buildRunPrompt(task, room, agent)` TDD'd, includes the `acting_as` instruction.
- [ ] On spawn: `spawnSession` (project from task's project, `agent_id`, `permission_mode` from agent) → optimistic move to in_progress → `run_started` task event (via a small `record_run_event` IPC? **No** — reuse `updateTask` for status and add Lane-0 T1's `list_task_events`; `run_started`/`run_finished` are written through two tiny IPC commands added in T1: `record_task_run_started(task_id, session_id, agent_id)` / `record_task_run_finished(task_id, session_id, outcome)` — Lane 0 ships them in T1, noted here for visibility).
- [ ] Completion fold per D-M3-6: tasks store watches `EngineEvent` for linked sessions; `Signal{stop}`/`Idle`/`Ended` while task still in_progress ⇒ suggestion toast (one-click → review + `run_finished`); agent-already-moved ⇒ silent `run_finished`. Card shows linkage (avatar + critter) and the drawer's timeline shows the run pair.
- [ ] AC (EKI-95): full loop against fake-claude in E2E: run → in_progress + linkage visible → stop → suggestion toast → review; one-off path defaults haiku (assert in spawn spec); commit.

### Task 13: Agent-driven board MCP e2e (EKI-97, M)

- [ ] Land the three test layers of §3.3: (a) already in Lane 0 T5 (rmcp client integration) — verify coverage, extend for `acting_as` rendering data; (b) component fold test (board reacts to `TaskChanged` + `get_task` exactly as to human moves, actor badge from timeline); (c) fake-claude `mcp-board` scenario + `e2e/board.spec.ts` (headless run creates + moves a task over real HTTP MCP; board shows it live).
- [ ] Attribution rendering polish: timeline + card surfaces show agent avatar + `via MCP 🔧` (attributed) or "🤖 an agent" (fallback) — the honest-badge copy of D-M3-4.
- [ ] AC (EKI-97): all three layers green in CI; demo flow (master plan AC) reproducible by running the E2E locally; commit.

### Task 14: Task notifications — rules + toast center (EKI-99, S)

- [ ] TDD `matchRules(rules, event) -> Notification[]` (triggers/scopes per D-M3-9, mention parsing vs agent names); `stores/notifications.ts` folds task reconciliations + task_events into the matcher; dedupe (same task+trigger within 5 s).
- [ ] `ToastCenter.tsx` (**Toast Critters**, hover-pin, click → focuses/opens board panel with the task's drawer via panel params); settings panel gains a Notifications section (rules CRUD over T5 IPC, per-rule enable toggle = the "per-rule mute" Epic-22 contract).
- [ ] AC (EKI-99): moved/blocked/assigned/mention rules fire toasts; click-through opens the right task; rules editable + persistent; reduced-motion static variant; commit.

## Lane F — Git strip + diff viewer (owns `src/panels/diff/**`, `src/stores/git.ts`; runs on the main lane after T6, parallel to D/E)

### Task 15: Git status strip (EKI-103, M — backend landed in T4)

- [ ] `stores/git.ts`: per-project `GitStatus` cache with the D-M3-5 refresh policy (focus + 30 s + post-Edit/Write signal for that project's sessions); stale-while-revalidate, `GitUnavailable` ⇒ hidden strip.
- [ ] `GitStrip.tsx` (lives in `panels/diff/`, consumed by sessions panel meta + project cards): `⎇ branch · ↑2 ↓1 · ●3 dirty`; worktree sessions labeled (`🌿 worktree: feat-x`) by matching `SessionMeta.project_path` against `worktrees[]`; click → opens the diff panel for that project.
- [ ] AC (EKI-103): branch/dirty/ahead-behind live on project cards + session rows; worktree sessions labeled; non-repo projects show nothing (not an error); commit.

### Task 16: Diff viewer panel (EKI-105, M)

- [ ] TDD `diff-parse.ts`: unified-diff text → `{ files: [{ path, status, hunks }] }` pure parser (fixtures: rename, binary, mode change, truncation marker).
- [ ] `DiffPanel.tsx`: params `{ projectPath, base? }`; left file list (status glyph + ±counts), right pane renders hunks as `diff`-language code blocks through the existing shiki pipeline (lean: no react-diff-view dependency); base switcher: working tree (default) ↔ `git_default_base`; truncated banner when capped; refresh button + auto-refresh on focus.
- [ ] Entry points: chat meta strip "see changes" after Edit/Write signals, sessions panel row action, git strip click — all open via panel params (registry already seeded T6). Read-only is explicit: no stage/discard buttons exist in v2.0.
- [ ] AC (EKI-105): working-tree and vs-base diffs render highlighted from a fixture repo; opened from chat + sessions + strip; clean tree shows "🧘 working tree is clean"; commit.

## Closing (main lane, after all lanes merge)

### Task 17: Integration sweep (S)

- [ ] Swap all four registry stubs for the real panels (each lane's final tiny diff — verify none was missed); palette/new-task/notification click-through routes all land on real panels; project cards' task counts switch to the tasks-store selector (T7 note).
- [ ] Playfulness AC sweep: every D-M3-8 touch present + reduced-motion tested; capability README rows (dialog plugin) reviewed; naming-firewall grep still clean (no `engine::claude` leakage from new code).
- [ ] E2E suite green incl. `board.spec.ts`; commit.

### Task 18: M3 exit review

- [ ] Full local + CI gates (clippy, cargo test, tsc, vitest, E2E, Sonar); bindings drift check clean.
- [ ] Linear AC walk over EKI-85/87/89/93/95/97/99/103/105; close epics EKI-82/91/101.
- [ ] **Exit criteria (all must hold):**
  - [ ] A task created by an agent via MCP appears on the board live, attributed, and the human drags it to done — and vice-versa: a human-created task is run with an agent, the agent moves it to review via MCP. The full shared-board loop, demonstrated.
  - [ ] Projects are registered via the folder picker only (no typed paths), rooms route a terminal-spawned session by rule, and a manual override survives restart.
  - [ ] Project docs (markdown + images) render with chat-grade fidelity without the webview touching the filesystem.
  - [ ] Git strip + diff viewer answer "what did this session change?" in ≤2 clicks from chat.
  - [ ] Notifications fire for moved/blocked/mention per rules and click through to the task; all playfulness touches present.
  - [ ] One week of dogfooding M2+M3 together: the author's tasks for M4 are managed on the CrewHub board itself.
- [ ] File friction list as M4 input issues; close milestone.

---

## Build order & parallelism (Lane 0 first, then D ∥ E ∥ F)

```
Lane 0 (serial, first): T1 → T2 → T3 → T4 → T5        [owns src-tauri/** + bindings.ts]
        └─ after T5: bindings frozen for the milestone
Main:   T6 (registry pre-seed, S)                      [src/app/** — then frozen for M3]

Lane D (projects/docs): T7 → T8 → T9                   [panels/{projects,docs}, stores/{projects,rooms}]
Lane E (board):         T10 → T11 → T12 → T13 → T14    [panels/board, stores/{tasks,notifications}, ToastCenter, e2e/board]
Lane F (git, main lane):T15 → T16                      [panels/diff, stores/git; runs alongside D/E]

T17 → T18 close out after all lanes merge.
Dependencies: T7 needs T3 (picker); T8 needs T2; T9 needs T3; T10 needs T1; T12 needs T1's run-event IPC;
T13 needs T5; T14 needs T5; T15/T16 need T4 + T6. D/E/F own disjoint dirs; shared files
(panel-registry, layout-tree, palette-actions) are written once in T6 and only touched again
by each lane's final stub-swap diff (T17 verifies).
```

## Risks specific to M3

| #     | Risk                                                                            | Mitigation                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-R1 | Drag-and-drop misbehaves in the Tauri webview (the M2-R3 family)                | dnd-kit pointer sensors avoid native HTML5 DnD entirely; quick-move menu ships **before** drag (T10 vs T11) so drag is never the only path; activation-constraint regression test            |
| M3-R2 | MCP attribution is self-reported — an agent could claim another agent's id      | Validated against the agents table, badged `via MCP` (never "verified"), full per-session identity is an M4 follow-up issue filed at T5; the threat model is local-machine, single-user      |
| M3-R3 | Optimistic UI vs concurrent agent moves causes card flicker/lost updates        | D-M3-2 pending-version echo suppression + last-writer-wins by reconciliation; conflict is surfaced in the timeline, not silently merged; reducer property tests cover interleavings          |
| M3-R4 | Git CLI variance (versions, locales, huge repos) breaks parsing or hangs panels | porcelain v2 (locale-stable) only; 2 s timeout + size caps + `GitUnavailable` graceful path; fixture-repo tests in CI; diff panel renders truncation honestly                                |
| M3-R5 | Docs panel becomes a filesystem browser escape hatch                            | Whitelisted extensions, depth/count/size caps, every path through `PathPolicy` (symlink tests exist from M0); images base64-capped; no write commands exist at all                           |
| M3-R6 | Room-rule evaluator guesses wrong and annoys (sessions land in odd rooms)       | Rules are opt-in (empty by default), `auto` chip + tooltip make assignments explainable, manual override sticks by construction, and unbinding never re-triggers evaluation for that session |
| M3-R7 | Notification rules grow into M6's engine prematurely                            | Matcher is a pure function with a closed trigger list (4 task triggers only); toast sink is the only sink; anything OS-level or non-task is explicitly Appendix-B deferred                   |

---

## Appendix A — Settings & data introduced in M3

| Where                                 | Key / shape                                                                                                               | Writer                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `task_events` (existing table)        | rows per D-M3-3 vocabulary                                                                                                | store layer (T1), MCP (T5) |
| `room_rules` (existing table)         | CRUD via typed IPC                                                                                                        | rules editor (T8)          |
| `notification_rules` (existing table) | CRUD via typed IPC                                                                                                        | settings UI (T14)          |
| settings KV `board.view.<panelId>`    | `{ room?, assignee?, priority?, hq? }` panel params persisted via layout tree (no new key — panel params already persist) | board panel (T10)          |

No schema migration in M3 — every table this milestone needs has existed since M0 (`001_init.sql`); the milestone's backend work is store modules + IPC over them. If within-column manual ordering is demanded during dogfood, a `tasks.sort_order` migration is the named M4 follow-up.

## Appendix B — Deliberately NOT in M3 (so nobody "helpfully" adds them)

- **Desktop/OS notifications, tray, `Notification`-hook passthrough** — M6 Epic 22; M3's toast center + rule matcher are its substrate, the plugin is its delta.
- **Meetings action-items → tasks, standups, scheduler** — M4 (Epic 16/17); the board's `run_started` linkage is the seam they will reuse.
- **Within-column card ordering persistence** — visual-only in v2.0 (Appendix A note).
- **Git write operations** (stage, commit, branch switch, worktree create) — explicitly read-only in v2.0 (master plan Epic 15 AC).
- **Per-session MCP identity tokens** — M4 follow-up filed at T5 (M3-R2).
- **3D task wall / room visualization of the board** — M5; the board store's selectors are already shaped for it (by-room grouping), which is all M5 needs from us.
- **Docs editing** — the docs panel is a reader; editing happens in the user's editor (handoff exists).

## Appendix C — The frozen M3 surface (single source of truth for the UI lanes)

New IPC commands after Lane 0 T5 (everything the UI lanes may call; anything missing here is a Lane-0 bug, not a UI workaround):

| Command                                                        | Returns              | Task |
| -------------------------------------------------------------- | -------------------- | ---- |
| `get_task(id)`                                                 | `Task \| null`       | T1   |
| `list_task_events(task_id)`                                    | `TaskEvent[]` (asc)  | T1   |
| `record_task_run_started(task_id, session_id, agent_id?)`      | `TaskEvent`          | T1   |
| `record_task_run_finished(task_id, session_id, outcome)`       | `TaskEvent`          | T1   |
| `list_room_rules(room_id?)` / `create/update/delete_room_rule` | `RoomRule[]` etc.    | T2   |
| `pick_folder()`                                                | `string \| null`     | T3   |
| `list_doc_tree(project_id)`                                    | `DocEntry[]`         | T3   |
| `read_doc_file(project_id, rel_path)`                          | `string` (md, ≤2 MB) | T3   |
| `read_doc_image(project_id, rel_path)`                         | `DocImage` (≤8 MB)   | T3   |
| `git_status(project_path)`                                     | `GitStatus`          | T4   |
| `git_diff(project_path, base?)`                                | `GitDiff`            | T4   |
| `git_default_base(project_path)`                               | `string \| null`     | T4   |
| `list/create/update/delete_notification_rule`                  | `NotificationRule[]` | T5   |

MCP tool surface delta (T5): `create_task` + `acting_as?`; `update_task_status` + `acting_as?`, `assignee_agent_id?`; `post_status_update` + `acting_as?`, `task_id?`. No new tools — the seven-tool router stays seven (its completeness test updates only signatures). `DomainEvent` gains **no** new variants in M3: `TaskChanged`/`RoomChanged`/`ProjectChanged`/`SettingChanged`/`SessionBindingChanged` already carry everything the folds of §1 need — a deliberate freeze that keeps the M2 stores untouched.
