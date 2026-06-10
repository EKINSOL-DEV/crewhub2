# CrewHub v2 — Ground-Up Rebuild Plan (Tauri v2, Claude Code–native)

> **Status:** Planning only — nothing in this document has been executed.
> **Purpose:** Master plan for a from-scratch rebuild of CrewHub as a Tauri v2 desktop application whose entire feature set is centered on collaborating with Claude Code. This document is structured for direct import into a Linear project (Milestones → Epics → Issues).
> **For agentic workers:** Each epic below gets its own detailed implementation plan (with TDD steps) when picked up. Use `superpowers:writing-plans` per epic, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement.

**Goal:** A secure, local-first desktop "mission control" for Claude Code: spawn, observe, orchestrate, and collaborate with any number of Claude Code sessions — with rooms, task boards, multi-agent meetings, and the signature 3D world — without running any web server.

**Architecture:** Tauri v2 shell with a Rust core that owns all privileged work (process management, SQLite, file watching, MCP server, hooks bridge) and a React 19 frontend that talks to the core exclusively over typed Tauri IPC. Claude Code is integrated through four complementary surfaces: the CLI's bidirectional `stream-json` control protocol (managed sessions), transcript watching under `~/.claude/projects` (any session, including terminal-spawned), the hooks system (real-time signals + policy), and a CrewHub MCP server (agents act on CrewHub data themselves).

**Tech Stack:** Tauri 2.x · Rust (tokio, rusqlite, notify, rmcp, tauri-specta) · React 19 + TypeScript (strict) · Vite · Tailwind CSS v4 + shadcn/ui · Zustand + TanStack Query · React Three Fiber v9 (3D world) · Vitest + Playwright/WebDriver (E2E) · GitHub Actions CI.

---

## 1. Vision & Guiding Principles

CrewHub v1 proved the concept: a spatial, ambient, multi-agent workspace is a genuinely better way to run a crew of AI agents than N terminal tabs. v2 rebuilds that concept on three bets:

1. **Claude Code is the runtime, not a connection type.** v1 treated Claude Code as one of three pluggable gateways (OpenClaw, Claude Code, Codex) behind a generic abstraction, and re-implemented things Claude Code already does (context injection by prompt-stuffing, custom pipelines, polling for activity). v2 inverts this: every feature is designed around what Claude Code natively offers — sessions, resume/fork, subagents, teams, hooks, MCP, checkpoints, plan mode, skills — and CrewHub becomes the best possible cockpit for those primitives.

2. **No server, no network surface.** v1 ran a FastAPI server on `0.0.0.0:8090` with API keys, scopes, rate limiting, and audit logs — all complexity that exists only because the UI talked to the backend over HTTP. v2 has no web app and no HTTP API. The UI and core communicate over Tauri IPC inside one signed process tree. The only listener is the CrewHub MCP server, bound to `127.0.0.1` with a per-launch bearer token, existing solely so Claude Code sessions can call CrewHub tools. This removes the entire v1 auth subsystem and is the core of the security story.

3. **Observe everything, own nothing.** CrewHub never wraps or proxies Claude Code's state. Transcripts stay in `~/.claude/projects` (Claude Code owns them); CrewHub reads them. Sessions started in a terminal are first-class citizens via the watcher + hooks. CrewHub's own database stores only CrewHub concepts: agents, rooms, projects, tasks, meetings, settings.

**Non-goals for v2.0:** web app, mobile app, OpenClaw runtime support (see §8 — the adapter seam is reserved, v1 remains available for OpenClaw users), multi-user/team sync, cloud anything.

---

## 2. v1 Feature Triage

Complete inventory of v1 capabilities and their fate in v2. Nothing is dropped silently.

### Keep (rebuild largely as-is, modernized internals)

| v1 feature                                                                                                                  | v2 notes                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Agents registry (fixed agents: name, icon, color, model, project path, permission mode, system prompt, pinning, auto-spawn) | Core entity. `source` field replaced by single runtime: Claude Code.                                     |
| Projects & Rooms (icons, colors, sort, HQ room, floor/wall styles)                                                          | Core entity.                                                                                             |
| Task board / Kanban (statuses, priorities, assignee, project/room scoping, project history log)                             | Core entity. Now also writable by agents via MCP (see Reimagine).                                        |
| Room assignment rules (keyword / model / pattern / session-type routing)                                                    | Keep; operates on watched sessions.                                                                      |
| Session display names / aliases                                                                                             | Keep (SQLite, not localStorage).                                                                         |
| Session history & archive browser                                                                                           | Keep; reads JSONL transcripts directly, including full-text search.                                      |
| Chat with streaming, markdown, thinking blocks, tool call display, images/media, permission prompts                         | Keep; now driven by the control protocol instead of stdout marker parsing (`__TOOL__` markers are gone). |
| Activity feed (real-time event stream)                                                                                      | Keep; fed by watcher + hooks instead of 5s polling.                                                      |
| Handoff (open session's project in terminal / VS Code / copy path)                                                          | Keep; trivial in Tauri (shell plugin).                                                                   |
| Meetings (round-robin multi-agent discussions, synthesis, action items → tasks) & Standups                                  | Keep; orchestrated over managed CC sessions.                                                             |
| Theming (named themes, density, fonts), keyboard shortcuts, command palette                                                 | Keep.                                                                                                    |
| Onboarding wizard (detect CLI, scan projects, first crew)                                                                   | Keep; much shorter since there is only one runtime to configure.                                         |
| Backup / restore                                                                                                            | Keep (export/import SQLite + settings).                                                                  |
| Desktop notifications & tray                                                                                                | Keep; now hook-driven (instant) via Tauri notification plugin.                                           |
| Org chart / crew overview                                                                                                   | Keep (low priority).                                                                                     |
| 3D world (rooms, bots, animations, status glow, speech bubbles, first-person mode, task wall)                               | Keep — signature feature. Port to R3F v9; render data comes from the same stores as the 2D views.        |

### Reimagine (same job, fundamentally better mechanism in v2)

| v1 feature                                                                      | v1 mechanism                                 | v2 mechanism                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context injection ("context envelope": room/project/tasks stuffed into prompts) | String-built prompt prefix per message       | `SessionStart` hook returns `additionalContext` with the room/project/task envelope; live data via CrewHub MCP tools (`get_my_tasks`, `get_room_context`). Context is current at session start _and_ on demand, never stale, never bloating every message.       |
| Agents updating tasks                                                           | Agents couldn't; humans moved cards          | CrewHub MCP server exposes `create_task`, `update_task_status`, `list_tasks`, `post_status_update` — agents move their own cards; the board becomes the shared source of truth between human and crew.                                                           |
| Conflict detection (concurrent file edits)                                      | Heuristic scanning of transcripts            | `PreToolUse` hook on Edit/Write reports the target path to CrewHub before the write; CrewHub detects two sessions touching the same file in real time and can warn — or _block_ (hook deny) — by user policy.                                                    |
| Activity/status detection                                                       | 5-second polling loop over all connections   | FS events on transcript files (`notify`/FSEvents) + hook signals (`PreToolUse`, `PostToolUse`, `Stop`, `Notification`). Sub-second updates, near-zero idle cost.                                                                                                 |
| Pipelines (multi-step agent workflows)                                          | Custom step engine calling gateways          | "Runs": scheduled or chained headless `claude -p` invocations with `--output-format stream-json`, plus first-class visualization of Claude Code's _native_ subagents and teams (which replace most v1 pipeline use cases).                                       |
| Cron jobs                                                                       | OpenClaw gateway payload cron                | App-local scheduler (Rust, tokio) executing headless runs; results land in history + notifications. No gateway dependency.                                                                                                                                       |
| Personas (presets, behavior sliders, identity anchor, surface rules)            | Prompt assembly server-side                  | Persona composer that materializes into Claude Code's own layers: per-agent system prompt (`--append-system-prompt`), per-project `CLAUDE.md` managed block, and/or custom agent definitions (`.claude/agents/`). Same UX (presets + sliders), native substrate. |
| Permission prompts in chat                                                      | Parsed text markers                          | Control-protocol `can_use_tool` request/response — structured, reliable, supports allow-always rules persisted per agent.                                                                                                                                        |
| Group chat threads (multi-agent)                                                | Custom thread router over gateways           | Multi-agent chat built on managed sessions; broadcast/targeted routing preserved. Evaluate Claude Code teams as substrate where it fits.                                                                                                                         |
| Prompt templates                                                                | DB-stored templates with variables           | Keep templates, plus surface Claude Code skills/slash-commands of each project (read `.claude/skills`, plugins) so the library reflects what sessions can actually do.                                                                                           |
| Session "adopt" of terminal sessions                                            | History-load workaround                      | Watcher shows terminal sessions live (read-only); "Take over" = `--resume <session-id>` into a managed session when it's idle; "Peek" = full transcript view anytime.                                                                                            |
| Zen mode (tmux-style panel workspace)                                           | Separate full-screen mode with own CSS world | The panel/workspace system **becomes the main shell**: tabs, split panes, command palette, layout presets. The 3D world is one (special) view inside it, not a competing app. One UI system instead of three (main/zen/mobile).                                  |

### Defer (explicitly post-v2.0, design must not preclude them)

| Feature                                                                           | Why deferred                                                                                                                                               | Seam reserved                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| OpenClaw gateway support                                                          | v2.0 is Claude Code–focused; v1 keeps serving OpenClaw users meanwhile                                                                                     | `SessionProvider` trait in the Rust core (§4.3); all UI consumes provider-agnostic `SessionEvent`s |
| Creator mode (AI prop generation, crossbreeding, style transfer, quality scoring) | Large, fun, not core to collaboration; v2 redesign should generate via headless `claude -p` instead of direct API calls (removes API-key storage entirely) | Prop registry format kept namespaced (`core:desk`) and JSON-importable from v1 blueprints          |
| Embedded browser panel                                                            | Webview-in-webview in Tauri needs its own security review                                                                                                  | Panel registry accepts new panel types                                                             |
| Mobile layout / Tauri mobile                                                      | Desktop first                                                                                                                                              | Panel system is responsive by construction                                                         |
| Agent file storage (per-agent uploads)                                            | Low usage in v1                                                                                                                                            | Plain folder under app data dir when needed                                                        |
| Voice recording / audio messages                                                  | Niche; revisit after chat core is solid                                                                                                                    | Chat input is pluggable                                                                            |
| Web app                                                                           | Explicit non-goal for now                                                                                                                                  | Core/UI split over typed IPC means a future server transport is possible without UI rewrite        |

### Drop (v2 makes them unnecessary)

| v1 feature                                                                                | Why it's gone                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FastAPI HTTP server, REST API, SSE endpoints                                              | Replaced by Tauri IPC + events. No port 8090, no CORS, no `0.0.0.0`.                                               |
| API keys, scopes, rate limiting, audit log, device identity binding, local-bootstrap auth | Existed to secure the HTTP API. No HTTP API → no key management. (MCP server keeps a single per-launch token, §5.) |
| Codex connection type                                                                     | Out of scope; provider seam covers a future return.                                                                |
| OpenClaw reply-tag stripping, gateway handshake, gateway status endpoints                 | OpenClaw deferred (see above).                                                                                     |
| Python runtime, venv, `pip` toolchain                                                     | Entire backend is Rust inside the Tauri process.                                                                   |
| Discovery service (runtime scanning for Python/Node/.NET)                                 | Only `claude` CLI needs detecting; folded into onboarding.                                                         |
| Demo mode seeding                                                                         | Replace with a "sample project" button in onboarding if needed.                                                    |
| localStorage as a persistence layer                                                       | All durable state in SQLite; localStorage only for ephemeral UI state at most.                                     |

---

## 3. Repository & Delivery Strategy

- **New repository** (suggested: `crewhub2`, rename later if desired). Rationale: v1 must keep working untouched for OpenClaw users (standing project rule), the stack shares almost nothing (Python→Rust), and a clean history keeps CI/tooling simple. Cherry-pick v1 assets (3D geometry code, themes, prop blueprints) by copying files, not by sharing the repo.
- **Branching:** trunk-based on `main`, short-lived feature branches, PRs with CI gates (fmt, clippy, tests, typecheck, vitest, build).
- **Layout:**

```
crewhub2/
├── src-tauri/             # Rust core
│   ├── src/
│   │   ├── main.rs / lib.rs
│   │   ├── ipc/           # tauri-specta commands & events (the ONLY UI surface)
│   │   ├── engine/        # Claude Code integration
│   │   │   ├── provider.rs        # SessionProvider trait (seam for future runtimes)
│   │   │   ├── claude/
│   │   │   │   ├── process.rs     # spawn/manage `claude` (stream-json bidi)
│   │   │   │   ├── control.rs     # control protocol (permissions, interrupts)
│   │   │   │   ├── transcript.rs  # JSONL parser (all event types)
│   │   │   │   ├── watcher.rs     # ~/.claude/projects FS watcher
│   │   │   │   └── headless.rs    # one-shot `claude -p` runs
│   │   │   └── events.rs          # SessionEvent model
│   │   ├── mcp/           # CrewHub MCP server (rmcp, streamable HTTP, 127.0.0.1)
│   │   ├── hooks/         # hook installer + local hook signal receiver
│   │   ├── store/         # rusqlite + migrations; one module per domain
│   │   ├── domain/        # agents, rooms, projects, tasks, meetings, runs
│   │   ├── scheduler/     # cron-style runner for headless runs
│   │   └── security/      # capability docs, token mgmt, path policy
│   ├── capabilities/      # Tauri v2 per-window permission sets
│   └── tauri.conf.json
├── src/                   # React frontend
│   ├── app/               # shell: workspace tabs, panels, command palette
│   ├── panels/            # chat, sessions, tasks, activity, rooms, docs, world3d, …
│   ├── world3d/           # R3F scene (ported & trimmed from v1)
│   ├── stores/            # Zustand stores fed by IPC events
│   ├── ipc/               # generated bindings (tauri-specta) — never hand-written fetch
│   └── ui/                # shadcn/ui + theme system
├── crates/                # (optional) extracted libs: transcript-parser, mcp-tools
└── e2e/                   # Playwright/WebDriver Tauri tests
```

- **Definition of Done (every issue):** code + tests (Rust unit / vitest / E2E as appropriate) + typed IPC bindings regenerated + docs touched if behavior is user-visible + passes CI. No issue closes on "works on my machine".

---

## 4. Architecture

### 4.1 Process & data flow

```
┌───────────────────────────── Tauri app (one signed process tree) ─────────────────────────────┐
│                                                                                               │
│  React UI (webview)  ◄── typed events (tauri-specta) ──  Rust core                            │
│   panels / 3D world  ── typed commands ──────────────►   ├─ engine: session mgr               │
│                                                          │   ├─ managed sessions ──spawn──►  claude CLI (stream-json in/out)
│                                                          │   └─ watcher ◄──FS events──────  ~/.claude/projects/**/*.jsonl
│                                                          ├─ hooks receiver ◄──UDS/localhost──  hook commands in sessions
│                                                          ├─ MCP server (127.0.0.1:rand, token) ◄── MCP calls from sessions
│                                                          ├─ scheduler ──► headless `claude -p` runs
│                                                          └─ store: SQLite (~/Library/Application Support/CrewHub/)
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Key decisions (with alternatives considered)

**D1 — Drive the `claude` CLI directly from Rust via bidirectional `stream-json`, rather than embedding the Agent SDK in a Node sidecar.**
The CLI's `--input-format stream-json --output-format stream-json` mode provides streaming output (text deltas, tool use, thinking), mid-run input, interrupts, and structured permission requests/responses over the control protocol — the same surface the Agent SDK wraps. Choosing the CLI directly means: zero bundled runtime (no Node sidecar binary to build/sign per-platform), the user's existing `claude` install/auth/version is the single source of truth, and one fewer process layer to supervise. _Alternative considered:_ TypeScript Agent SDK in a sidecar — richer programmatic API (in-process hooks, `canUseTool` callback), but adds a second runtime to package and drifts from the user's installed Claude Code version. _Mitigation for the risk that the control protocol evolves:_ isolate all protocol knowledge in `engine/claude/control.rs` + `transcript.rs` behind versioned tests with recorded fixtures; revisit the SDK-sidecar option at M1 exit if protocol coverage proves insufficient (decision checkpoint, Issue 5.1).

**D2 — Transcript watching is the universal read path; the control protocol is the managed write path.**
Everything CrewHub displays about a session (managed or terminal-spawned) comes from parsing its JSONL transcript, so there is exactly one parser and terminal sessions get full fidelity for free. Managed sessions additionally have stdin/control for sending messages, answering permissions, and interrupting.

**D3 — Hooks are signals and policy, not transport.**
CrewHub installs a managed block in `~/.claude/settings.json` (clearly delimited, reversible, opt-in during onboarding) wiring `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, and `Notification` to a tiny `crewhub-signal` helper binary that writes one JSON line to a Unix domain socket owned by the app. This gives sub-second status (working/waiting/done), instant desktop notifications, cross-session file-conflict detection, and context injection at `SessionStart` — without CrewHub sitting in the data path. If the app isn't running, the helper exits 0 immediately (sessions never block on CrewHub).

**D4 — CrewHub MCP server makes agents first-class CrewHub users.**
A streamable-HTTP MCP server on `127.0.0.1:<random port>` with a per-launch bearer token. Onboarding (or per-project setup) registers it via `claude mcp add`. Tools (initial set): `list_tasks`, `create_task`, `update_task_status`, `get_room_context`, `post_status_update`, `send_message_to_agent`, `list_crew`. This replaces v1's entire "context envelope + agents can't touch the board" gap.

**D5 — SQLite in app-data dir via rusqlite; tauri-specta for end-to-end types.**
One database (`crewhub.db`) with versioned migrations (`rusqlite_migration`). All IPC commands and events defined once in Rust, TypeScript bindings generated — the v1 class of bugs where frontend and backend disagree about shapes disappears at compile time.

**D6 — One UI shell (panel workspace), three was too many.**
v1 maintained Main, Zen, and Mobile as parallel UIs. v2 has a single workspace shell: tabs → split panes → panels (chat, sessions, tasks, activity, rooms, world3d, docs, history, runs). The 3D world is a panel/maximized view. Layout presets replicate v1's "modes".

### 4.3 Core engine model (interface sketch)

```rust
// engine/events.rs — the one event stream every UI surface consumes
pub enum SessionEvent {
    Discovered { session: SessionMeta },            // watcher found a session (any origin)
    Updated   { session: SessionMeta },             // status/activity/tokens changed
    Removed   { session_id: SessionId },
    Message   { session_id: SessionId, item: TranscriptItem }, // text/thinking/tool_use/tool_result/...
    PermissionRequest { session_id: SessionId, request: PermissionRequest }, // managed only
    HookSignal { session_id: SessionId, signal: HookSignal },  // pre/post tool, stop, notification
}

pub struct SessionMeta {
    pub id: SessionId,                 // Claude Code session UUID
    pub origin: SessionOrigin,         // Managed | External (terminal/IDE)
    pub project_path: PathBuf,
    pub model: Option<String>,
    pub status: SessionStatus,         // Working | WaitingForInput | WaitingForPermission | Idle | Ended
    pub agent_id: Option<AgentId>,     // bound CrewHub agent, if any
    pub room_id: Option<RoomId>,       // explicit assignment or rule-derived
    pub parent_session: Option<SessionId>, // subagent/team lineage
    pub usage: UsageTotals,
    pub last_activity: Timestamp,
}

// engine/provider.rs — the seam that keeps OpenClaw (or others) possible later
pub trait SessionProvider: Send + Sync {
    fn id(&self) -> &'static str;                         // "claude-code"
    async fn list_sessions(&self) -> Vec<SessionMeta>;
    async fn spawn(&self, spec: SpawnSpec) -> Result<SessionId>;
    async fn send(&self, id: SessionId, input: UserInput) -> Result<()>;
    async fn respond_permission(&self, id: SessionId, resp: PermissionResponse) -> Result<()>;
    async fn interrupt(&self, id: SessionId) -> Result<()>;
    async fn kill(&self, id: SessionId) -> Result<()>;
    fn events(&self) -> broadcast::Receiver<SessionEvent>;
}

pub struct SpawnSpec {
    pub project_path: PathBuf,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub permission_mode: PermissionMode,   // Default | AcceptEdits | Plan | BypassPermissions
    pub resume_session: Option<SessionId>, // resume/fork
    pub append_system_prompt: Option<String>, // persona materialization
    pub agent_id: Option<AgentId>,
}
```

### 4.4 Data model (initial schema, v1 → v2 mapping)

SQLite tables (all `id` TEXT/UUID, timestamps INTEGER unix-ms):

- `agents` — name, icon, color, avatar, default*model, project_path, permission_mode, system_prompt, persona_json, is_pinned, auto_spawn, bio. *(v1 `agents` minus source/session-key plumbing; persona tables folded into one JSON column — presets/sliders are UI concepts.)\_
- `projects` — name, description, icon, color, folder_path, docs_path, status.
- `rooms` — project_id, name, icon, color, sort_order, is_hq, style_json (floor/wall/speed).
- `room_rules` — room_id, rule_type (keyword|model|path_pattern|origin), rule_value, priority.
- `session_bindings` — session*id (PK), agent_id, room_id, display_name, pinned. *(merges v1 session*room_assignments + session_display_names; transcripts themselves are never copied into the DB.)*
- `tasks` — project_id, room_id, title, description, status (todo|in_progress|review|done|blocked), priority, assignee_agent_id, created_by (human|agent:<id>), created_at, updated_at.
- `task_events` — task*id, event_type, actor, payload_json, created_at. *(v1 project*history.)*
- `meetings`, `meeting_turns`, `meeting_action_items` — as v1, minus gateway fields; turns reference session_id + transcript offsets instead of copying full text.
- `standups`, `standup_entries` — as v1.
- `runs` — kind (scheduled|manual|pipeline_step), schedule_cron, spec_json (SpawnSpec for headless), enabled, last_run_at; `run_results` — run_id, session_id, status, summary, started/finished.
- `prompt_templates` — name, template, variables_json, project_id.
- `notification_rules` — scope (agent|project|global), trigger (permission_needed|stopped|error|task_moved|mention), config_json, enabled.
- `settings` — key/value (theme, layout presets, onboarding state, hook-install state, telemetry=off).
- `schema_version` — managed by rusqlite_migration.

Dropped from v1 schema: `api_keys`, `api_key_audit_log`, `agent_identities`, `connections`, `claude_processes` (process state is in-memory; history lives in transcripts), `agent_personas`/`agent_surfaces` (folded into `agents.persona_json`), `threads/*` (rebuilt on sessions in M4), `placed_props`/`custom_blueprints` (return with Creator mode, importable from v1 JSON).

---

## 5. Security Model (the reason for Tauri-only)

1. **No listening sockets except MCP.** No HTTP server, no SSE, no `0.0.0.0`. The MCP server binds `127.0.0.1` on a random port, requires `Authorization: Bearer <per-launch token>`, and exposes only the whitelisted CrewHub tools — never shell, filesystem, or IPC passthrough.
2. **Tauri v2 capabilities, least privilege per window.** Main window gets only the IPC commands it needs; `shell` scope limited to opening editors/terminals on explicit user action; `fs` access not granted to the webview at all (all file reads go through Rust commands with a path policy: project folders + `~/.claude` read-only). Strict CSP, no remote content loaded into the webview, devtools disabled in release builds.
3. **All privileged operations live in Rust** and are auditable in one place: spawning `claude`, writing the hooks block, reading transcripts, DB access. The webview cannot reach any of these except through reviewed, typed commands.
4. **Hook & settings hygiene.** The managed block in `~/.claude/settings.json` is opt-in, clearly fenced with markers, idempotent, and fully removed by "Disable integration". CrewHub never edits anything outside its fence. The `crewhub-signal` helper does nothing but write JSON to the app's socket and always exits 0.
5. **Permission flow is explicit.** Managed sessions default to `permission_mode: Default`; CrewHub renders every `can_use_tool` request with full tool input shown. "Always allow" rules are stored per agent + tool pattern and visible/revocable in settings. `BypassPermissions` requires a deliberate, per-agent, warning-gated setting.
6. **Secrets:** none stored. Claude auth belongs to the CLI. The MCP token is generated per launch and kept in memory. (If a future feature needs durable secrets, use OS keychain via Tauri stronghold/keyring — decision deferred until needed.)
7. **Updates & signing:** signed builds (macOS notarized), Tauri updater with signature verification, release artifacts built in CI only.
8. **Privacy:** no telemetry. Transcript content never leaves the machine.

---

## 6. Milestones, Epics & Issues (Linear-ready)

Suggested Linear setup: one **Linear project per milestone** (M0–M6), epics as **labels** or parent issues, sizes as estimates (S ≈ ≤1 day, M ≈ 2–3 days, L ≈ ~1 week). Priorities: M0–M2 are the critical path to a usable daily driver; M3–M4 make it a team tool; M5–M6 make it CrewHub.

Each issue lists acceptance criteria (AC). Dependencies are noted; otherwise issues within an epic are sequential, epics within a milestone can run in parallel.

---

### M0 — Foundation (target: usable dev environment, empty but secure app)

#### Epic 1: Scaffold & Toolchain

- **1.1 Scaffold Tauri v2 + React 19 + Vite + TS strict + Tailwind v4 + shadcn/ui** (M)
  AC: `pnpm tauri dev` opens a window; ESLint+Prettier+rustfmt+clippy configured; pre-commit hooks run fmt+lint.
- **1.2 CI pipeline (GitHub Actions)** (M)
  AC: PR workflow runs clippy, cargo test, tsc, vitest, and a debug Tauri build on macOS; failing any gate blocks merge.
- **1.3 tauri-specta typed IPC skeleton** (S)
  AC: one demo command + one demo event defined in Rust generate TS bindings consumed by the UI; binding generation runs in CI and fails on drift.
- **1.4 E2E harness** (M)
  AC: one Playwright/WebDriver test boots the built app and asserts the shell renders; runs in CI (macOS).

#### Epic 2: Security Baseline

- **2.1 Capability files & CSP** (M)
  AC: main window capability grants only declared IPC + notification; CSP blocks remote scripts; `tauri.conf.json` reviewed against the checklist in §5; document each granted permission with a one-line justification in `src-tauri/capabilities/README.md`.
- **2.2 Path policy module** (S)
  AC: `security::paths` validates every filesystem-touching command against allowed roots (registered project folders, `~/.claude` read-only, app data dir); unit tests cover traversal attempts (`../`, symlinks).
- **2.3 Release signing & updater config (deferrable to M6 but config stubbed now)** (S)
  AC: updater keys generated and stored outside repo; conf wired; documented release process.

#### Epic 3: Data & Event Core

- **3.1 SQLite store + migrations** (M)
  AC: schema from §4.4 created via rusqlite_migration; store modules expose typed CRUD for agents/projects/rooms/tasks/settings; unit tests for each; DB lives in app-data dir.
- **3.2 Domain event bus** (S)
  AC: internal broadcast channel; every store mutation emits a domain event; a Tauri event bridge forwards typed events to the webview; vitest store proves UI receives them.
- **3.3 Settings service + theme bootstrapping** (S)
  AC: settings persisted in SQLite; theme (from v1's named-theme set) applied via CSS variables; survives restart.

---

### M1 — Claude Code Engine (target: full observe + control of sessions, no real UI yet beyond a debug panel)

#### Epic 4: Transcript Watcher & Parser

- **4.1 JSONL transcript parser** (L)
  AC: parses all known line types — user/assistant messages, text deltas, thinking (incl. encrypted thinking markers), tool_use/tool_result, subagent lineage (`parent=`), hook progress, errors, usage/token totals, summaries — into `TranscriptItem`; fixture-driven tests with recorded real transcripts (port v1's accumulated parsing knowledge: `claude_transcript_parser.py` is the spec); unknown line types are preserved as `Unknown` and never crash.
- **4.2 Projects-dir watcher** (M)
  AC: `notify`-based watcher over `~/.claude/projects/**`; new/changed JSONL → incremental parse (tail from last offset); emits `Discovered/Updated/Message` `SessionEvent`s; debounced; handles file rotation/deletion; configurable recency window (default 30 min) determines "active".
- **4.3 Session status derivation** (M)
  AC: status machine (Working/WaitingForInput/WaitingForPermission/Idle/Ended) derived from transcript tail + (later) hook signals; activity detail string ("Editing src/foo.rs", "Running tests…") matches v1 quality; unit tests per transition.
- **4.4 History & search service** (M)
  AC: list past sessions per project with summary, dates, usage; full-text search across transcripts (SQLite FTS5 over an index built lazily, transcripts stay on disk); IPC commands + tests.

#### Epic 5: Managed Session Lifecycle

- **5.1 Spawn/manage `claude` in bidirectional stream-json mode** (L)
  AC: `SpawnSpec` → child process with `--input-format stream-json --output-format stream-json --permission-mode … [--resume id] [--model …] [--append-system-prompt …]`; stdout parsed by the Epic-4 parser; user messages sendable mid-run; clean shutdown on app exit; process supervision (crash → `Ended` + error surfaced). **Exit checkpoint for D1:** if any required capability (interrupt, permission round-trip, mid-run input) is not achievable via CLI control protocol, write an ADR and pivot Epic 5 to the Agent-SDK sidecar before M2 begins.
- **5.2 Resume / fork / model switch** (M)
  AC: resume an ended or external-idle session by ID; fork (resume into new session leaving original intact); model change applied on next spawn; covered by integration tests against a stubbed CLI + one live smoke test.
- **5.3 Interrupt & kill** (S)
  AC: interrupt delivers control interrupt (Esc-equivalent); kill terminates the process tree; both reflected in status within 1s.
- **5.4 Idle lifecycle & auto-spawn** (M)
  AC: configurable idle timeout ends managed processes (session resumable later — v1's 30-min behavior); agents with `auto_spawn` start their session on app launch; lifecycle events visible in activity feed.
- **5.5 Headless run executor** (M)
  AC: `claude -p` one-shot runs with stream-json output captured into a `run_results` record + transcript link; used by scheduler (Epic 17) and meetings (Epic 16).

#### Epic 6: Permissions & Control Protocol

- **6.1 Permission request/response plumbing** (M)
  AC: `can_use_tool` control requests surface as `PermissionRequest` events with full tool name/input; responses (allow once / allow always / deny with message) delivered back; "allow always" persists a rule (agent + tool pattern) in settings; rules listable/revocable via IPC.
- **6.2 AskUserQuestion / plan-approval handling** (M)
  AC: structured questions and ExitPlanMode approval requests are surfaced as typed events and answerable; covered by fixture tests.

#### Epic 7: Hooks Bridge

- **7.1 `crewhub-signal` helper + UDS receiver** (M)
  AC: tiny Rust binary (bundled as Tauri sidecar artifact) reads hook JSON from stdin, writes one line to the app's Unix socket, exits 0 in <50ms even if app is down; receiver translates to `HookSignal` events; integration test with fake hook payloads.
- **7.2 Managed settings.json block installer** (M)
  AC: opt-in installer writes a fenced, idempotent hooks block (`SessionStart`, `PreToolUse` [Edit|Write|Bash matchers], `PostToolUse`, `Stop`, `SubagentStop`, `Notification`) into `~/.claude/settings.json`; uninstall removes exactly the fence; never touches user content outside it; round-trip tests on real-world settings files.
- **7.3 SessionStart context injection** (M)
  AC: `SessionStart` hook calls back into CrewHub, which returns `additionalContext` containing the bound agent's room/project/task envelope (only when the session's cwd maps to a registered project); content snapshot-tested; feature off when integration disabled.
- **7.4 File-conflict detection** (M)
  AC: `PreToolUse` signals on Edit/Write feed a per-path registry; two sessions touching the same path within a window → `conflict` event (and optional hook-deny "block mode" per settings); unit tests for overlap windows.

#### Epic 8: CrewHub MCP Server

- **8.1 MCP server core (rmcp, streamable HTTP, loopback + bearer token)** (M)
  AC: server starts with the app on random port; rejects missing/wrong token; exposes `list_crew` as the first tool; integration test via an MCP client.
- **8.2 Task tools** (M)
  AC: `list_tasks`, `create_task` (room_id required — v1 lesson), `update_task_status`, `post_status_update` implemented with input validation; calls attributed to the calling session's bound agent in `task_events.actor`; board updates flow to UI in real time.
- **8.3 Context & messaging tools** (S)
  AC: `get_room_context`, `send_message_to_agent` (queues a message into the target managed session or notifies the human if unmanaged).
- **8.4 Registration UX** (S)
  AC: per-project "Enable CrewHub tools" runs `claude mcp add --transport http crewhub <url>` (scoped local), and removal works; status visible per project.

---

### M2 — Core UI (target: daily-drivable cockpit; replaces v1 for solo Claude Code use)

#### Epic 9: Workspace Shell

- **9.1 Panel/workspace system** (L)
  AC: tabs → split panes (h/v) → panels; drag to rearrange; maximize; close; layout presets save/restore (SQLite); keyboard shortcuts (v1 zen map as starting point); panel registry is data-driven so later panels (world3d, runs) plug in.
- **9.2 Command palette** (M)
  AC: ⌘K palette with actions (open panel, switch project filter, spawn agent, new task, settings…); fuzzy search; extensible action registry.
- **9.3 Theming & settings UI** (M)
  AC: theme picker (port v1 named themes), density, font size; settings window (separate Tauri window with its own capability set); all persisted.
- **9.4 Global project filter** (S)
  AC: selecting a project scopes all panels; persisted per workspace tab.

#### Epic 10: Crew & Agents

- **10.1 Agent CRUD + persona composer** (L)
  AC: create/edit agents (name, icon, color, project path picker, model, permission mode); persona presets + sliders (port v1 Executor/Advisor/Explorer + trait sliders) composing into a previewable system prompt; "materialize" writes `--append-system-prompt` config and/or offers to write a managed block in the project's `CLAUDE.md`.
- **10.2 Crew bar & agent cards** (M)
  AC: pinned crew visible in shell sidebar with live status (from `SessionEvent`s); click → open chat panel; spawn/stop controls; auto-spawn toggle.
- **10.3 Session binding** (M)
  AC: external sessions can be bound to an agent (manually or via room rules); bindings persist (`session_bindings`); display names editable inline.

#### Epic 11: Chat Panel

- **11.1 Transcript renderer** (L)
  AC: virtualized message list rendering all `TranscriptItem` types: markdown (code blocks w/ syntax highlight), thinking blocks (collapsed >500 chars, encrypted-thinking placeholder state), tool calls (foldable input/output, success/error), images (thumbnail + lightbox), subagent groups (collapsible, named — v1 lesson: readable names, not `parent=` labels); performance budget: 60fps scroll on a 5k-item transcript.
- **11.2 Composer & streaming send** (M)
  AC: send to managed session with live streaming response; Enter/Shift+Enter; slash-command hints from the project's available skills; queue message while agent is working; interrupt button.
- **11.3 Permission & question prompts in chat** (M)
  AC: `PermissionRequest` renders inline with Allow / Always allow / Deny+reason; AskUserQuestion renders options; plan approval renders plan markdown with approve/reject; all answered via Epic 6 plumbing.
- **11.4 History mode & take-over** (M)
  AC: open any past/external session read-only with full fidelity; "Take over" resumes idle external sessions into managed mode (Epic 5.2); "Fork from here" available on past sessions.
- **11.5 Checkpoint/rewind surface** (S)
  AC: where transcripts expose checkpoints, show markers; "rewind to checkpoint" issues the corresponding resume; degrade gracefully when unavailable.

#### Epic 12: Sessions & Activity

- **12.1 Sessions panel (live)** (M)
  AC: all active sessions (managed + external) with origin badge, status, activity detail, model, usage, room, agent; actions: open chat, bind, assign room, interrupt, kill, handoff.
- **12.2 Activity feed panel** (M)
  AC: real-time stream (hook signals + transcript events) with per-agent filter, time grouping, click-through to chat; replaces v1 DesktopActivityFeed; loading states never stick (v1 bugfix carried as regression test).
- **12.3 History panel** (M)
  AC: browse/search archived sessions (Epic 4.4) grouped by date/project; open in read-only chat.
- **12.4 Handoff actions** (S)
  AC: open project in Terminal/iTerm/Warp/VS Code, copy path, copy `claude --resume <id>` command; uses Tauri shell plugin within capability scope.

---

### M3 — Workspace (target: human+crew share one board and one map of the work)

#### Epic 13: Projects & Rooms

- **13.1 Project CRUD + folder picker + docs path** (M)
  AC: register project folders (validated by path policy); auto-suggest from `~/.claude/projects` history; project cards show recent session/task stats.
- **13.2 Rooms CRUD + assignment rules** (M)
  AC: rooms per project (+ HQ); rule editor (keyword/model/path/origin, priority); rules auto-assign incoming sessions; manual override sticks.
- **13.3 Docs panel** (M)
  AC: render project markdown docs (docs_path) with v1-grade markdown fidelity; file tree; images served via Rust command (path-policy-checked).

#### Epic 14: Tasks

- **14.1 Kanban board panel** (L)
  AC: columns todo/in_progress/review/done/blocked; drag-and-drop; filters (project/room/assignee/priority); task detail drawer with description (markdown) + event timeline; HQ view across projects.
- **14.2 "Run with agent"** (M)
  AC: from a task: pick agent (or create one-off), spawn managed session with task context in initial prompt + task auto-moves to in_progress; on session `Stop` with success summary, prompt to move to review; linkage visible on the card.
- **14.3 Agent-driven board (MCP) end-to-end** (M)
  AC: an agent calling `update_task_status` moves the card live; `created_by`/actor attribution rendered; demo E2E test: headless run creates a task via MCP and the board shows it.
- **14.4 Task notifications** (S)
  AC: notification rules for task moved/blocked/mention fire desktop notifications (Epic 22 integration point; basic toast in M3).

#### Epic 15: Git & Code Awareness

- **15.1 Project git status strip** (M)
  AC: per project/session: current branch, dirty-file count, ahead/behind; worktree listing (sessions running in worktrees are labeled); read-only via `git` CLI through Rust.
- **15.2 Diff viewer panel** (M)
  AC: show working-tree diff (or diff vs base branch) for a session's project with syntax highlighting; opened from chat (after edits) or sessions panel; read-only in v2.0.

---

### M4 — Orchestration (target: the crew works together, on schedule, visibly)

#### Epic 16: Meetings & Standups

- **16.1 Meeting engine on managed sessions** (L)
  AC: round-robin orchestration (state machine: gathering → rounds → synthesis → complete) over N agents, each turn a message into that agent's managed session (spawn if needed); turn timeout + 1 retry; transcript-offset references stored, not copied text; recovery on app restart (v1 lesson); SSE-era UI events become typed Tauri events.
- **16.2 Meeting UI** (M)
  AC: start dialog (participants, rounds, topic, context docs), live progress view, output markdown view, history browser.
- **16.3 Action items → tasks** (S)
  AC: synthesis extracts action items; one-click convert to tasks (assignee = participant agent); "execute" = Run-with-agent (14.2).
- **16.4 Standups** (M)
  AC: scheduled or manual standup collects yesterday/today/blockers from each crew agent via a short headless run against their recent transcript + tasks; history view.

#### Epic 17: Automation (Runs & Schedules)

- **17.1 Scheduler** (M)
  AC: cron-expression scheduler (app must be running; document this honestly) executing headless runs from `runs` specs; enable/disable/run-now; results in history + notifications.
- **17.2 Run sequences (lightweight pipelines)** (M)
  AC: ordered steps (each a SpawnSpec template, with `{{previous_output}}` variable); failure stops sequence; run history with per-step transcripts. Explicitly minimal — Claude Code subagents/teams cover intra-task orchestration.
- **17.3 Prompt template library** (S)
  AC: CRUD templates with variables; insertable in composer and run specs; project-scoped skills/commands listed alongside (read from `.claude/`).

#### Epic 18: Subagents & Teams Visualization

- **18.1 Lineage model** (M)
  AC: parser + watcher resolve parent/child (subagent) and team relationships into a tree per root session; names humanized (v1 fix carried forward).
- **18.2 Tree UI** (M)
  AC: sessions panel and chat show subagent trees (expandable); clicking a subagent opens its transcript; live status per node; team members of a CC team render as a group.

---

### M5 — 3D World (target: the soul of CrewHub, rebuilt lean)

#### Epic 19: World Core

- **19.1 R3F scene foundation** (L)
  AC: port v1's building/room/bot rendering to React Three Fiber v9 + drei on the new data stores (rooms from DB, bots from live `SessionEvent`s); instanced meshes; frameloop pauses when panel hidden; 60fps with 20 bots/8 rooms on a baseline MacBook.
- **19.2 Bots = sessions** (M)
  AC: bot per bound agent/session with status glow (working/waiting/idle), activity bubble (current tool/file), speech bubble on new assistant text; subagent bots cluster near parent with readable names.
- **19.3 Interaction** (M)
  AC: click bot → quick actions (chat/focus/interrupt); drag bot between rooms → updates room binding; click room → room info panel (tasks, sessions, project docs tabs); orbit + first-person cameras (WASD/F) ported.
- **19.4 Task wall & HQ** (S)
  AC: in-world task board surface per room mirroring the kanban (read + drag status); HQ room shows cross-project board.
- **19.5 World as panel + performance budget** (S)
  AC: world runs as a workspace panel or maximized; CPU/GPU idle budget enforced (suspend rendering when occluded); debug HUD behind a dev flag.

#### Epic 20: Props & Polish (stretch within M5)

- **20.1 Static prop registry + v1 blueprint import** (M)
  AC: namespaced prop registry; import v1 `custom_blueprints` JSON; props render in rooms; placement editor (move/rotate/scale, persisted).
- **20.2 Creator mode (deferred decision)** (—)
  AC: explicitly re-scoped after M5 review; if revived, generation runs through headless `claude -p` (no direct API key).

---

### M6 — Ship (target: installable, updatable, delightful first run)

#### Epic 21: Onboarding

- **21.1 First-run wizard** (M)
  AC: detect `claude` CLI (PATH + common locations) and `~/.claude`; if missing, guided install instructions; scan recent projects; create first project/room/agent; offer hooks-integration opt-in (clear explanation of what is written where) and MCP registration; finish lands in a working workspace; skippable, resumable.
- **21.2 Sample crew (optional)** (S)
  AC: "Try with a sample project" creates a demo project + 2 agents with safe defaults.

#### Epic 22: Notifications & Tray

- **22.1 Notification engine** (M)
  AC: rule-driven (Epic 14.4 rules) desktop notifications via Tauri plugin: permission needed, session stopped/errored, meeting complete, task events, `Notification` hook passthrough; click focuses the relevant panel; per-rule mute.
- **22.2 Tray & dock** (S)
  AC: tray icon with active/waiting counts; dock badge for pending permissions (the #1 "why is it stuck" signal).

#### Epic 23: Distribution

- **23.1 Release builds: macOS signed+notarized, Windows, Linux** (L)
  AC: CI produces signed artifacts for all three; macOS notarization green; smoke E2E against built artifact per platform (macOS is primary, others best-effort at v2.0).
- **23.2 Auto-updater** (M)
  AC: updater checks signed manifest; staged rollout possible; "What's new" dialog from release notes.
- **23.3 Crash & error reporting (local)** (S)
  AC: errors logged to a local ring-buffer file; "Report issue" packages logs+versions into a gist-able bundle (user-initiated only — no telemetry).

#### Epic 24: v1 Migration

- **24.1 Importer** (M)
  AC: one-shot import from `~/.crewhub/crewhub.db`: projects, rooms, agents (+personas → persona_json), tasks (+history), room rules, display names, prompt templates, prop blueprints; dry-run preview; idempotent; v1 left untouched.
- **24.2 Parity checklist & sunset note** (S)
  AC: §2 triage table re-verified against the shipped app; gaps documented in release notes; v1 README pointer for OpenClaw users ("v1 remains the OpenClaw build").

---

## 7. Cross-Cutting Quality Plan

- **Fixture-first engine testing.** The transcript parser, control protocol, and hooks bridge are tested against _recorded real artifacts_ (sanitized JSONL transcripts, control messages, hook payloads) checked into `crates/transcript-parser/fixtures`. Every Claude Code release we support adds a fixture set; parser must never panic on unknown input.
- **One stubbed-CLI integration layer.** A fake `claude` binary (Rust, reads a script of canned stream-json) lets Epic 5/6 run deterministic integration tests in CI without API access; one nightly job runs a real smoke test.
- **E2E happy paths** (Playwright/WebDriver, built app): onboard → create agent → chat round-trip (against stub CLI) → permission prompt → task via MCP appears on board → 3D world renders. These are the release gates.
- **Performance budgets as tests where feasible:** transcript parse throughput (≥50k lines/s), chat scroll fps probe, watcher latency (<1s from file write to UI event), idle CPU (<2% with 10 idle sessions watched).
- **ADRs.** Every decision in §4.2, plus future pivots, recorded in `docs/adr/` — short, dated, with the alternative considered. (D1 explicitly carries a re-evaluation checkpoint at M1 exit.)

## 8. Risks & Open Questions

| #   | Risk / question                                                                               | Mitigation / decision point                                                                                                                |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | CLI stream-json control protocol coverage or stability gaps (permissions, interrupts)         | Decision checkpoint at Issue 5.1 exit: pivot to Agent SDK sidecar; all protocol code isolated in two modules.                              |
| R2  | Claude Code transcript format evolves between releases                                        | Unknown-tolerant parser + fixture sets per CC version + CI canary that parses the dev machine's newest transcripts.                        |
| R3  | Hooks installer touching `~/.claude/settings.json` alarms users or collides with their config | Opt-in with preview diff, fenced block, perfect uninstall, docs page; app fully functional (watcher-only, degraded latency) without hooks. |
| R4  | Scope: §6 is ~70 issues; 3D world historically absorbs unbounded effort                       | Milestone gates: M2 must be a daily driver before M3 starts; Epic 20 is explicitly stretch; Creator mode stays deferred.                   |
| R5  | Multi-agent meetings over managed sessions hit rate/concurrency limits                        | Serial turns by default (v1 behavior), configurable; headless runs for standups are short and bounded.                                     |
| R6  | Windows/Linux support for UDS + process handling                                              | UDS → named pipe on Windows behind one abstraction; CI builds all platforms from M0, but macOS is the v2.0 release gate (others "beta").   |
| Q1  | Should meetings use Claude Code _teams_ instead of CrewHub's round-robin?                     | Spike during M4 (timeboxed, 1 day) before building 16.1; keep round-robin as the guaranteed path.                                          |
| Q2  | Multi-window (detachable chat windows) in v2.0?                                               | Defer; panel system first. Tauri multi-window is additive later.                                                                           |
| Q3  | Linear: epics as parent issues vs labels?                                                     | Recommend parent issues (sub-issues inherit milestone/project); labels for areas: `engine`, `ui`, `world3d`, `security`, `mcp`, `hooks`.   |

## 9. Suggested Build Order (critical path)

```
M0 (1, 2, 3) → M1 (4 → 5 → 6, 7 ∥ 8 after 4) → M2 (9 → 11, 10 ∥ 12)
   → M3 (13 ∥ 14, 15) → M4 (16 ∥ 17, 18) → M5 (19 → 20*) → M6 (21–24)
                                  * stretch
```

First "dogfood moment" targeted at **end of M2**: CrewHub v2 replaces terminal tabs for daily solo Claude Code work. Everything after compounds on a tool already in daily use.

---

_Prepared 2026-06-10. Source material: full v1 feature inventory (backend routes/services/schema v25, frontend components/contexts/hooks), Claude Code integration surface review (Agent SDK, stream-json control protocol, hooks, MCP, transcript storage — verified against docs.claude.com, June 2026), and v1 docs (`docs/tauri-architecture-review.md`, `docs/claude-code-gap-analysis.md`, `docs/zen-standalone-architecture.md`)._
