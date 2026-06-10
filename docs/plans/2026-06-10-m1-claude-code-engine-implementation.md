# M1 — Claude Code Engine: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full observe + control of Claude Code sessions from the Rust core: transcript watching/parsing for _any_ session (managed or terminal-spawned), managed session lifecycle over the CLI's bidirectional stream-json protocol, structured permissions, the hooks bridge, and the CrewHub MCP server — surfaced through a minimal debug panel.

**Architecture:** A provider-agnostic engine core (`engine/`) defines `SessionProvider`, `SessionMeta`, `SessionEvent`, and `TranscriptItem` — **nothing outside `engine/claude/` may reference Claude Code concepts**. The first (and in M1, only) provider is `ClaudeCodeProvider`, built from four cooperating parts: transcript watcher (read path for everything), process manager (write path for managed sessions), hooks receiver (low-latency signals), and headless runner. The CrewHub MCP server and the hooks installer live outside the provider because future providers may reuse them differently.

**Tech Stack additions:** tokio (process, fs, net) · notify v8 (FSEvents/inotify) · rmcp (official Rust MCP SDK, streamable-HTTP server) + axum · SQLite FTS5 (bundled) · a `crates/crewhub-signal` helper binary (Tauri sidecar) · fake-`claude` test binary for deterministic CI.

**Linear mapping:** Epic 4 = EKI-12 (4.1 EKI-41, 4.2 EKI-42, 4.3 EKI-45, 4.4 EKI-46) · Epic 5 = EKI-13 (5.0 _new issue — provider seam_, 5.1 EKI-48, 5.2 EKI-50, 5.3 EKI-51, 5.4 EKI-53, 5.5 EKI-55) · Epic 6 = EKI-15 (6.1 EKI-56, 6.2 EKI-57) · Epic 7 = EKI-17 (7.1 EKI-61, 7.2 EKI-63, 7.3 EKI-65, 7.4 EKI-67) · Epic 8 = EKI-18 (8.1 EKI-68, 8.2 EKI-69, 8.3 EKI-72, 8.4 EKI-73).

**Diagram:** `docs/plans/2026-06-10-m1-claude-code-engine.drawio` (page 1: engine architecture incl. provider seam; page 2: task graph).

**Grounding:** CLI flags and transcript structure verified against the locally installed Claude Code **2.1.172** on 2026-06-10 (see §2). The fixture-first strategy (§3) is the defense against version drift — when facts and plan disagree, trust the fixtures.

---

## 1. The Provider Seam (design contract for this milestone)

Per the master plan (§4.2 D2, §4.3) **and explicit product direction: Codex and other runtimes may be added later; Claude Code is simply the first provider.** M1 must make that cheap, without building speculative adapters now (YAGNI: exactly one impl ships).

### Rules (enforced in review, stated in `engine/mod.rs` docs)

1. **Naming firewall.** Only `engine/claude/**` may contain the words claude/anthropic or CC-specific concepts (transcript JSONL paths, control protocol, hooks). `engine/{provider,events,types}.rs`, the IPC layer, stores, and UI are provider-neutral.
2. **Capability flags, not feature assumptions.** UI never asks "is this Claude Code?" — it asks `caps.permissions`, `caps.fork`, `caps.thinking`. A future Codex provider with fewer capabilities degrades gracefully with zero UI changes.
3. **One event stream.** All providers emit the same `SessionEvent`; the engine aggregates streams from every registered provider into one broadcast channel that feeds IPC.
4. **Provider-scoped IDs.** `SessionId = { provider: ProviderId, id: String }` so two providers can never collide.

### Core types (Task 1 implements these verbatim)

```rust
// src-tauri/src/engine/provider.rs
pub type ProviderId = &'static str; // "claude-code"; later: "codex", ...

#[derive(Debug, Clone, Copy, Default, Serialize, specta::Type)]
pub struct ProviderCaps {
    pub spawn: bool,            // can start new managed sessions
    pub resume: bool,           // resume an ended/external session by id
    pub fork: bool,             // resume into a NEW session, original untouched
    pub permissions: bool,      // structured permission request/response
    pub interrupt: bool,
    pub thinking: bool,         // emits thinking items
    pub subagents: bool,        // parent/child lineage
    pub headless_runs: bool,    // one-shot non-interactive runs
    pub hooks: bool,            // realtime signals beyond transcript polling
    pub mcp_registration: bool, // can register CrewHub's MCP server
}

#[async_trait::async_trait]
pub trait SessionProvider: Send + Sync + 'static {
    fn id(&self) -> ProviderId;
    fn caps(&self) -> ProviderCaps;
    async fn list_sessions(&self) -> Vec<SessionMeta>;
    async fn spawn(&self, spec: SpawnSpec) -> anyhow::Result<SessionId>;
    async fn send(&self, id: &SessionId, input: UserInput) -> anyhow::Result<()>;
    async fn respond_permission(&self, id: &SessionId, resp: PermissionResponse) -> anyhow::Result<()>;
    async fn answer_question(&self, id: &SessionId, resp: QuestionResponse) -> anyhow::Result<()>;
    async fn interrupt(&self, id: &SessionId) -> anyhow::Result<()>;
    async fn kill(&self, id: &SessionId) -> anyhow::Result<()>;
    fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SessionEvent>;
}

pub struct ProviderRegistry { providers: Vec<std::sync::Arc<dyn SessionProvider>> }
impl ProviderRegistry {
    pub fn register(&mut self, p: std::sync::Arc<dyn SessionProvider>);
    pub fn get(&self, id: ProviderId) -> Option<&std::sync::Arc<dyn SessionProvider>>;
    pub fn all(&self) -> &[std::sync::Arc<dyn SessionProvider>];
    /// Fan-in: forwards every provider's events into one channel for IPC.
    pub fn aggregate_events(&self) -> tokio::sync::broadcast::Receiver<SessionEvent>;
}
```

```rust
// src-tauri/src/engine/types.rs (provider-neutral)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
pub struct SessionId { pub provider: String, pub id: String }

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SessionMeta {
    pub id: SessionId,
    pub origin: SessionOrigin,             // Managed | External
    pub project_path: String,
    pub model: Option<String>,
    pub status: SessionStatus,             // Working | WaitingForInput | WaitingForPermission | Idle | Ended
    pub activity_detail: Option<String>,   // "Editing src/foo.rs"
    pub parent: Option<SessionId>,         // subagent lineage
    pub usage: UsageTotals,                // input/output/cache tokens (provider-best-effort)
    pub git_branch: Option<String>,
    pub last_activity_ms: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "type", content = "data")]
pub enum SessionEvent {
    Discovered { meta: SessionMeta },
    Updated { meta: SessionMeta },
    Removed { id: SessionId },
    Item { id: SessionId, item: TranscriptItem, seq: u64 },
    PermissionRequest { id: SessionId, request: PermissionRequest },
    Question { id: SessionId, question: QuestionRequest },
    Signal { id: SessionId, signal: HookSignal },          // realtime; degraded mode = absent
    Conflict { path: String, sessions: Vec<SessionId> },
}

/// Provider-neutral transcript item. Claude-specific raw lines are MAPPED into this,
/// never exposed. `Unknown` preserves raw JSON so the UI can show "unsupported item"
/// and we never crash on format drift.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "data")]
pub enum TranscriptItem {
    UserText { text: String, ts: i64 },
    AssistantText { text: String, ts: i64 },
    Thinking { text: Option<String>, redacted: bool, ts: i64 },
    ToolUse { tool: String, input_json: String, tool_use_id: String, ts: i64 },
    ToolResult { tool_use_id: String, output_preview: String, is_error: bool, ts: i64 },
    Image { media_type: String, ts: i64 },
    SystemNote { text: String, ts: i64 },
    Usage { input_tokens: i64, output_tokens: i64, cache_read: i64, ts: i64 },
    Unknown { raw_type: String, ts: Option<i64> },
}
```

**Definition of done for the seam (M1 exit):** a code-review grep proves rule 1 (`grep -ri "claude" src-tauri/src --include="*.rs" -l` returns only `engine/claude/**` + the registration line in `lib.rs`), and the debug panel renders exclusively from provider-neutral types.

---

## 2. Verified facts (Claude Code 2.1.172, this machine, 2026-06-10)

- **Transcripts:** `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. Observed line `type`s in a real transcript: `user`, `assistant`, `system`, `attachment`, `file-history-snapshot`, `last-prompt`, `mode`, `permission-mode`, `ai-title`, `queue-operation` — the last six carry session metadata/config and map to `SystemNote`/internal state or are skipped. Messages carry `sessionId`, `uuid`, `parentUuid`, **`isSidechain`** (subagent flag), `cwd`, `gitBranch`, `version`, `timestamp`.
- **Assistant content blocks observed:** `text`, `thinking`, `tool_use`, `tool_result`, `image`. Usage keys include `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.
- **CLI:** `--print` + `--input-format stream-json` + `--output-format stream-json` (+ `--include-partial-messages` for deltas, `--replay-user-messages` for input acks). `--session-id <uuid>` pins the id at spawn (we generate it → we know the transcript path immediately). `--resume [id]`, `--continue`, `--append-system-prompt`, `--model`, `--permission-mode`, `--allowedTools/--disallowedTools`, `--mcp-config` all present.
- **Unverified, must be pinned by spike (Task 9, first step):** exact shape of stream-json **control protocol** messages (permission `control_request`/`control_response`, interrupt) on 2.1.x. The fake-CLI fixtures get authored from that spike's recordings.

---

## 3. Cross-cutting test strategy

1. **Fixture-first.** `src-tauri/fixtures/transcripts/` holds sanitized real JSONL files (collected by Task 2's sanitizer from this machine, incl. a sidechain/subagent one and a CC-2.1 full-feature one). The parser test suite iterates _every_ fixture and asserts: zero panics, zero `Unknown` for known types, lineage resolved. Adding support for a new CC version = drop in a new fixture.
2. **Fake CLI.** `crates/fake-claude` reads a scenario file (sequence of stream-json lines to emit, expected stdin messages, exit behavior) so Epics 5–6 get deterministic integration tests in CI without API access or credentials. One ignored-by-default `#[ignore]` smoke test runs against the real `claude` locally.
3. **Live canary (CI, non-blocking).** A scheduled weekly job parses the newest local-format fixtures and fails loudly if `Unknown` rates exceed 5% — early warning for CC format drift (wired in Task 25).
4. Unit-test conventions from M0 carry over (in-memory Store, MockRuntime for IPC commands, TDD per module).

---

## 4. File structure (locked in)

```
crewhub2/
├── Cargo.toml                      # NEW: workspace root [src-tauri, crates/*]
├── crates/
│   ├── crewhub-signal/             # T16: hook helper binary (sidecar, <50ms, always exit 0)
│   └── fake-claude/                # T8: scenario-driven fake CLI for tests
├── src-tauri/
│   ├── fixtures/
│   │   ├── transcripts/*.jsonl     # T2: sanitized real transcripts
│   │   └── control/*.jsonl        # T9 spike: recorded control-protocol exchanges
│   └── src/
│       ├── engine/
│       │   ├── mod.rs              # registry wiring + seam rules doc
│       │   ├── provider.rs         # T1: trait + registry + caps
│       │   ├── types.rs            # T1: SessionId/Meta/Event/TranscriptItem
│       │   ├── status.rs           # T6: provider-neutral status state machine
│       │   └── claude/
│       │       ├── mod.rs          # ClaudeCodeProvider (implements SessionProvider)
│       │       ├── transcript.rs   # T3/T4: JSONL line → TranscriptItem mapping
│       │       ├── watcher.rs      # T5: ~/.claude/projects watcher + tailer
│       │       ├── process.rs      # T9–T12: managed child processes
│       │       ├── control.rs      # T9/T14/T15: stream-json control protocol
│       │       └── headless.rs     # T13: one-shot -p runs
│       ├── hooks/
│       │   ├── receiver.rs         # T16: UDS listener → HookSignal
│       │   ├── installer.rs        # T17: fenced ~/.claude/settings.json block
│       │   ├── context.rs          # T18: SessionStart additionalContext payload
│       │   └── conflicts.rs        # T19: PreToolUse path registry
│       ├── mcp/
│       │   ├── server.rs           # T20: rmcp streamable-HTTP, loopback + token
│       │   └── tools.rs            # T21/T22: task/context/messaging tools
│       ├── history/
│       │   └── mod.rs              # T7: archive listing + FTS5 index
│       └── ipc/ (extended)         # engine commands/events for the debug panel
└── src/panels/debug/               # T24: sessions list + raw event tail (throwaway-quality OK)
```

---

## Epic 5.0 — Engine Core Model _(new Linear sub-issue under EKI-13)_

### Task 1: Provider trait, registry, neutral types (S)

- [ ] Workspace-ify the repo (root `Cargo.toml` with `members = ["src-tauri", "crates/*"]`; verify `pnpm tauri dev` + CI still build).
- [ ] Implement §1 types verbatim in `engine/{provider,types}.rs` + `ProviderRegistry` with `aggregate_events` (tokio broadcast fan-in task). TDD: a `TestProvider` in tests emits events through the registry; subscriber receives them tagged with the right `SessionId.provider`.
- [ ] IPC: `list_all_sessions()` command (iterates registry) + `EngineEvent` tauri-specta event wrapping `SessionEvent`; regenerate bindings.
- [ ] AC: registry test green; bindings expose neutral types only; commit.

## Epic 4 — Transcript Watcher & Parser

### Task 2: Fixture harness + sanitizer (S) — part of EKI-41

- [ ] Write `scripts/collect-fixture.py`: takes a real `~/.claude/projects/**.jsonl`, replaces text/thinking/tool payload _values_ with same-shape placeholders (lengths preserved), keeps all structure/keys/types, writes to `src-tauri/fixtures/transcripts/`.
- [ ] Collect ≥4 fixtures from this machine: (a) rich tool-use session, (b) session with thinking + images, (c) session containing sidechain/subagent lines, (d) a tiny fresh session. Document provenance (CC version) in a fixtures README.
- [ ] AC: fixtures committed; sanitizer is idempotent; no real prompt text in repo (spot-check).

### Task 3: Parser core (M) — EKI-41

- [ ] TDD in `engine/claude/transcript.rs`: `parse_line(&str) -> Option<RawLine>` + `map(RawLine) -> Vec<TranscriptItem>`. Cover: user text, assistant `text`/`thinking`/`tool_use`/`tool_result`/`image` blocks, usage extraction, `system` → `SystemNote`, metadata lines (`mode`, `permission-mode`, `ai-title`, `last-prompt`, `queue-operation`, `attachment`, `file-history-snapshot`) → session-state side-table or skip, garbage line → `None` (never panic), unknown `type` → `Unknown { raw_type }`.
- [ ] Property test over every fixture: full-file parse, assert zero panics + `Unknown` count == 0 for the curated fixtures.
- [ ] Throughput probe test (`#[ignore]` perf): ≥50k lines/s on the rich fixture.
- [ ] AC: all fixture tests green; commit.

### Task 4: Lineage, session header & per-session state (S) — EKI-41

- [ ] From parsed lines, build `SessionHeader { session_id, cwd, git_branch, version, model?, parent? }`. Resolve subagent lineage via `isSidechain` + `parentUuid` chains; humanize subagent display names (v1 lesson — no raw `parent=` labels).
- [ ] AC: fixture (c) yields a parent→child tree with readable names; commit.

### Task 5: Projects-dir watcher + tailer (M) — EKI-42

- [ ] `engine/claude/watcher.rs`: `notify` recursive watch on `~/.claude/projects`; per-file tail state (byte offset, partial-line buffer); debounce 100ms; on change parse only new lines → emit `Item` events + recompute `SessionMeta` → `Discovered`/`Updated`. Recency window (default 30 min, setting `engine.recency_minutes`) decides active set; files deleted/rotated → `Removed`.
- [ ] Integration test: temp dir standing in for `~/.claude/projects` (watch root is injectable); append fixture lines incrementally; assert event order and tail-offset correctness across partial writes.
- [ ] AC: latency test <1s file-write→event; idle CPU spot-check; commit.

### Task 6: Status derivation (M) — EKI-45

- [ ] `engine/status.rs` (neutral): state machine from item stream + optional signals: ToolUse→`Working` w/ activity detail ("Running tests…", "Editing src/foo.rs" — port v1's detail-string quality), trailing AssistantText+quiet→`WaitingForInput`, PermissionRequest pending→`WaitingForPermission`, recency expiry→`Idle`, process exit/file end→`Ended`. Unit test per transition incl. signal-upgrades (hook beats polling).
- [ ] AC: transition table fully covered by tests; commit.

### Task 7: History & FTS5 search (M) — EKI-46

- [ ] Verify bundled SQLite has FTS5 (`SELECT * FROM pragma_compile_options WHERE compile_options LIKE '%FTS5%'`) — if absent, enable the `rusqlite` feature flag accordingly (test first).
- [ ] `history/mod.rs`: lazy index (`transcript_fts(session_id, ts, role, text)`) built per session on first search; transcripts stay on disk (only index in DB). Commands: `list_archived_sessions(project?)`, `search_transcripts(query)`. Migration 002 for the FTS table + index-state table.
- [ ] AC: search over fixtures returns ranked hits with session ids + offsets; re-index is incremental; commit.

## Epic 5 — Managed Session Lifecycle

### Task 8: fake-claude test harness (M) — infra for EKI-48+

- [ ] `crates/fake-claude`: reads `FAKE_CLAUDE_SCENARIO=<path>`; scenario = JSONL of directives `{emit: {...stream-json line...}}`, `{expect_stdin: {...}}`, `{write_transcript: "<line>"}`, `{sleep_ms: n}`, `{exit: code}`. Also writes a transcript file like the real CLI (so watcher integration is exercised end-to-end).
- [ ] AC: harness util `spawn_fake(scenario) -> ClaudeProcess` used by a trivial echo test; commit.

### Task 9: Spawn managed sessions, bidi stream-json (L) — EKI-48

- [ ] **Step 1 — protocol spike (timeboxed ½ day):** run real `claude --print --input-format stream-json --output-format stream-json --include-partial-messages` against a scratch project; record every message shape (init, deltas, tool_use, permission `control_request`, result) into `fixtures/control/`. This pins the control protocol for 2.1.x and seeds fake-claude scenarios.
- [ ] **Step 2:** `engine/claude/process.rs`: `spawn(SpawnSpec)` builds args (`--session-id <generated-uuid>` → transcript path known up front; `--permission-mode`, `--model`, `--append-system-prompt`, `--resume`); supervises child (tokio); stdout lines → `control.rs` dispatcher → events; stderr → log; crash → `Ended` + error surfaced. `send()` writes `{"type":"user", ...}` stream-json to stdin.
- [ ] **Step 3:** `ClaudeCodeProvider` implements the trait: watcher supplies the read path for ALL sessions; process map supplies the write path for managed ones; `caps()` = everything true.
- [ ] **Step 4 — D1 checkpoint (ADR-0001):** record in the PR whether interrupt, permission round-trip, and mid-run input all work via the protocol. If any fails → write ADR-0002 and pivot per ADR-0001 before starting M2.
- [ ] AC: fake-claude integration test: spawn → send → streamed reply → result; one `#[ignore]` real-CLI smoke test passes locally; commit per step.

### Task 10: Resume / fork / model switch (M) — EKI-50

- [ ] Resume: `--resume <id>` into managed mode (works for ended _and_ idle external sessions — "take over"). Fork: `--resume <id> --session-id <new-uuid>` (verify in spike; else `--fork-session`-equivalent found in spike). Model: applied on next spawn; recorded in `SessionMeta`.
- [ ] AC: fake-CLI tests for all three; lineage notes preserved; commit.

### Task 11: Interrupt & kill (S) — EKI-51

- [ ] Interrupt = control-protocol interrupt message (shape from spike); kill = terminate process tree (`SIGTERM`→grace→`SIGKILL`), both reflected in status ≤1s. Tests via fake-claude.

### Task 12: Idle lifecycle & auto-spawn (M) — EKI-53

- [ ] Configurable idle timeout (default 30 min, v1 behavior) ends managed processes; session resumable later (id persisted via `session_bindings`). Agents with `auto_spawn` spawn at app start. Lifecycle events visible in event stream. Tests: tokio time-paused idle test; auto-spawn test with fake CLI.

### Task 13: Headless runner (M) — EKI-55

- [ ] `engine/claude/headless.rs`: one-shot `claude -p "<prompt>" --output-format stream-json` runs; capture result + cost into `run_results` (schema exists since M0); transcript linked by session id. Used later by scheduler (M4) and meetings.
- [ ] AC: fake-CLI test creates a `run_results` row with summary + status; commit.

## Epic 6 — Permissions & Control

### Task 14: Permission request/response (M) — EKI-56

- [ ] `control.rs`: map permission `control_request` → `SessionEvent::PermissionRequest { request: { id, tool, input_json, suggestions } }`; `respond_permission` writes the matching `control_response` (allow once / deny+message). **Allow-always:** persisted rule (`settings` key `perm.rules` json: agent|project + tool pattern) checked _before_ surfacing — auto-respond and emit a `Signal` so the activity feed shows it. Rules listable/revocable via IPC.
- [ ] AC: fake-CLI scenario covering allow/deny/always; rules unit tests (pattern matching); commit.

### Task 15: Questions & plan approval (S) — EKI-57

- [ ] Map AskUserQuestion-style control requests → `SessionEvent::Question` (options, multi-select) and ExitPlanMode approval → a `Question` with `kind: "plan"` + plan markdown; `answer_question` responds. Fixture-driven tests from spike recordings.

## Epic 7 — Hooks Bridge

### Task 16: `crewhub-signal` + UDS receiver (M) — EKI-61

- [ ] `crates/crewhub-signal`: reads hook JSON from stdin, writes one line `{event, session_id, payload}` to `$XDG/`-style socket path (`~/Library/Application Support/CrewHub/signal.sock`), total budget <50ms, **always exit 0** (sessions must never block on CrewHub being down). No deps beyond std (or tiny). Bundle as Tauri sidecar (`externalBin`).
- [ ] `hooks/receiver.rs`: tokio `UnixListener`; line → `HookSignal { event, session_id, tool?, path?, payload }` → routed into the matching provider session's event stream (or buffered 30s for not-yet-discovered sessions).
- [ ] AC: integration test pipes recorded hook payloads through the real helper binary into the receiver; macOS/Linux only (Windows named-pipe = M6 note); commit.

### Task 17: Fenced settings.json installer (M) — EKI-63

- [ ] `hooks/installer.rs`: writes a fenced, idempotent block (markers `//"//crewhub-managed-start"`-style JSON-safe keys) into `~/.claude/settings.json` wiring `SessionStart`, `PreToolUse` (Edit|Write|MultiEdit|Bash matchers), `PostToolUse`, `Stop`, `SubagentStop`, `Notification` → `crewhub-signal`. Round-trip tests on real-world settings fixtures (incl. user content outside the fence, missing file, corrupted JSON → refuse + report). `uninstall()` removes exactly the fence. Opt-in IPC commands + status query.
- [ ] AC: install→uninstall→byte-identical user content, proven by tests; commit.

### Task 18: SessionStart context injection (M) — EKI-65

- [ ] `SessionStart` signal → CrewHub replies (via the hook's stdout contract — helper waits ≤300ms for a one-line response over the socket, else empty): `additionalContext` containing the bound agent's room/project/open-tasks envelope **only when** the session's cwd maps to a registered project. Snapshot-test the envelope.

### Task 19: PreToolUse conflict detection (M) — EKI-67

- [ ] `hooks/conflicts.rs`: per-path registry of (session, ts) on Edit/Write signals; overlap within window (default 120s) → `SessionEvent::Conflict`; optional "block mode" (per settings) replies deny to the hook. Unit tests for windows + multi-session overlap.

## Epic 8 — CrewHub MCP Server

### Task 20: Server core (M) — EKI-68

- [ ] `mcp/server.rs`: rmcp streamable-HTTP server on `127.0.0.1:<random>`, per-launch bearer token (in-memory), axum middleware rejecting bad/missing tokens. First tool `list_crew` (reads agents store). Port+token exposed via IPC for registration UX.
- [ ] AC: integration test with an MCP client crate: handshake, list tools, call `list_crew`; 401 without token; commit.

### Task 21: Task tools (M) — EKI-69

- [ ] Tools: `list_tasks(project?, room?, status?)`, `create_task(title, room_id!, …)` (room_id required — v1 lesson), `update_task_status(task_id, status)`, `post_status_update(text)`. Attribution: token maps to caller session → bound agent → `task_events.actor = "agent:<id>"`. Store mutations emit `DomainEvent` (M0 bus) → board updates live.
- [ ] AC: end-to-end test: MCP call → task row + task_event + DomainEvent observed; commit.

### Task 22: Context & messaging tools (S) — EKI-72

- [ ] `get_room_context(room_id?)` (same envelope as T18), `send_message_to_agent(agent_id, text)` → queues into target managed session via provider `send`, or emits a notification-style event if unmanaged.

### Task 23: Registration UX (S) — EKI-73

- [ ] IPC command `enable_mcp_for_project(project_id)` runs `claude mcp add --transport http crewhub http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"` scoped to the project dir (and removal). Status surfaced per project. **Note:** token rotates per launch → registration refresh on app start for enabled projects.
- [ ] AC: fake-CLI asserts exact `claude mcp add` argv; refresh logic unit-tested; commit.

## Closing

### Task 24: Engine debug panel (M) — M1's only UI

- [ ] `src/panels/debug/`: sessions table (all providers via `list_all_sessions`, origin/status/activity/usage), raw `SessionEvent` tail (last 200), buttons: spawn (pick agent), send text, interrupt, kill, respond to pending permission. Plain shadcn components; this panel is allowed to be ugly — it exists to dogfood the engine and dies in M2.
- [ ] AC: with the real CLI: spawn a session from the panel, watch a terminal-spawned session appear alongside it, answer a permission prompt. (Manual verification checklist in PR.)

### Task 25: M1 exit review

- [ ] Full local + CI gate; Sonar gate OK (coverage discipline from M0 holds — engine logic ≥80% via fixtures/fake-CLI).
- [ ] **Seam audit:** naming-firewall grep (§1) clean; `TestProvider`-only test compiles against the trait without `engine/claude` (proves Codex-readiness).
- [ ] **D1 checkpoint resolution** recorded (ADR-0002 only if pivoting).
- [ ] Live canary CI job (weekly, non-blocking) added; Linear AC walk over all M1 issues; close milestone.

---

## Build order & parallelism

```
T1 (provider core) → T2→T3→T4 (parser) → T5 (watcher) → T6 (status) → T7 (history)
T1 → T8 (fake CLI) → T9 (spawn+spike, D1 ✓) → T10 → T11 → T12 → T13
T9 → T14 → T15
T1 → T16 → T17 → T18 → T19        (hooks lane; T18 needs T21's envelope shape — stub until then)
T1 → T20 → T21 → T22 → T23        (MCP lane)
T6 + T9 + T14 → T24 (debug panel) → T25 (exit)
```

Lanes (parser / process / hooks / MCP) are independent after T1+T8 — suitable for parallel subagent execution.

## Risks specific to M1

| #     | Risk                                                                         | Mitigation                                                                                                                 |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| M1-R1 | Control-protocol shapes differ from assumptions on CC 2.1.x                  | Task 9 Step 1 spike pins them _before_ building; fake-CLI replays recordings; D1 checkpoint is the structured exit         |
| M1-R2 | Hook stdout-response contract (T18) may not support socket round-trip timing | Fallback: SessionStart hook command itself queries CrewHub over HTTP (MCP port) instead of UDS reply; decide in T18 step 1 |
| M1-R3 | Transcript format drift between CC releases                                  | Unknown-tolerant parser + fixture-per-version + weekly canary                                                              |
| M1-R4 | FTS5 missing from bundled SQLite                                             | T7 verifies first; feature-flag fix is one line                                                                            |
| M1-R5 | Provider seam erodes under deadline pressure                                 | Naming-firewall grep + TestProvider compile test are CI checks (T25), not good intentions                                  |
