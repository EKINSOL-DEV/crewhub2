# M4 — Orchestration: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⛔ EXECUTION GATE:** M3 ends with a week of dogfooding M2+M3 together (M3 plan T18: "the author's tasks for M4 are managed on the CrewHub board itself"). **This plan may be EXECUTED only after Nicky green-lights or explicitly waives that gate.** Friction issues filed during that week are M4 input — triage them into the lanes below before starting. Additionally, **T1 (the Q1 spike) gates T3**: nobody builds the meeting engine before the spike's ADR exists.

**Goal:** The crew works together, on schedule, visibly: round-robin meetings orchestrated over managed sessions (with synthesis and action items that become board tasks), scheduled standups, a cron scheduler executing headless runs, lightweight run sequences, a prompt template library, and a subagent/teams tree that makes Claude Code's native orchestration visible.

**Architecture:** M4 adds a new Rust layer — `src-tauri/src/orchestrator/` — that _composes_ the M1 engine rather than extending it: the meeting engine drives `ProcessManager` spawns/sends through the provider registry, the standup engine and scheduler call the (refactored) headless runner, and everything persists state transitions to the M0 tables (`meetings*`, `standups*`, `runs`, `run_results`) **before** acting, so the whole layer is recoverable on restart (the v1 lesson: an app crash mid-meeting must never orphan a meeting). The naming firewall holds: `orchestrator/` is provider-neutral and speaks `SessionProvider`/`SessionEvent` only. M4 is THE milestone where the **haiku-default** principle bites hardest — meetings multiply turns by participants by rounds, standups multiply by agents, schedules multiply by time — so §1 D-M4-3 makes the model policy a first-class, tested contract, not a default buried in a helper. **Playfulness is a core product value:** §1 D-M4-10 names the touches; they are ACs, not garnish.

**Tech Stack additions:** Rust: `croner` (cron expression parsing/next-occurrence — D-M4-4; the only new dependency). Frontend: none — meetings/automation panels are built entirely from existing primitives (panel registry, shared Markdown, ModelPicker, ToastCenter, confetti.css).

**Linear mapping:** Epic 16 Meetings & Standups = EKI-5 (16.1 meeting engine EKI-10 L, 16.2 meeting UI EKI-14 M, 16.3 action items → tasks EKI-19 S, 16.4 standups EKI-21 M) · Epic 17 Automation = EKI-25 (17.1 scheduler EKI-30 M, 17.2 run sequences EKI-35 M, 17.3 prompt template library EKI-39 S) · Epic 18 Subagents & Teams viz = EKI-44 (18.1 lineage model EKI-47 M, 18.2 tree UI EKI-54 M). The Q1 spike (master plan §8) is filed as a new sub-issue under EKI-5, blocking EKI-10.

**Diagram:** `docs/plans/2026-06-11-m4-orchestration.drawio` (page 1: orchestration architecture incl. the persist-then-act recovery loop; page 2: task graph with lane assignments).

**Grounding:** Audited against `main` on 2026-06-11 (M0–M3 merged): `migrations/001_init.sql` (all M4 tables exist since M0), `engine/claude/headless.rs` (`DEFAULT_HEADLESS_MODEL = "haiku"`, `run_headless` has **zero callers** today), `engine/claude/lineage.rs` (directory-layout subagent lineage + `humanize_agent_name` shipped in M1; **zero team awareness** — `grep -ri team src-tauri/src/engine` is empty), `engine/provider.rs` (registry, caps, aggregate event stream), `events.rs` (`DomainEvent` frozen at the M3 surface), `src/stores/**` (no meetings/automation/templates stores), `src-tauri/src/bin/fake-claude.rs` (directives incl. `mcp_call`), `store/mod.rs` (rusqlite_migration, 002 is the latest), `Cargo.toml`/`Cargo.lock` (no cron crate anywhere). Local `claude` CLI is 2.1.173 — available for the spike.

---

## 1. Design decisions (made now, argued here, binding for the milestone)

### D-M4-1 — Q1 spike first: Claude Code _teams_ vs CrewHub round-robin (timeboxed ½ day, hard stop)

Master plan Q1, resolved by **spike before code** (T1, blocks T3). Question: should 16.1 orchestrate meetings as a CC _team_ (one session spawning teammates natively) instead of CrewHub's round-robin over N managed sessions? Method, in priority order with the local CLI 2.1.173: (a) check `claude --help`/docs surface for a teams entry point; (b) if invocable, run ONE cheap teams session in a sandbox project (haiku, trivial 2-teammate prompt) and **record the transcript layout + JSONL as fixtures** (`src-tauri/fixtures/teams/`); (c) write the ADR (`docs/adr/`) scoring teams against the four meeting-engine requirements: per-turn control (timeout/retry/serialization), model-per-turn policy (haiku gathering / upgraded synthesis), restart recovery, deterministic output capture. Pre-registered expectation (to be confirmed or refuted, not assumed): teams optimize for _task delegation_, not _structured discussion_ — they likely fail (a), (c) or (d). **Round-robin is the guaranteed path and T3 builds it regardless of outcome**; the spike's lasting deliverables are the ADR plus teams fixtures for 18.1 (or, if no fixture is cheaply producible, the explicit instruction that 18.1 ships parse-tolerant, D-M4-9). Timebox is **½ day** (tightened from the master plan's 1 day — M3 dogfooding means we already know the round-robin requirements precisely); when the clock runs out, write the ADR with whatever was learned and move on.

### D-M4-2 — Meeting engine: a persisted state machine that acts only after writing (v1 recovery lesson)

States (stored in `meetings.state`): `gathering → round → synthesis → complete`, with `cancelled` and `error` terminal. `gathering` is round 0 — one turn per participant answering the topic cold; `round` repeats N configured discussion rounds where each turn sees a digest of prior turns; `synthesis` is a single headless run producing `output_md`. **Serial turns, always** (master-plan R5; `config_json.parallel` is reserved but unimplemented — the field exists so the schema never changes, the engine rejects it). The invariant that makes recovery work: **persist, then act.** Before each turn the engine writes `current_round`/`current_turn` and the `meeting_turns` row (`started_at`, `session_id`, start `transcript_offset`); only then does it `send()`. On app boot, the orchestrator scans for meetings in non-terminal states and resumes at the persisted position — worst case one turn prompt is re-sent (documented, acceptable; the alternative — marking in-flight turns poisoned — adds states for a sub-1% case). Turn mechanics: each participant gets a **dedicated managed session per meeting** (see D-M4-3 for why), spawned lazily on their first turn and reused across rounds (so agents remember earlier rounds natively — no context re-stuffing); turn completion = the session's status folding back to `Idle`/`WaitingForInput` or a `Signal{stop}`, whichever first; **turn timeout (default 120 s, `config_json.turn_timeout_ms`) + exactly 1 retry** (re-send once; second failure ⇒ turn marked skipped, meeting continues — a missing voice is better than a dead meeting, and the output notes it). **Transcript-offset references, never copied text** (v1 lesson #2): `meeting_turns.transcript_offset` stores the item-sequence offset at turn start; turn content is read back through the provider's `read_transcript` path on demand (round digests, synthesis input, UI display), capped per-turn (8 KB) when building prompts. v1's SSE progress events become `DomainEvent::MeetingChanged { meeting_id }` — the UI refetches the meeting + turns, same fold discipline as M3's `TaskChanged`.

```rust
// src-tauri/src/orchestrator/meeting.rs — the pure core (TDD'd first, driver is thin)
enum Phase { Gathering, Round(u32), Synthesis, Complete, Cancelled, Error }
enum TurnOutcome { Done { end_offset: u64 }, TimedOut, Failed(String) }
enum Effect {
    Persist(MeetingPatch),                      // ALWAYS first in any returned batch
    SpawnParticipant { agent_id: String, model: String },
    SendTurn { session: SessionId, prompt_kind: PromptKind }, // Gathering | Round{digest_refs} | Retry
    AwaitTurn { session: SessionId, timeout_ms: u64 },
    RunSynthesis { model: String },
    EmitChanged,
}
// next(meeting, turns, event: TurnOutcome | Started | Resumed | Cancel) -> (MeetingPatch, Vec<Effect>)
// Table-tested: happy 2-round path, timeout→retry→skip, cancel mid-await,
// resume-from-persisted at every (round, turn) position.
```

### D-M4-3 — Model policy: haiku gathering, explicit upgrade for synthesis — and why meetings get dedicated sessions

This is the milestone where haiku-default stops being a one-line default and becomes architecture. A managed session's model is fixed at spawn — you cannot change it per message. If meeting turns reused the agent's existing chat session (often sonnet+), every gathering turn would bill at chat rates. Therefore: **meetings spawn dedicated per-(meeting, participant) sessions with `SpawnSpec.model` from the policy — default `haiku`** — carrying the agent's persona via `append_system_prompt`. This also buys isolation (a meeting never pollutes a work session's context) and clean recovery (the session id is in `meeting_turns`). **Synthesis runs as one headless call with an explicitly upgraded model** (default `sonnet`) — it is the one step where quality compounds across everything said. Standup gathering runs are headless haiku. The policy is data, not code: settings keys `model_policy.meeting_participant` (default `"haiku"`), `model_policy.meeting_synthesis` (default `"sonnet"`), `model_policy.standup` (default `"haiku"`), surfaced in the meeting/standup dialogs as a pre-filled ModelPicker (per-meeting override allowed, defaults never hardcoded expensive — master plan principle 5). **Tests assert the spec**: the meeting-engine integration test inspects every `SpawnSpec.model` (participants = haiku, synthesis = sonnet) — cost discipline as a regression test. _Alternative considered:_ reusing agents' bound sessions per the master-plan AC's literal wording ("a message into that agent's managed session") — rejected for the model-policy conflict above plus context pollution; the dedicated session is still "that agent's managed session", just born for the meeting. Deviation noted here deliberately.

### D-M4-4 — Scheduler: `croner` for parsing + a hand-rolled tokio loop; NOT `tokio-cron-scheduler`

Choice: the **`croner`** crate (pure cron-expression parser with `find_next_occurrence`, actively maintained, no runtime opinions) + a ~100-line tokio loop we own. _Alternative considered:_ `tokio-cron-scheduler` — the obvious crate, rejected on three grounds: (1) it owns job state in its own store (in-memory or its persistence backends) while **our source of truth must be the `runs` table** — we'd be mirroring rows into a second registry and reconciling enable/disable/edit both ways; (2) deterministic testing is awkward (its clock isn't injectable; ours is — `next_fire(cron, after) -> Option<i64>` and `due_runs(runs, last_tick, now) -> Vec<RunId>` are pure functions TDD'd with fixed timestamps); (3) it drags in job-uuid/notification machinery we'd never use. (`cron` the crate was the second alternative — fine parser, but `croner` has better DOM/DOW semantics and is the more maintained of the two.) Loop design: one tokio task; each tick computes the earliest next occurrence across enabled `schedule_cron` rows (capped at 30 s so DB edits are picked up without a wake channel — simple beats clever here), sleeps, fires due runs through the action dispatcher (D-M4-5), updates `last_run_at`. **Missed-while-closed/asleep policy: fire at most once per run on wake if an occurrence was missed (`last_run_at` < previous occurrence), never burst-replay** — and the automation panel says, in plain copy, "schedules run only while CrewHub is open" (master plan AC: document this honestly).

### D-M4-5 — Runs: one table, three spec shapes, one dispatcher; sequences ride `spec_json`; migration 003 is tiny

`runs.spec_json` becomes a tagged union (validated at write time, parse-tolerant at read time):

```jsonc
{ "action": "prompt",   "project_path": "…", "prompt": "…", "model": "haiku" }      // 17.1 simple run
{ "action": "sequence", "steps": [ { "project_path": "…", "prompt": "… {{previous_output}} …", "model": "…" }, … ] }  // 17.2
{ "action": "standup",  "agent_ids": ["…"], "title": "Daily" }                      // 16.4 scheduled standups
```

One dispatcher (`orchestrator/dispatch.rs`) executes any spec whether triggered by cron, "run now", or a sequence step — scheduler and UI share it, so "run now" is genuinely the same code path as the 03:00 firing. **Sequences are deliberately minimal** (master plan AC: CC subagents/teams cover intra-task orchestration): ordered steps, each a SpawnSpec template; `{{previous_output}}` substitutes the prior step's result text (capped 16 KB); first failure stops the sequence; each step writes its own `run_results` row. That needs one schema addition — **migration `003_orchestration.sql`: `ALTER TABLE run_results ADD COLUMN step_index INTEGER`** — the first migration since M0, kept to that single statement. _Alternative considered:_ dedicated `sequences`/`sequence_steps` tables — rejected; the `runs` row IS the sequence, history lands in `run_results` like every other run, and the UI gets per-step transcripts for free via `run_results.session_id`. Prerequisite refactor (the audit's sharpest finding): `run_headless` currently fuses execution with `run_results` persistence and demands a `run_id` FK — meetings synthesis and standups need execution _without_ a `runs` row. Split it: `exec_headless(cli, env, project, prompt, model) -> HeadlessExec { session_id, status, text }` (pure execution) + a thin `record_run_result(run_id, step_index, exec)` writer; `run_headless` becomes the composition.

### D-M4-6 — Action items: a fenced JSON tail in synthesis, parsed tolerantly; convert = existing task IPC

The synthesis prompt instructs: end the output with one fenced ` ```json ` block `{"action_items":[{"text":…,"assignee":<participant name|null>,"priority":"low|medium|high"|null}]}`. Parser (`orchestrator/action_items.rs`, pure, fixture-tested): take the **last** well-formed fenced JSON block; tolerate missing/extra fields; on any failure return zero items — **the meeting still completes**, `output_md` is intact, and the UI offers "add action item" manually (graceful, never blocking). Items land in `meeting_action_items` (assignee fuzzy-matched to participant agents by name, else null). Convert-to-task is **one click on the existing M3 surface**: `create_task` with `room_id = meeting.room_id` (the standing room_id lesson — meetings without a room require picking one in the convert dialog), assignee = the item's agent, description links back to the meeting; the created `task_id` is written back to the action item (schema column exists). "Execute" opens the existing `RunWithAgentDialog` (M3 14.2) — zero new run machinery.

### D-M4-7 — Standups: bounded haiku fan-out, honest about silence

A standup = one `standups` row + one short headless run per participating agent (default: all non-archived agents; selectable). Per-agent prompt, assembled in Rust: the agent's open/in-progress tasks (store query) + a digest of their recent activity — last ≤50 transcript items of their most recent session via the provider read path (offsets again, bounded, never raw-file access) — asking for yesterday/today/blockers as a fenced JSON block (same tolerant parser family as D-M4-6). Execution: `exec_headless` with `model_policy.standup` (haiku), **concurrency capped at 2** (master-plan R5: short and bounded), 60 s timeout per agent; a failed/timeout/unparseable response records an entry with `blockers = "(no response 🤷)"` — the standup never hangs on one agent and never fakes an answer. Manual trigger from the UI; scheduled standups are just a `runs` row with the `standup` spec (D-M4-5), so 16.4's "scheduled or manual" AC falls out of 17.1 for free. Results → `standup_entries`, `DomainEvent::StandupChanged`.

### D-M4-8 — Prompt templates: CRUD over the existing table, one `{{var}}` syntax everywhere, skills listed alongside

`prompt_templates` (table exists, zero code) gets a store module + CRUD IPC; change notifications ride `SettingChanged { key: "prompt_templates" }` (the M3 `notification_rules` precedent — no new DomainEvent for config-shaped data). **One substitution syntax — `{{name}}` — shared by templates, sequence steps, and the composer**, with `variables_json` declaring names + optional defaults; the TS `renderTemplate(template, vars)` and the Rust sequence substitution are both pure and tested against the same fixture table (documented as a contract; `{{previous_output}}` is just a reserved variable). Composer integration: an insert popover listing templates (global + current project's) **alongside the project's slash commands and skills** from the existing `list_slash_commands` IPC (master plan AC: the library reflects what sessions can actually do — slash commands insert as `/name`, templates as rendered text after a variable-fill mini-form). Run/sequence spec editors get the same picker for their prompt fields.

### D-M4-9 — Lineage completion: roots resolution in TS, teams detection parse-tolerant in Rust

What EXISTS (M1, don't rebuild): directory-layout subagent lineage (`<project>/<parent-id>/subagents/agent-*.jsonl`), `SessionMeta.parent`, `is_sidechain`/`agent_id` header extraction, `humanize_agent_name` (v1's readable-names fix). What 18.1 actually adds: **(a) roots resolution + forest assembly as a pure TS selector** in `stores/sessions.ts` — `buildSessionForest(metas) -> TreeNode[]` grouping by walking `parent` links; sessions whose parent is unknown/gone become roots themselves (orphan tolerance), sorted by recency; this is frontend work because every input is already on `SessionMeta`. **(b) Team relationships in Rust**, where transcripts are read: a `team: Option<TeamInfo { team_id, role }>` field added to `SessionMeta` (provider-neutral, like `parent`), populated by the claude provider **only when the spike produced fixtures** that pin the format; absent fixtures, the detector ships as a parse-tolerant skeleton — it looks for the spike-documented markers, treats absence as "no team", **never panics on unknown shapes** (the M1 `Unknown`-tolerance discipline), and the tree UI renders team groups only when `team` is present. Either way 18.2 is unblocked: subagent trees alone satisfy its core AC; team grouping is progressive enhancement that lights up when detection lands.

### D-M4-10 — Playfulness inventory M4 (named, concrete, reduced-motion-aware — these are ACs)

| Name                | Where             | What                                                                                                                                                                                                                    |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Round Table**     | meeting live view | participants' avatars seated in an arc; the active speaker pulses with typing dots, finished turns get a ✅ chip, skipped turns a sleepy 💤 (reduced-motion: static highlight)                                          |
| **Gavel Drop**      | meeting synthesis | synthesis stage shows a ⚖️→🔨 gavel tap; meeting completion fires the confetti burst (reuses M2 `confetti.css`, ≤1 s, reduced-motion: skipped)                                                                          |
| **Coffee Standup**  | standup view      | each agent's entry renders as a sticky note with a ☕; agents who didn't answer get the "🤷 (no response)" note styled as a cold coffee                                                                                 |
| **Cron Critter**    | automation panel  | enabled schedules show a softly ticking ⏰ chip (CSS keyframe, reduced-motion: static); "Run now" buttons launch with a tiny 🚀                                                                                         |
| **Quiet Orchestra** | empty states      | meetings "🎻 no meetings yet — gather the crew", automation "⏰ nothing scheduled — the crew sleeps in", templates "📜 no templates yet", standups "☕ no standups yet", tree "🌱 no subagents spawned in this session" |

Closed inventory — anything not named here is M5 world material. All touches behind the existing `use-reduced-motion.ts` hook with media-query-mock tests.

### D-M4-11 — Event & panel surface: three new DomainEvent variants, two new PanelKinds

`DomainEvent` += `MeetingChanged { meeting_id }`, `RunChanged { run_id }`, `StandupChanged { standup_id }` — these carry live progress, so they earn variants (unlike templates, D-M4-8). `PanelKind` += `"meetings" | "automation"` (registry + palette per the M3 T6 pattern); the tree UI adds **no** panel — it lives inside the existing sessions panel and chat header. Frontend folds follow M3's reconcile-by-refetch discipline: event → single-entity refetch IPC (`get_meeting`, `get_run`, …), never payload-stuffed events.

---

## 2. Current surface — audit & gaps (what Lane 0 must add)

What exists and is sufficient: all M4 tables since M0 (`meetings`, `meeting_turns`, `meeting_action_items`, `standups`, `standup_entries`, `runs`, `run_results`, `prompt_templates` — including `transcript_offset`, `current_round/turn`, `task_id` linkage columns); `ProcessManager` spawn/send/interrupt/kill with status events; `run_headless` writing `run_results` (haiku default); provider registry + `read_transcript`/`list_archived` read paths; subagent lineage + humanized names; M3's task IPC + `RunWithAgentDialog` for 16.3; `list_slash_commands` for 17.3; fake-claude with `emit`/`expect_stdin`/`expect_arg`/`write_transcript`/`sleep_ms`/`mcp_call`.

Gaps found (each becomes a Lane-0 task step):

| #   | Gap                                                                                                                                                                                                                                                                                               | Blocks       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| G1  | **Meetings store modules don't exist beyond schema.** No `store/meetings.rs`, no turn/action-item helpers, no IPC — Epic 16's persistence layer is entirely unbuilt                                                                                                                               | EKI-10/14/19 |
| G2  | **No meeting engine, no orchestrator layer at all.** `run_headless` has zero callers; nothing drives multi-turn anything                                                                                                                                                                          | EKI-10       |
| G3  | **No scheduler, no cron dependency.** `croner` absent from Cargo.lock; no loop, no due-computation, no run-now IPC (crate choice argued in D-M4-4)                                                                                                                                                | EKI-30       |
| G4  | **`runs`/`run_results` have no store module or IPC.** `run_results` is written only inside `run_headless` via raw SQL; nothing lists/creates/enables runs                                                                                                                                         | EKI-30/35    |
| G5  | **`run_headless` fuses execution with persistence** (requires a `runs.id` FK) — meetings synthesis and standups need execution without a `runs` row; split per D-M4-5                                                                                                                             | EKI-10/21    |
| G6  | **No sequence representation.** `spec_json` shape undefined; `run_results` lacks `step_index` (migration 003); no `{{previous_output}}` substitution exists in Rust                                                                                                                               | EKI-35       |
| G7  | **`prompt_templates` has zero code.** No store module, no IPC, no renderer on either side (D-M4-8)                                                                                                                                                                                                | EKI-39       |
| G8  | **`standups`/`standup_entries` have zero code**; no digest assembly, no fan-out runner                                                                                                                                                                                                            | EKI-21       |
| G9  | **No team representation anywhere.** `SessionMeta` has `parent` only; engine has zero team-related code; the transcript format for teams is unverified — spike fixtures or parse-tolerant skeleton per D-M4-1/D-M4-9                                                                              | EKI-47/54    |
| G10 | **`DomainEvent` frozen at the M3 surface** — no meeting/run/standup variants; no `get_meeting`-style single-entity refetch IPC for any M4 entity                                                                                                                                                  | all UI lanes |
| G11 | **fake-claude scenario selection is process-global** (`FAKE_CLAUDE_SCENARIO` is one env var) — a 3-participant meeting test spawns 3 processes that would all read the same script; add per-spawn selection (e.g. a `match_arg` directive or `FAKE_CLAUDE_SCENARIO_DIR` keyed by a prompt marker) | EKI-10 tests |

No gap (checked, works today): `meetings` schema covers recovery (`state`, `current_round`, `current_turn`, timestamps incl. `cancelled_at`/`error_message`); `meeting_turns.transcript_offset` exists for the no-copy rule; `meeting_action_items.task_id` covers 16.3 linkage; `runs.kind` CHECK already admits `scheduled`/`manual`/`pipeline_step`; ModelPicker + haiku-default conventions established in M2/M3.

---

## 3. Cross-cutting test strategy

1. **Pure-function-first.** The meeting state machine transition function (`next_state(meeting, event) -> (Meeting, Vec<Effect>)` — effects as data, executed by a thin driver), `next_fire`/`due_runs` (injected clock), sequence/template substitution (both languages, shared fixture table), the action-item/standup JSON parsers (malformed fixtures), and `buildSessionForest` (orphans, deep nesting) are all pure and exhaustively unit-tested before any wiring.
2. **Recovery is a test, not a hope.** Integration test: start a 3-participant meeting against fake-claude, kill the orchestrator mid-round (drop the driver task), construct a fresh orchestrator over the same store, assert it resumes at the persisted round/turn and completes — the v1 lesson, mechanized. Same pattern for a sequence interrupted between steps (it must NOT resume — sequences are atomic-or-stopped; the result row says `interrupted`).
3. **Cost discipline as assertions.** The meeting engine test asserts every participant `SpawnSpec.model == "haiku"` and the synthesis exec model == the configured upgrade; the standup test asserts haiku + concurrency ≤ 2 (probe via spawn timestamps).
4. **Timeout/retry against fake-claude.** A scenario that sleeps past the (test-shortened) turn timeout exercises retry-once-then-skip; G11's per-spawn scenario selection lands first.
5. **Mocked bindings, real stores** for all panels (M2/M3 pattern): renders-empty (Quiet Orchestra), renders-data, reacts-to-event (MeetingChanged mid-meeting moves the Round Table highlight), error states.
6. **E2E happy path (the milestone's flagship):** start a 2-agent, 1-round meeting against fake-claude → Round Table progresses → synthesis (fake emits the fenced JSON tail) → output renders, 2 action items shown → convert one to a task → it appears on the M3 board → Run-with-agent on it. Plus: create a schedule with a near-future cron → fires → result row + toast; tree: fake-claude `write_transcript` creates a subagent file → tree node appears under the parent.
7. **Scheduler clock tests never sleep real time** — `due_runs` is pure; the loop test injects a 50 ms cap and a fake dispatcher.

---

## 4. File structure (locked in — ownership per lane)

```
crewhub2/
├── src-tauri/
│   ├── migrations/003_orchestration.sql      # T2 — run_results.step_index (one ALTER)
│   └── src/                                  # Lane 0 owns src-tauri/** + regenerated bindings.ts
│       ├── orchestrator/                     # NEW layer — provider-neutral, composes engine/
│       │   ├── mod.rs                        # T3 — boot recovery scan, driver task ownership
│       │   ├── meeting.rs                    # T3 — state machine (pure) + turn driver
│       │   ├── action_items.rs               # T3 — fenced-JSON tail parser (pure)
│       │   ├── standup.rs                    # T4 — digest assembly + bounded fan-out
│       │   ├── scheduler.rs                  # T5 — croner next_fire/due_runs (pure) + tokio loop
│       │   ├── dispatch.rs                   # T5/T6 — spec_json action dispatcher
│       │   └── substitute.rs                 # T6 — {{var}} substitution (shared syntax, D-M4-8)
│       ├── store/{meetings,standups,runs,prompt_templates}.rs   # T2 NEW (tables exist)
│       ├── engine/claude/headless.rs         # T2 — split exec_headless / record_run_result (G5)
│       ├── engine/claude/lineage.rs          # T7 — team detection (fixtures or tolerant skeleton)
│       ├── engine/types.rs                   # T7 — SessionMeta.team: Option<TeamInfo>
│       ├── events.rs                         # T2 — +MeetingChanged/RunChanged/StandupChanged
│       └── bin/fake-claude.rs                # T3 — G11 per-spawn scenario selection
├── src/
│   ├── app/{layout-tree,panel-registry,palette-actions}        # T9 (main lane): +2 PanelKinds, then frozen
│   ├── stores/
│   │   ├── meetings.ts  standups.ts          # Lane G — refetch folds of MeetingChanged/StandupChanged
│   │   ├── automation.ts                     # Lane H — runs + results fold of RunChanged
│   │   ├── templates.ts                      # Lane H — SettingChanged{prompt_templates} fold + renderTemplate
│   │   └── sessions.ts                       # Lane H (T16) — buildSessionForest selector ONLY (additive)
│   ├── panels/
│   │   ├── meetings/                         # Lane G: MeetingsPanel, StartMeetingDialog, RoundTable,
│   │   │   └── …                             #   MeetingOutput, ActionItemsList, StandupView
│   │   └── automation/                       # Lane H: AutomationPanel, ScheduleEditor, SequenceEditor,
│   │       └── …                             #   RunHistory, TemplateLibrary, cron-describe.ts
│   └── panels/sessions/SessionTree.tsx       # Lane H (T16) — tree UI, mounted in sessions panel + chat header
└── e2e/meeting.spec.ts + e2e/automation.spec.ts                # Lanes G/H
```

Cross-lane touch points (explicit): Lane G's `ActionItemsList` imports the M3 board's `RunWithAgentDialog` and task IPC (read-only reuse, no board edits); Lane H's composer template-insert popover adds one mount point in `panels/chat` (single ≤10-line diff, coordinated in T15); `stores/sessions.ts` gets only the additive forest selector (T16) — no existing fold changes.

---

## Lane 0 — Spike + backend (serial, FIRST; owns `src-tauri/**` + `src/ipc/bindings.ts`)

### Task 1: Q1 spike — CC teams vs round-robin (timeboxed ½ day, blocks T3) — D-M4-1

- [ ] Probe `claude` 2.1.173 for a teams entry point; if cheaply invocable, run ONE minimal 2-teammate haiku session in a sandbox project; capture transcript files/layout into `src-tauri/fixtures/teams/` (sanitized).
- [ ] Write `docs/adr/` entry scoring teams vs round-robin on: per-turn control, model-per-turn policy, restart recovery, deterministic output capture; record the 18.1 instruction (fixtures pinned vs parse-tolerant skeleton).
- [ ] AC: ADR merged within the timebox regardless of outcome; round-robin confirmed (or, surprisingly, overturned — which escalates to Nicky before T3 starts); commit.

### Task 2: Stores + migration + events + headless split (M) — G1/G4/G5/G7/G8/G10 substrate

- [ ] Migration `003_orchestration.sql` (`run_results.step_index INTEGER`); `migrations_are_valid` updated.
- [ ] TDD store modules over existing tables: `meetings.rs` (meeting CRUD, state/position updates, turns, action items incl. `task_id` backfill), `standups.rs`, `runs.rs` (CRUD + enable/disable + `last_run_at` + results listing), `prompt_templates.rs` (CRUD). In-memory-store tests per module (M1 pattern).
- [ ] Split `headless.rs` per D-M4-5: `exec_headless` (pure execution, haiku default preserved) + `record_run_result(run_id, step_index, exec)`; `run_headless` recomposed; existing behavior covered by a test before the split (it had none — zero callers).
- [ ] `events.rs`: +`MeetingChanged`/`RunChanged`/`StandupChanged`; IPC: full CRUD + single-entity refetch (`get_meeting`, `list_meeting_turns`, `get_run`, `list_run_results`, `get_standup`, … — full table in Appendix C). Bindings regen; commit.

### Task 3: Meeting engine (L — EKI-10, the milestone centerpiece) — D-M4-2/3, G2/G11

- [ ] TDD the pure state machine (`meeting.rs`): transitions gathering→round(r)→synthesis→complete, cancelled/error, skip-on-double-failure, effects-as-data (`SpawnParticipant`, `SendTurn`, `AwaitTurn{timeout}`, `RunSynthesis`, `Persist`); exhaustive table tests incl. retry and quorum edge cases.
- [ ] Driver task: executes effects via the provider registry — dedicated per-(meeting,participant) sessions (`SpawnSpec.model` = `model_policy.meeting_participant`, persona via `append_system_prompt`), persist-then-act ordering, turn completion fold (status Idle/WaitingForInput or `Signal{stop}`), timeout + 1 retry, `transcript_offset` capture, round digests + synthesis input read back via `read_transcript` (8 KB/turn cap).
- [ ] Synthesis via `exec_headless` with `model_policy.meeting_synthesis`; `action_items.rs` tolerant parser (fixtures: clean, missing fields, broken JSON, no block) → `meeting_action_items` rows.
- [ ] Recovery: orchestrator boot scan resumes non-terminal meetings at persisted position (the §3.2 kill-and-resume integration test); cancel IPC = interrupt in-flight turn + terminal state.
- [ ] fake-claude G11: per-spawn scenario selection; meeting integration test (3 participants, 2 rounds) asserts serial turns, haiku specs, offsets recorded, synthesis model upgrade, `MeetingChanged` emissions. IPC: `start_meeting`, `cancel_meeting`, `convert_action_item(item_id, room_id?)`. Commit.

### Task 4: Standup engine (M — EKI-21 backend) — D-M4-7, G8

- [ ] TDD digest assembly (tasks query + last ≤50 transcript items via read path, bounded) and the yesterday/today/blockers tolerant parser (shares the D-M4-6 parser family).
- [ ] Fan-out runner: `exec_headless` per agent at `model_policy.standup` (haiku), concurrency ≤ 2, 60 s timeout, "(no response 🤷)" entries on failure; rows → `standup_entries`; `StandupChanged` per entry. IPC: `run_standup(agent_ids?, title?)`, `list_standups`, `list_standup_entries`. Commit.

### Task 5: Scheduler + dispatcher (M — EKI-30) — D-M4-4/5, G3/G4

- [ ] Add `croner`; TDD pure `next_fire(cron, after_ms)` + `due_runs(runs, last_tick_ms, now_ms)` (DST/DOM-DOW/missed-once-on-wake cases with fixed clocks).
- [ ] `dispatch.rs`: validate + execute the three `spec_json` shapes (`prompt` now; `sequence` lands T6; `standup` delegates to T4); results via `record_run_result`; `RunChanged` + a completion toast event (notification rules trigger `run_finished` reuses M3's matcher seam).
- [ ] Tokio loop (30 s cap tick, injected clock in tests, fake dispatcher); honest-copy constant exported for the UI ("runs only while CrewHub is open"). IPC: `list_runs`, `create_run`, `update_run`, `delete_run`, `set_run_enabled`, `run_now(run_id)`, `list_run_results(run_id)`. Commit.

### Task 6: Run sequences (M — EKI-35) — D-M4-5/8, G6

- [ ] `substitute.rs`: `{{name}}` substitution (TDD; reserved `previous_output`; missing-variable = typed error, never silent empty).
- [ ] Sequence execution in `dispatch.rs`: serial steps, `previous_output` from prior `HeadlessExec.text` (16 KB cap), first failure stops (remaining steps recorded `skipped`), per-step `run_results` with `step_index`; interrupted-app ⇒ result row `interrupted`, never auto-resumed (§3.2). Integration test: 2-step sequence against fake-claude asserting substitution + halt-on-failure. Commit.

### Task 7: Lineage completion — teams + meta (M — EKI-47) — D-M4-9, G9

- [ ] `engine/types.rs`: `SessionMeta.team: Option<TeamInfo { team_id, role }>` (provider-neutral, additive — UI tolerates absence by construction).
- [ ] `lineage.rs`: team detection per the T1 ADR — fixtures pinned (parse + tests) or the parse-tolerant skeleton (marker probe, absence = None, unknown-shape fixtures must not panic). Verify subagent discovery + `humanize_agent_name` against the newest local CC transcripts (the M1 canary habit); fix drift if found.
- [ ] Watcher wiring: team info flows into `Discovered`/`Updated` metas; fixture-driven provider test. Commit.

### Task 8: Prompt templates IPC (S — EKI-39 backend) — D-M4-8, G7 — **bindings freeze after this task**

- [ ] IPC over T2's store: `list_prompt_templates(project_id?)`, `create/update/delete_prompt_template` (validate `variables_json` shape; emit `SettingChanged { key: "prompt_templates" }`).
- [ ] Rust↔TS substitution contract: the shared fixture table (template, vars, expected) checked by both the Rust test and a vitest (file copied verbatim, drift = red).
- [ ] Regenerate bindings; **declare the M4 bindings surface frozen** (UI lanes start from this commit); commit.

## Main lane — registry pre-seed

### Task 9: PanelKinds + registry stubs + palette actions (S) — the parallelism unlock — D-M4-11

- [ ] `PanelKind` += `"meetings" | "automation"`; registry entries with Quiet Orchestra empty states; palette: "Start meeting", "Run standup", "Open automation", "New schedule", "Open templates".
- [ ] AC: both panels openable as placeholders; registry-completeness vitest extended; commit. **Lanes G and H fork from here.**

## Lane G — Meetings & standups UI (owns `src/panels/meetings/**`, `src/stores/{meetings,standups}.ts`, `e2e/meeting.spec.ts`)

### Task 10: Meetings store + start dialog + Round Table live view (M — EKI-14 part 1)

- [ ] `stores/meetings.ts`: seed `list_meetings`, fold `MeetingChanged` → `get_meeting` + `list_meeting_turns` refetch (M3 reconcile discipline).
- [ ] `StartMeetingDialog`: topic/goal, participants (agents store, ≥2), rounds (default 2), room (required when converting items later — preselect from filter), context docs (paths from the M3 docs tree, passed into the gathering prompt), **model policy row** (participant ModelPicker pre-filled haiku, synthesis pre-filled sonnet — D-M4-3, never hardcoded).
- [ ] `RoundTable` live view: seated avatars, active-speaker pulse, per-turn status chips (✅/💤), round indicator, live turn text on demand (transcript read via existing transcript IPC at the stored offsets), cancel button.
- [ ] AC: full live meeting against fake-claude renders progress end-to-end; reduced-motion variants; commit.

### Task 11: Meeting output + history + action items → tasks (M+S — EKI-14 part 2 + EKI-19)

- [ ] `MeetingOutput`: `output_md` through shared Markdown; per-turn drill-down (offset reads); error/cancelled states honest ("⚠️ ended early — here's what we had").
- [ ] History browser: meetings list (state badge, participants, duration), filter by room/project.
- [ ] `ActionItemsList`: items with assignee avatars; one-click convert (`convert_action_item`, room picker when meeting has none — the room_id lesson, surfaced in UI copy); converted items deep-link to the board task; "execute" opens the existing `RunWithAgentDialog`. Gavel Drop + completion confetti land here.
- [ ] AC (EKI-14+19): §3.6 E2E flagship path green (meeting → output → convert → board → run-with-agent); commit.

### Task 12: Standup UI (M — EKI-21 UI)

- [ ] `stores/standups.ts` fold; `StandupView`: Coffee Standup sticky notes (yesterday/today/blockers per agent, cold-coffee no-response state), "Run standup now" (agent multiselect), history list.
- [ ] "Schedule this" shortcut: prefills a `standup` run spec and deep-links into Lane H's schedule editor (params only — no cross-lane code edits).
- [ ] AC (EKI-21): manual standup end-to-end against fake-claude; history renders; reduced-motion; commit.

## Lane H — Automation, templates, tree UI (owns `src/panels/automation/**`, `src/stores/{automation,templates}.ts`, `SessionTree.tsx`, `e2e/automation.spec.ts`)

### Task 13: Automation panel — schedules + run history (M — EKI-30 UI)

- [ ] `stores/automation.ts`: seed `list_runs`, fold `RunChanged` → `get_run`/`list_run_results` refetch.
- [ ] `AutomationPanel`: runs table (kind, cron with `cron-describe.ts` human text — pure, TDD'd, e.g. "every weekday at 09:00", enabled toggle, last result badge, Cron Critter chip, 🚀 Run now); `ScheduleEditor` (cron field + next-3-occurrences preview from a TS `next_fire` mirror or a small `preview_cron` IPC — pick IPC, one source of truth); the honest copy ("runs only while CrewHub is open") rendered prominently, not in a tooltip.
- [ ] Run history drawer: `run_results` rows with status/summary/duration; result with `session_id` links to the transcript view.
- [ ] AC (EKI-30): create → fires (E2E with near-future cron) → result + toast; enable/disable/run-now; commit.

### Task 14: Sequence editor + step results (M — EKI-35 UI)

- [ ] `SequenceEditor`: ordered step list (add/remove/reorder), per-step prompt (template picker from T15 store, `{{previous_output}}` chip inserted by button), per-step project + ModelPicker (haiku default), validation (≥1 step, no unknown variables).
- [ ] Step results view: per-step status timeline, halt-on-failure rendered honestly (failed step loud, skipped steps muted), per-step transcript links.
- [ ] AC (EKI-35): 2-step sequence created, run, step transcripts reachable; failure path rendered; commit.

### Task 15: Template library + composer insert (S — EKI-39 UI)

- [ ] `stores/templates.ts` (SettingChanged fold) + `TemplateLibrary` in the automation panel: CRUD, variable list editor, project scoping; `renderTemplate` validated against the shared fixture table (T8).
- [ ] Composer insert popover (the one coordinated chat-panel mount): templates (variable-fill mini-form → rendered insert) alongside slash commands/skills from `list_slash_commands` (insert as `/name`); same picker wired into run/sequence prompt fields.
- [ ] AC (EKI-39): template with variables inserted in composer and used in a run spec; skills listed alongside; commit.

### Task 16: Subagent & team tree UI (M — EKI-54)

- [ ] `stores/sessions.ts`: pure `buildSessionForest(metas)` selector (parent links, orphan-as-root, team grouping when `team` present) — additive only, TDD'd.
- [ ] `SessionTree.tsx`: expandable tree in the sessions panel (live status dot + humanized name per node, team members rendered as a bracketed group); chat header gets a compact subagent strip for the open session's children; clicking any node opens its transcript (existing transcript view, read-only for sidechains).
- [ ] AC (EKI-54): fake-claude `write_transcript` subagent fixture produces a live tree node; clicking opens its transcript; teams group renders when T7 detection supplies `team` (component test with synthetic metas regardless of spike outcome); Quiet Orchestra empty state; commit.

## Closing (main lane, after all lanes merge)

### Task 17: Integration sweep (S)

- [ ] Swap registry stubs for real panels; palette/toast/deep-link routes land (standup "Schedule this" → editor; action item → board task; run result → transcript).
- [ ] Playfulness AC sweep (every D-M4-10 touch + reduced-motion); naming-firewall grep clean (`orchestrator/` contains no claude/anthropic tokens); haiku-assertion tests present for meetings/standups/run defaults.
- [ ] E2E suite green incl. `meeting.spec.ts` + `automation.spec.ts`; commit.

### Task 18: M4 exit review

- [ ] Full local + CI gates (clippy, cargo test, tsc, vitest, E2E, Sonar); bindings drift check clean.
- [ ] Linear AC walk over EKI-10/14/19/21/30/35/39/47/54; close epics EKI-5/25/44; Q1 marked resolved with the ADR linked.
- [ ] **Exit criteria (all must hold):**
  - [ ] A 3-agent meeting runs gathering → 2 rounds → synthesis → complete over managed sessions, live in the Round Table; killing the app mid-round and restarting resumes and completes it (the v1 lesson, demonstrated).
  - [ ] Every meeting/standup/run default is haiku and test-asserted; synthesis is the single explicit upgrade; no expensive model is hardcoded anywhere in M4 code.
  - [ ] An action item converts to a board task in one click and runs with an agent via the M3 dialog; turn content is stored as transcript offsets only (no copied text in the DB — verified by inspection test).
  - [ ] A scheduled run fires while the app is open, a missed occurrence fires once on relaunch, and the UI says plainly that schedules need the app running.
  - [ ] A 2-step sequence passes `{{previous_output}}` and halts on failure with honest step states; templates insert in composer and run specs with skills listed alongside.
  - [ ] A session with subagents renders a live, humanized tree; team grouping renders from fixtures or the tolerant path is documented in the ADR.
  - [ ] One real (non-fake) meeting + standup run by the author on their own crew before signoff — orchestration dogfood, costs observed and sane.
- [ ] File friction list as M5 input issues; close milestone.

---

## Build order & parallelism (Lane 0 first, then G ∥ H)

```
Lane 0 (serial, first): T1(spike, ½d) → T2 → T3 → T4 → T5 → T6 → T7 → T8   [src-tauri/** + bindings]
        └─ T1 gates T3 (ADR before engine); after T8: bindings frozen
Main:   T9 (registry pre-seed, S)                                          [src/app/** — then frozen]

Lane G (meetings):   T10 → T11 → T12        [panels/meetings, stores/{meetings,standups}, e2e/meeting]
Lane H (automation): T13 → T14 → T15 → T16  [panels/automation, stores/{automation,templates}, SessionTree, e2e/automation]

T17 → T18 close out after both lanes merge.
Dependencies: T3 needs T1+T2 (+G11 inside T3); T4 needs T2's exec split; T5 needs T2; T6 needs T5;
T10–T12 need T3/T4 IPC; T13/T14 need T5/T6; T15 needs T8; T16 needs T7.
G and H own disjoint dirs; the two coordinated single-file diffs (chat composer mount T15,
standup deep-link T12→T13 params) are named above — anything else cross-lane is a plan bug.
```

## Risks specific to M4

| #     | Risk                                                                        | Mitigation                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4-R1 | Meetings hit rate/concurrency limits (master-plan R5)                       | Serial turns always; dedicated haiku sessions; standup fan-out capped at 2; per-turn prompt caps (8 KB digests); exit criteria include a real-cost dogfood run                                |
| M4-R2 | Recovery edge cases (app dies between persist and act, double-resumed turn) | Persist-then-act invariant + at-most-one-resent-turn documented; kill-and-resume integration test in CI; effects-as-data keeps the driver thin and auditable                                  |
| M4-R3 | Scheduler drift: sleep/clock changes, missed runs, DST                      | Pure `next_fire`/`due_runs` with fixed-clock tests incl. DST; missed-once-on-wake policy (never burst); honest "app must be running" copy is an AC, not a tooltip                             |
| M4-R4 | CC teams format unknown or drifting (spike inconclusive)                    | Round-robin is the guaranteed path; team detection is additive `Option<TeamInfo>` behind unknown-tolerant parsing; tree UI degrades to subagents-only with zero changes                       |
| M4-R5 | Synthesis/standup JSON tails parse flaky (LLM output discipline)            | Tolerant last-fenced-block parser, zero-items fallback never blocks completion, manual add path in UI; parser fixtures include garbage outputs                                                |
| M4-R6 | Haiku quality too low for discussion rounds (cheap but mumbly)              | Model policy is per-meeting overridable in the start dialog (data, not code); dogfood exit criterion evaluates output quality; upgrade default is a settings change, not a release            |
| M4-R7 | Sequences creep toward a pipeline DAG engine                                | Closed spec: serial steps, one variable, halt-on-failure — anything more is explicitly Appendix B; CC subagents/teams are the answer for rich orchestration (master plan AC says so verbatim) |

---

## Appendix A — Settings & data introduced in M4

| Where                               | Key / shape                                                                                                                         | Writer                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| settings KV                         | `model_policy.meeting_participant` = `"haiku"` · `model_policy.meeting_synthesis` = `"sonnet"` · `model_policy.standup` = `"haiku"` | settings UI / start dialogs      |
| `meetings*` (existing tables)       | state machine rows per D-M4-2; `transcript_offset` refs only — no copied turn text                                                  | orchestrator (T3)                |
| `standups` / `standup_entries`      | fan-out results incl. "(no response 🤷)" honesty rows                                                                               | orchestrator (T4)                |
| `runs` / `run_results`              | `spec_json` tagged union (`prompt` \| `sequence` \| `standup`); `step_index` via migration 003                                      | automation UI + scheduler (T5/6) |
| `prompt_templates` (existing table) | CRUD via typed IPC; `{{name}}` syntax contract shared Rust↔TS                                                                       | template library (T15)           |

Migration count for the milestone: **one** (`003_orchestration.sql`, single ALTER).

## Appendix B — Deliberately NOT in M4 (so nobody "helpfully" adds them)

- **Parallel meeting turns** — `config_json.parallel` is reserved schema, rejected by the engine (R5); revisit only with real rate-limit data.
- **Meetings AS Claude Code teams** — unless T1's ADR overturns expectations (which escalates first); teams appear in M4 only as visualization (18.x).
- **Pipeline DAGs, conditionals, retries-with-backoff in sequences** — closed spec per M4-R7.
- **OS-level scheduling (launchd/Task Scheduler) or background daemon** — the honest in-app scheduler is the v2.0 story; a daemon is a different product decision.
- **Per-session MCP identity tokens** (M3-R2 follow-up) — still backlog; meetings don't need it (turn attribution is by construction, not self-report).
- **Standup nag notifications / Slack-style reminders** — M6 Epic 22 owns notification sinks; M4 emits the events.
- **3D meeting room / standup visualization** — M5; the meetings store's turn/state selectors are already shaped for it.
- **Template sharing/import/marketplace** — local CRUD only; v1 importer (M6 24.1) brings v1 templates over.

## Appendix C — The frozen M4 surface (single source of truth for the UI lanes)

New IPC commands after Lane 0 T8 (anything missing here is a Lane-0 bug, not a UI workaround):

| Command                                                                            | Returns                                    | Task |
| ---------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| `start_meeting(spec)` / `cancel_meeting(id)`                                       | `Meeting`                                  | T3   |
| `list_meetings(project_id?)` / `get_meeting(id)`                                   | `Meeting[]` / `Meeting?`                   | T2   |
| `list_meeting_turns(meeting_id)` / `list_action_items(meeting_id)`                 | `MeetingTurn[]` / `ActionItem[]`           | T2   |
| `convert_action_item(item_id, room_id?)`                                           | `Task` (task_id backfilled)                | T3   |
| `run_standup(agent_ids?, title?)` / `list_standups()` / `list_standup_entries(id)` | `Standup` / `Standup[]` / `StandupEntry[]` | T4   |
| `list_runs()` / `get_run(id)` / `create_run` / `update_run` / `delete_run`         | `Run[]` etc.                               | T5   |
| `set_run_enabled(id, enabled)` / `run_now(id)`                                     | `Run` / `RunResult`                        | T5   |
| `list_run_results(run_id)`                                                         | `RunResult[]` (step_index)                 | T5   |
| `preview_cron(expr)`                                                               | `{ next: i64[3], desc? }`                  | T5   |
| `list_prompt_templates(project_id?)` / `create/update/delete_prompt_template`      | `PromptTemplate[]` etc.                    | T8   |

`DomainEvent` delta: +`MeetingChanged { meeting_id }`, +`RunChanged { run_id }`, +`StandupChanged { standup_id }`; templates ride `SettingChanged { key: "prompt_templates" }`. `SessionMeta` delta: +`team: Option<TeamInfo>` (additive; UI must tolerate `null` by construction). MCP tool surface: **unchanged** in M4 — agents act on meetings/runs in a later milestone if dogfooding demands it; the seven-tool router stays seven.

## Appendix D — Prompt scaffolds (Rust constants in `orchestrator/`, fixture-tested; final wording tuned during T3/T4, structure frozen here)

**Gathering turn** (round 0, per participant, into their dedicated haiku session — persona arrives via `append_system_prompt`, so the turn prompt is lean):

```
You are <agent name>, participating in a CrewHub meeting: "<title>".
Goal: <goal>.
<context docs: inlined ≤2 KB each, listed by path>
Give your opening take in ≤300 words. Be concrete; disagree where you disagree.
Do not use tools. Do not ask questions back — state assumptions instead.
```

**Discussion-round turn** (rounds 1..N — the session already remembers its own prior turns; the digest carries only the OTHERS' latest turns, read back via transcript offsets, ≤8 KB total):

```
Round <r> of <n>. What the others said last round:
<for each other participant: "— <name>: <turn excerpt>">
React in ≤250 words: build on, challenge, or refine. Converge toward
recommendations — round <n> is the last.
```

**Synthesis** (one headless run, upgraded model, full offset-read transcript of all turns as input):

````
You are the meeting scribe. Synthesize this meeting into markdown:
"## Summary" (≤200 words), "## Decisions", "## Open questions".
Then end with EXACTLY ONE fenced json block:
```json
{"action_items": [{"text": "...", "assignee": "<participant name or null>",
                   "priority": "low|medium|high"}]}
```
````

(D-M4-6's parser takes the LAST well-formed fenced block; everything before it is `output_md` verbatim.)

**Standup gathering** (per agent, headless haiku — D-M4-7):

```
You are <agent name>. Based on your recent activity and tasks below, write a standup.
Recent activity: <≤50 transcript items, digested>
Open tasks: <task list with statuses>
Reply with ONE fenced json block: {"yesterday": "...", "today": "...", "blockers": "..." | null}
```

Shared rules, enforced in code, not prose: every scaffold is a `const` with `{{var}}` slots filled by `substitute.rs` (same syntax as templates/sequences — D-M4-8); every inlined excerpt is read through provider offsets at build time (never stored); every byte cap from §1 (2 KB/doc, 8 KB/digest, 16 KB/`previous_output`) lives next to its scaffold as a named constant with a unit test that oversized input truncates with an explicit `… [truncated]` marker — the model is always told it got a cut, never silently fed less.
