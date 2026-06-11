# M6 — Ship: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⛔ EXECUTION GATE:** M6 assumes M4 (orchestration) and M5 (3D world) are merged to `main` and dogfooded — `meeting_complete` notifications and the importer's blueprint conversion lean on them. **This plan may be EXECUTED only after Nicky green-lights M5 exit or explicitly waives the gate.** Additionally, **Apple signing secrets are a parked-not-blocked dependency** (D-M6-6): every signing/notarization step is designed to degrade to unsigned artifacts, so Lanes 0/I/J proceed without them; only the final exit criterion (signed+notarized macOS artifact) waits on Nicky providing the secrets in Appendix D.

**Goal:** CrewHub v2 becomes a product someone else can install: a first-run wizard that detects the Claude CLI and lands the user in a working workspace (with an optional sample crew), rule-driven OS notifications + a tray icon with the "why is it stuck" badge, CI-built signed/notarized release artifacts with a working auto-updater and "What's new", a local-only crash/error report bundle, and a one-shot idempotent importer from v1's `~/.crewhub/crewhub.db` — closed out by re-verifying the master plan's §2 triage table and writing the v1 sunset note.

**Architecture:** M6 adds almost no new domain machinery — it _finishes seams that earlier milestones deliberately left open_: the M1 hooks bridge gets wired end-to-end (receiver boot + `crewhub-signal` sidecar + opt-in IPC — the modules exist, dormant, since M1), the M3 notification matcher gets its promised OS sink (the matcher is already a pure function; M6 swaps the sink, not the engine), the M0 updater pubkey gets pinned into `tauri.conf.json`, and the M5 v1-blueprint parser gets fed from the importer instead of paste-JSON. New Rust surface is confined to `src-tauri/src/{import,errlog,tray}` plus an `onboarding`-shaped set of IPC commands; the wizard is a webview overlay above the untouched workspace shell. The naming firewall holds: the importer reads a v1 SQLite file (a CrewHub format, provider-neutral); only `engine/claude/` knows what a CLI detection probe looks like.

**Tech Stack additions:** Rust: `tauri-plugin-notification` (OS sink), `tauri-plugin-updater` + `tauri-plugin-process` (relaunch), `tauri` `tray-icon` + `image-png` features. Frontend: none. CI: `tauri-apps/tauri-action` in a new `release.yml`. No new database migrations — M6 ships **zero** schema changes (the trigger list is validated in Rust, not by CHECK; importer rows preserve v1 ids into existing tables).

**Linear mapping:** Epic 21 Onboarding = EKI-84 (21.1 first-run wizard EKI-86 M, 21.2 sample crew EKI-88 S) · Epic 22 Notifications & Tray = EKI-90 (22.1 notification engine EKI-92 M, 22.2 tray & dock EKI-94 S) · Epic 23 Distribution = EKI-96 (23.1 release builds EKI-98 L, 23.2 auto-updater EKI-100 M, 23.3 crash/error reporting EKI-102 S) · Epic 24 v1 Migration = EKI-104 (24.1 importer EKI-106 M, 24.2 parity checklist & sunset note EKI-107 S).

**Diagram:** `docs/plans/2026-06-11-m6-ship.drawio` (page 1: ship architecture — wizard/notifications/tray/updater/importer over the existing seams; page 2: task graph with lane assignments + the secrets-degradation path).

**Grounding:** Audited against `main` on 2026-06-11: `hooks/{installer,receiver,conflicts}.rs` complete and tested but **never started** — no IPC, no socket boot in `lib.rs`, `crates/crewhub-signal` built but not bundled (no `externalBin`); `ClaudeConfig::default()` hardcodes `cli_path: "claude"` (no detection; provider failure is an `eprintln!`); `store/notification_rules.rs` `NOTIFICATION_TRIGGERS` closed at 4 task triggers (M3-R7), `stores/toasts.ts` matcher pure with the "M6 swaps the sink" comment in place; `tauri.conf.json` has no plugins/updater/`createUpdaterArtifacts`, capabilities are `core:default` + clipboard write only; `ci.yml` builds `--debug --no-bundle`, no release workflow; 23 non-test `eprintln!` sites, no panic hook, no log file; `RELEASING.md` holds the updater pubkey ("pin in tauri.conf.json … M6, EKI-100"); world props persist as settings KV `world.props:<room_id>` with the pure v1 parser at `src/panels/world/props/parse-v1.ts`; v2 `rooms.project_id` is **nullable** (matters for v1's global rooms). v1 schema verified against `crewhub/backend/app/db/migrations.py` (v25): per-table mapping in D-M6-8.

---

## 1. Design decisions (made now, argued here, binding for the milestone)

### D-M6-1 — Finish the M1 hooks bridge before the wizard advertises it

The wizard's "hooks opt-in with preview" step (21.1 AC) sells a feature that today cannot run: `HookInstaller` and the UDS receiver are fully tested modules with zero call sites, and `crewhub-signal` is not in the bundle. T1 completes the M1 plan's dormant tail: (a) bundle `crates/crewhub-signal` as a Tauri sidecar (`bundle.externalBin`) and resolve its bundled path for the installer's command string; (b) boot the receiver in `lib.rs` setup on `<app-data>/signal.sock`, feeding its signals into the provider's existing event channel (the seam `engine/mod.rs` documents); (c) IPC: `hooks_status() -> {installed, settings_path, sidecar_ok}`, `preview_hooks_install() -> {before, after}` (a new pure `preview()` on the installer that returns the exact would-be settings text — the wizard renders a real diff, master-plan R3's "preview diff" promise), `install_hooks()`, `uninstall_hooks()`. **Windows: the hooks step is hidden** (UDS; named-pipe abstraction is explicitly post-v2.0 per master-plan R6) — the app degrades to watcher-only there, copy says so honestly. _Alternative considered:_ shipping the wizard with hooks marked "coming soon" — rejected; hooks are the latency story and R3's mitigation (opt-in + preview + perfect uninstall) is already built, only unwired.

### D-M6-2 — Wizard = an overlay route over the untouched shell, driven by two settings keys

The wizard is **not** a panel: it renders as a full-window overlay above `WorkspaceShell` whenever `onboarding.state != "done"` (new settings keys: `onboarding.state` = `pending | done | skipped`, `onboarding.step` = the resumable step id). Steps: `welcome → detect → projects → crew → integrations → finish`. Every step has "Skip" (writes `skipped`, lands in the shell — the app must never hold the user hostage); quitting mid-wizard resumes at `onboarding.step` on next launch (21.1 "skippable, resumable"); the settings panel gets "Re-run setup wizard" (resets the two keys). Existing users (DB already has projects/agents) boot with `onboarding.state` auto-set to `done` by a one-time check in `lib.rs` — the wizard greets only genuinely fresh installs. _Alternative considered:_ a separate Tauri window (like settings) — rejected: the finish step morphs into the live workspace ("finish lands in a working workspace"), which only works if the wizard already lives in the main window.

### D-M6-3 — Detection & project scan are typed IPC over existing knowledge, not new scanners

`detect_environment()` (T2) probes in Rust: `claude` on PATH (`which`-equivalent walk of PATH), then the known install locations (`~/.claude/local/claude`, `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`), runs `--version` on the winner (2 s timeout), and reports `~/.claude` + `~/.claude/projects` existence and `~/.crewhub/crewhub.db` presence (the importer hook). The resolved path is persisted (`claude.cli_path` setting) and **`ClaudeConfig` now reads it at startup** — fixing the silent-failure path where a non-PATH install made the provider die with an `eprintln!`. If detection fails, the wizard shows guided install instructions and a manual path picker (re-probe on change); the missing-CLI state is a first-class screen, not an error toast. "Scan recent projects" adds **no filesystem scanner**: `scan_recent_projects()` folds the watcher's existing `SessionMeta` cache (project path + last activity, already maintained for `list_sessions`) into a ranked unique-path list; the wizard offers the top entries as one-click project creations. Fresh machines with no transcripts simply see the manual folder picker (existing `pick_folder`).

### D-M6-4 — Notification engine: same pure matcher, wider closed trigger list, sink chosen per rule

M3 built exactly the seam M6 needs: `matchRules(rules, event)` is pure TS and `ToastCenter` is "the ONLY sink in M3". M6 (a) **extends the closed trigger list** in `store/notification_rules.rs` from the 4 task triggers to + `permission_needed`, `session_stopped`, `session_error`, `meeting_complete`, `hook_notification` (Rust-validated; no CHECK constraint exists, so **no migration**); (b) extends the TS `RuleEvent` fold to consume the `EngineEvent` stream the webview already receives — `PermissionRequest` → `permission_needed`, `Updated` meta folding to stopped/errored statuses → `session_stopped`/`session_error`, `Signal{notification}` → `hook_notification` (the Epic 7 `Notification` hook passthrough, which T1 just turned on), `MeetingChanged` to a completed state → `meeting_complete`; (c) adds the OS sink: `tauri-plugin-notification`, called from the same dispatch point as the toast sink, with per-rule routing in `config_json.sink` = `"toast" | "os" | "both"` (defaults: task triggers `toast`, the new attention triggers `both`). Per-rule mute is the existing `enabled` flag surfaced as a one-click toggle. **Honest deviation on "click focuses the relevant panel":** the v2 notification plugin has no reliable cross-platform click callback — OS-notification click brings the app forward (OS behavior), and on window focus with pending permissions CrewHub opens the sessions panel at the waiting session (focus-listener + existing palette routes). In-app toasts keep their precise click-to-panel routing. Documented here as the deliberate interpretation of the AC; revisit if the plugin grows click events.

### D-M6-5 — Tray & dock live entirely in Rust; the webview gets exactly one new capability row

Tray (T5): tauri `tray-icon` feature, built in `src-tauri/src/tray.rs` — icon + tooltip `"CrewHub — N active / M waiting"`, menu (Open CrewHub, counts line, Check for updates, Quit). Counts derive from the registry's meta cache (active = working statuses) and the pending-permission set; recomputed on engine events, debounced 500 ms. Dock/taskbar badge: `set_badge_count(Some(pending_permissions))` — the #1 "why is it stuck" signal (22.2 AC), macOS dock + Linux unity launchers; Windows gets the overlay-icon fallback or nothing (best-effort, noted). **Capability impact: zero** — tray and badge are Rust-side. The OS notification sink is the only new webview grant of the milestone: `notification:default` in `capabilities/main.json` **plus its justification row in `capabilities/README.md`** (the register is an AC, reviewers reject capability changes without it). Updater, importer, error reports: all typed Rust commands, zero grants — the D-M3-7 dialog precedent.

### D-M6-6 — Release workflow degrades to unsigned when secrets are absent (Apple secrets = parked, never blocking)

New `.github/workflows/release.yml` (Lane J), triggered on `v*` tags + `workflow_dispatch` (so the whole pipeline is testable **before any secret exists**). Jobs: a `plan` job computes `has_tauri_key` / `has_apple` from secret presence and emits flags; a build matrix — `macos-latest` (universal: `aarch64-apple-darwin` + `x86_64-apple-darwin`), `windows-latest` (NSIS), `ubuntu-latest` (AppImage + deb) — runs `tauri-apps/tauri-action`. Degradation rules, in order: **no `TAURI_SIGNING_PRIVATE_KEY`** → build with updater artifacts disabled via a `--config` overlay (`createUpdaterArtifacts: false` — the base config enables it, T7), artifacts uploaded with an `-unsigned` marker, release stays `prerelease: true`; **no `APPLE_*`** → macOS skips codesign/notarize env (tauri-action signs only when env present), artifact still produced. macOS signed+notarized is the **v2.0 release gate**; Windows/Linux are best-effort (`continue-on-error: true` on their smoke steps, per master plan R6). A `version-sync` step asserts `tauri.conf.json` == `package.json` == the tag (RELEASING.md rule, now enforced). Releases are drafts; publishing the draft (and its `latest.json`) is the manual "go" — which is also the staged-rollout lever (D-M6-7). _Alternative considered:_ hand-rolled `pnpm tauri build` + `gh release upload` — rejected: tauri-action already handles per-platform bundling, updater-manifest generation, and notarization env plumbing; we own only the degradation logic around it.

### D-M6-7 — Updater: pinned pubkey, GitHub-releases endpoint, "What's new" from persisted release notes

T7 pins the M0 pubkey from `RELEASING.md` into `tauri.conf.json` (`plugins.updater.pubkey`) with endpoint `https://github.com/<owner>/crewhub2/releases/latest/download/latest.json` and sets `bundle.createUpdaterArtifacts: true`. Updater calls are **Rust-side typed IPC** (no webview plugin grant): `check_for_update() -> { version, notes, date } | null` and `install_update()` (downloads, verifies signature, installs, then `tauri-plugin-process` relaunch). Staged rollout = the draft-release lever: `latest.json` only changes when the draft is published, and a bad release is rolled back by re-pointing the published assets — no custom CDN until we need percentage rollouts (explicitly Appendix B). **"What's new":** before relaunch, `install_update` persists `{version, notes}` to settings `updater.pending_notes`; on next boot the frontend finds it, shows the dialog (release notes through the shared `Markdown.tsx`), clears the key, updates `app.last_seen_version`. This also fires on first manual install of a newer version (boot compares `app.last_seen_version` to the running version with notes absent → a notes-less "Updated to vX" toast) — cheap, no remote fetch, CSP untouched.

### D-M6-8 — v1 importer: read-only rusqlite, preserved v1 ids as the idempotency key, dry-run as the same code path

`src-tauri/src/import/v1.rs` (T3) opens the v1 DB with `OpenFlags::SQLITE_OPEN_READ_ONLY` (never writes, 24.1 "v1 left untouched"), probes columns defensively (v1 used `IF NOT EXISTS` migrations; old installs may lack late columns — every optional column reads through a tolerant helper). **Idempotency = v1 ids are preserved verbatim** and every insert is skip-if-exists; re-running reports `skipped: already imported` per row, no dupes, no flag files. Two IPC commands share one engine: `preview_v1_import(db_path?)` runs the full mapping in memory and returns the report; `run_v1_import(db_path?, options)` executes the same plan inside one transaction. The report is per-table `{found, will_import, skipped: [{reason, count}]}` plus row-level warnings. Mapping table (the binding contract; v2 columns from `migrations/001_init.sql`):

| v1                                                   | v2                                         | Notes                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`                                           | `projects`                                 | `folder_path` is nullable in v1, NOT NULL in v2 → preview flags `needs_folder`; `options.folder_overrides[v1_id]` assigns one, else the project is **skipped** (counted)                                                                   |
| `rooms` (global, no project)                         | `rooms` with `project_id = NULL`           | v2 column is nullable (verified); `default_model`/`speed_multiplier` fold into `style_json`; `is_hq = false`                                                                                                                               |
| `agents` + `agent_personas` + `agent_surfaces`       | `agents`                                   | persona row + surfaces fold into `persona_json` (one JSON: preset, sliders, custom_instructions, surfaces[]); `custom_instructions` also → `system_prompt`; `avatar_url` → `avatar`; `agent_session_key`/`default_room_id` dropped (noted) |
| `tasks`                                              | `tasks`                                    | same status/priority enums (verified incl. `urgent`); `assigned_session_key` → `assignee_agent_id` via v1 `agents.agent_session_key` lookup, else NULL (counted); `created_by` → `agent:<id>` when it resolves, else `human`               |
| `project_history`                                    | `task_events`                              | only rows with `task_id` (v2 column is NOT NULL); project-level rows dropped (counted); `actor_session_key` → actor via the same lookup                                                                                                    |
| `room_assignment_rules`                              | `room_rules`                               | `keyword`/`model` verbatim; `label_pattern` → `keyword` (flagged); `session_type` dropped — an OpenClaw concept with no v2 analogue (counted)                                                                                              |
| `session_display_names` + `session_room_assignments` | `session_bindings` (merged on session key) | import only keys that are CC session UUIDs; OpenClaw gateway keys (`agent:...`) dropped (counted)                                                                                                                                          |
| `prompt_templates`                                   | `prompt_templates`                         | `variables` → `variables_json`; `is_builtin = TRUE` rows skipped (v2 has its own seeds)                                                                                                                                                    |
| `custom_blueprints`                                  | settings KV `world.props:<room_id>`        | importer returns raw `blueprint_json` rows in the report; the **frontend** import dialog converts them through the existing tested `parse-v1.ts` + `serializeRoomProps` and writes the KV (room ids preserved, so keys line up)            |

`placed_props`, `connections`, `api_keys`, `threads*`, `claude_processes`, v1 `meetings*`/`standups*`/`pipelines` are **not imported** (master plan §4.4 dropped/rebuilt list); the preview says so explicitly rather than silently. _Alternative considered for blueprints:_ porting the converter to Rust — rejected; `parse-v1.ts` is pure, fixture-tested, and the import UI already runs in the webview; one conversion implementation beats two.

### D-M6-9 — Sample crew: a real folder, two haiku agents, deletable like anything else

`create_sample_crew()` (T2) materializes `~/CrewHub Sample/` (README.md + a tiny docs/ tree — enough for the docs panel and a first chat to react to), then creates: 1 project pointing at it, 2 rooms (HQ-style lounge + workshop), 2 agents — **safe defaults: `default_model: haiku`, `permission_mode: default`, `auto_spawn: false`** (a demo must never burn tokens or touch files uninvited) — and 3 starter tasks on the board. No special "sample" flag: it is ordinary data, deleted through ordinary CRUD (the wizard's copy points at delete). Idempotent: refuses politely if the folder or project already exists.

### D-M6-10 — Error log: a ring buffer module replacing 23 `eprintln!`s, report bundle is user-initiated only

`src-tauri/src/errlog.rs` (T6): `errlog::error!(ctx, err)`-style fn writing one JSON line `{ts, context, message}` to `<app-data>/errors.jsonl`, ring-capped (keep last 500 entries; rewrite-on-rotate, no file-handle daemon), plus a `std::panic::set_hook` that logs panic + backtrace before aborting, and a startup line (version, OS) per launch. All 23 `eprintln!` sites migrate (grep-enforced: CI-checked `eprintln!` count in `src/` == 0 outside tests/bins). "Report issue" (23.3): `build_error_report() -> path` assembles a single markdown file in temp — app version, OS/arch, last 50 error lines, capability summary, **no transcript content, no settings values, no paths beyond the app's own** — and reveals it (fixed-argv `open -R`/`explorer /select`, the handoff precedent); the user gists it themselves. No telemetry, nothing leaves the machine unprompted (master plan §5.8).

### D-M6-11 — Parity checklist is a verification task with a written artifact, not a vibe

24.2 produces `docs/release-notes/v2.0.md`: the §2 triage table copied and re-walked against the **built artifact** (not the dev build) — every Keep/Reimagine row gets ✅/⚠️ + a one-liner; gaps become the release notes' "Known gaps vs v1" section (honest, master plan AC). The v1 sunset note ships as a PR to the **v1 repo's** README ("CrewHub v1 remains the OpenClaw build; v2 is Claude Code-native — importer in Settings → Import from v1") — recorded here as a step, executed in the v1 repo, never touching v1 behavior (the standing OpenClaw-preservation rule).

### D-M6-12 — Playfulness inventory M6 (named, concrete, reduced-motion-aware — these are ACs)

| Name             | Where                 | What                                                                                                                        |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Welcome Walk** | wizard                | the CrewHub bot avatar walks the step rail, waving at the active step (reduced-motion: static position)                     |
| **Crew Cheer**   | wizard finish         | confetti burst (reuses `confetti.css`, ≤1 s) + "your crew is moving in 📦" as the overlay dissolves into the live workspace |
| **Moving Day**   | import report         | per-table rows land as moving boxes — "📦 14 tasks moved in · 🚫 2 left behind (no folder)"; skipped reasons in plain words |
| **Tray Mood**    | tray icon             | icon variant swaps calm → busy → "✋ waiting on you" when pending permissions > 0 (static assets, no animation)             |
| **Fresh Paint**  | What's new dialog     | sparkle header ✨ + release notes through shared Markdown; "Later" never nags twice for the same version                    |
| **Quiet Inbox**  | notification settings | empty rules state: "🔕 nothing will interrupt you — add a rule to change that"                                              |

Closed inventory — anything not named here is post-v2.0 material. All touches behind `use-reduced-motion.ts` with media-query-mock tests.

---

## 2. Current surface — audit & gaps (what the lanes must add)

What exists and is sufficient: hooks installer/receiver/conflicts modules with full round-trip tests; `crates/crewhub-signal` (<50 ms, always exit 0); MCP enable/disable/status IPC + per-launch token refresh; `notification_rules` CRUD IPC + the pure TS matcher + ToastCenter; settings KV + `SettingChanged` reconciliation across windows; `pick_folder`; `app_info` (version + data dir); `parse-v1.ts` + `serializeRoomProps` + `world.props:*` KV; `ci.yml` gates (prettier/eslint/tsc/vitest/fmt/clippy/test/bindings-drift/e2e-linux/sonar) + weekly canary; capability register discipline.

Gaps found (each becomes a task step):

| #   | Gap                                                                                                                                                                                              | Blocks         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| G1  | **Hooks bridge unwired end-to-end**: receiver never started in `lib.rs`, `crewhub-signal` not in `bundle.externalBin`, zero hooks IPC (no status/preview/install/uninstall)                      | EKI-86, EKI-92 |
| G2  | **No CLI detection**: `ClaudeConfig::default()` hardcodes `"claude"`; non-PATH installs ⇒ provider dies with an `eprintln!` and the app looks broken                                             | EKI-86         |
| G3  | **No onboarding surface or state**: app boots straight into the shell; no `onboarding.*` settings keys, no wizard, no sample crew, no fresh-install detection                                    | EKI-86, EKI-88 |
| G4  | **Notification triggers closed at 4 task triggers**; matcher only fed by tasks-store deltas — `PermissionRequest`/`Signal`/meeting events unwatched; no OS sink, no notification plugin anywhere | EKI-92         |
| G5  | **No tray/dock code**: `tray-icon` feature absent from the tauri dependency, no badge calls, no tray assets                                                                                      | EKI-94         |
| G6  | **No release pipeline**: `ci.yml` builds `--debug --no-bundle` only; no `release.yml`, no signing/notarization plumbing, no version-sync check, `bundle` config is icons-only                    | EKI-98         |
| G7  | **Updater absent**: pubkey lives only in `RELEASING.md`; no updater/process plugins, no endpoint, no `createUpdaterArtifacts`, no What's-new surface                                             | EKI-100        |
| G8  | **23 `eprintln!` sites, no persistence**: errors vanish with the terminal; no panic hook, no ring buffer, no report bundle                                                                       | EKI-102        |
| G9  | **No importer**: nothing reads `~/.crewhub/crewhub.db`; blueprint conversion exists only as paste-JSON (M5 dialog)                                                                               | EKI-106        |
| G10 | **E2E never touches a built artifact**: wdio smoke runs against the debug no-bundle build; 23.1's "smoke E2E against built artifact per platform" has no job                                     | EKI-98         |
| G11 | **Notification click-routing contract untested beyond toasts**: focus-listener route for pending permissions (D-M6-4's honest fallback) doesn't exist                                            | EKI-92         |

No gap (checked, works today): `session_bindings`/`room_rules`/`prompt_templates` v2 tables accept everything the mapping needs; `rooms.project_id` nullable; task status/priority enums match v1 verbatim; settings window reconciliation handles wizard-written keys; `Markdown.tsx` renders release notes; lefthook + CI prettier cover new docs.

---

## 3. Cross-cutting test strategy

1. **Importer is fixture-first.** A `fixtures/v1/` SQLite file built by a checked-in script (schema v25, plus a _degraded_ variant missing late columns) feeds unit tests for every mapping row in D-M6-8: counts, id preservation, skip reasons, session-key → agent resolution, gateway-key filtering. **Idempotency is a test:** import twice, assert second report is all-skipped and row counts unchanged. **Read-only is a test:** v1 file bytes hash-identical after import.
2. **Round-trip is the flagship integration test:** seed a v1 fixture → `run_v1_import` → assert projects/rooms/agents/tasks/rules/bindings/templates land via the normal store reads → frontend test converts the returned blueprints through `parse-v1.ts` and asserts the `world.props:*` KV shape.
3. **Wizard logic is a pure step machine** (`nextStep(state, answers)`), table-tested: skip at every step, resume from every step, fresh-install vs existing-data entry, missing-CLI branch. Component tests with mocked bindings cover detect-fail UI, hooks preview diff rendering, and the finish handoff.
4. **Matcher extension stays pure:** new trigger cases are table-driven TS tests (EngineEvent fold → trigger), sink routing (`toast|os|both`) asserted against a fake notification API; OS plugin calls mocked — no test fires real notifications.
5. **Hooks wiring reuses M1's recorded payloads:** integration test pipes the recorded hook fixtures through the real `crewhub-signal` binary into the booted receiver and asserts `Signal` events; installer preview asserted byte-equal to the post-install file.
6. **Release workflow is rehearsed unsigned:** `workflow_dispatch` run on a branch must produce all three platform artifacts with zero secrets configured (the degradation path is CI-tested before any secret exists); the artifact-smoke job launches the bundled app and asserts the window + `app_info` version.
7. **Error log:** ring rotation at the cap, panic-hook line present after a deliberate child-process panic, report bundle contains version + last lines and **no** transcript strings (negative assertion on a seeded marker).
8. **Updater:** unit-level only against a local mock `latest.json` (signature verification with a test keypair); the real endpoint is exercised manually at first release — no CI job depends on GitHub release availability.

---

## 4. File structure (locked in — ownership per lane)

```
crewhub2/
├── .github/workflows/
│   ├── release.yml                    # Lane J T12 — tag/dispatch release, secrets degradation
│   └── ci.yml                         # Lane J T13 — + artifact-smoke job, eprintln guard
├── src-tauri/
│   ├── tauri.conf.json                # T7 — plugins.updater (pinned pubkey), createUpdaterArtifacts,
│   │                                  #      bundle.externalBin (crewhub-signal), tray icons
│   ├── capabilities/main.json         # T4 — + notification:default (the milestone's ONLY new grant)
│   ├── capabilities/README.md         # T4 — + justification row (AC)
│   └── src/                           # Lane 0 owns src-tauri/** + regenerated bindings.ts
│       ├── import/{mod.rs,v1.rs}      # T3 — read-only rusqlite importer + report types
│       ├── errlog.rs                  # T6 — ring buffer, panic hook, report bundle
│       ├── tray.rs                    # T5 — tray icon, menu, badge counts (debounced)
│       ├── onboarding.rs              # T2 — detect_environment, scan_recent_projects, create_sample_crew
│       ├── updater.rs                 # T7 — check/install IPC, pending-notes persistence
│       ├── hooks/installer.rs         # T1 — + preview(); receiver boot + sidecar path in lib.rs
│       └── store/notification_rules.rs # T4 — trigger list extension (Rust-validated, no migration)
├── src/
│   ├── onboarding/                    # Lane I — Wizard.tsx, steps/{Welcome,Detect,Projects,Crew,
│   │   └── …                         #   Integrations,Finish}.tsx, step-machine.ts (pure), ImportDialog.tsx
│   ├── stores/toasts.ts               # Lane I T11 — EngineEvent fold + sink routing (matcher stays pure)
│   ├── components/WhatsNewDialog.tsx  # Lane I T11
│   └── panels/settings/SettingsPanel.tsx # Lane I — re-run wizard, import entry, notification sink/mute UI
├── e2e/onboarding.spec.ts             # Lane I — fresh-profile wizard happy path
├── docs/release-notes/v2.0.md         # Closing T15 — parity walk + known gaps
└── docs/RELEASING.md                  # Lane J T12 — full release runbook (secrets, gates, rollback)
```

Cross-lane touch points (explicit): Lane I mounts the wizard overlay with one ≤10-line diff in `App.tsx`; the import dialog calls Lane 0's importer IPC and the existing `parse-v1.ts` (no Lane-0 TS); Lane J never edits app code — workflows, docs, and one `package.json` script only. Anything else cross-lane is a plan bug.

---

## Lane 0 — Backend (serial, FIRST; owns `src-tauri/**` + `src/ipc/bindings.ts`)

### Task 1: Hooks bridge wiring completion (M) — D-M6-1, G1

- [ ] `bundle.externalBin` += `crewhub-signal`; sidecar path resolution helper (dev: target dir; bundled: resource dir); installer command string uses it.
- [ ] Boot the UDS receiver in `lib.rs` setup on `<app-data>/signal.sock`, signals folded into the provider event channel; stale-socket recovery covered by the existing receiver tests.
- [ ] `installer.preview()` (pure: returns `{before, after}` settings text); IPC: `hooks_status`, `preview_hooks_install`, `install_hooks`, `uninstall_hooks` (Windows: `hooks_status.supported = false`).
- [ ] Integration test per §3.5 (recorded payloads through the real binary); bindings regen; commit.

### Task 2: Onboarding backend — detect, scan, sample crew (M) — D-M6-3/9, G2/G3

- [ ] `onboarding.rs`: `detect_environment()` (PATH walk + known locations + `--version` probe + `~/.claude` + v1 DB presence), result persisted to `claude.cli_path`; `ClaudeConfig` construction in `lib.rs` reads the setting (fallback unchanged). TDD with temp dirs + fake binaries.
- [ ] `scan_recent_projects()` over the watcher meta cache (unique project paths ranked by last activity, existing-project paths filtered out).
- [ ] `create_sample_crew()` per D-M6-9 (folder materialization, project + 2 rooms + 2 haiku/default-permission agents + 3 tasks; idempotent refusal). Fresh-install check in `lib.rs`: existing data ⇒ `onboarding.state = "done"`.
- [ ] IPC + bindings regen; commit.

### Task 3: v1 importer (M — EKI-106, the milestone centerpiece) — D-M6-8, G9

- [ ] `import/v1.rs`: read-only open, tolerant column probing, the full D-M6-8 mapping as pure plan-building (`build_plan(v1_conn, v2_store, options) -> ImportPlan/Report`), preview and run sharing it; run executes in one v2 transaction.
- [ ] Idempotency via preserved v1 ids + skip-if-exists; session-key → agent resolution; UUID-shaped binding filter; blueprint rows returned raw for frontend conversion.
- [ ] Fixture tests per §3.1–3.2 (incl. degraded-schema variant, double-import, v1-bytes-untouched hash).
- [ ] IPC: `preview_v1_import(db_path?)`, `run_v1_import(db_path?, options)` (options: `folder_overrides`); emits the existing coarse DomainEvents (`ProjectChanged`/`AgentCreated`/`TaskChanged`…) batched after commit; bindings regen; commit.

### Task 4: Notification triggers + OS sink plumbing (S) — D-M6-4/5, G4

- [ ] `NOTIFICATION_TRIGGERS` += `permission_needed | session_stopped | session_error | meeting_complete | hook_notification` (validation tests; **no migration**).
- [ ] Add `tauri-plugin-notification`; `capabilities/main.json` += `notification:default`; **capability README row** (AC).
- [ ] Default-rule seeding for fresh installs (attention triggers, `sink: "both"`, global scope) behind the wizard's notifications opt-in (data written by T2's wizard finish, defined here); commit.

### Task 5: Tray & dock (S — EKI-94) — D-M6-5, G5

- [ ] Cargo: tauri `tray-icon` + `image-png` features; `tray.rs`: icon (3 Tray Mood variants as static assets), tooltip counts, menu (Open, counts, Check for updates → T7 IPC, Quit).
- [ ] Counts fold from registry metas + pending permissions, debounced 500 ms; `set_badge_count` on pending-permission transitions (macOS/Linux; Windows best-effort overlay or skip).
- [ ] Unit-test the pure count fold; manual checklist for per-OS tray rendering; commit.

### Task 6: Error log + report bundle (S — EKI-102) — D-M6-10, G8

- [ ] `errlog.rs`: JSONL ring (last 500, rewrite-on-rotate), launch header line, panic hook with backtrace; migrate all 23 `eprintln!` sites; add the CI grep guard (Lane J wires it).
- [ ] `build_error_report()` → temp markdown (version/OS/arch, last 50 lines, no transcript/settings values) + fixed-argv reveal; negative-assertion test per §3.7; IPC + bindings regen; commit.

### Task 7: Updater wiring (M — EKI-100) — D-M6-7, G7 — **bindings freeze after this task**

- [ ] Add `tauri-plugin-updater` + `tauri-plugin-process`; pin the RELEASING.md pubkey in `tauri.conf.json`, endpoint per D-M6-7, `bundle.createUpdaterArtifacts: true`.
- [ ] `updater.rs` IPC: `check_for_update()` (returns version/notes/date or null; manual + on-launch debounced check behind setting `updater.auto_check`, default on), `install_update()` (persist `updater.pending_notes`, install, relaunch).
- [ ] Mock-endpoint signature test per §3.8; regenerate bindings; **declare the M6 bindings surface frozen** (Lane I starts from this commit); commit.

## Lane I — Wizard, import & notification UI (owns `src/onboarding/**`, `WhatsNewDialog`, settings-panel additions, `e2e/onboarding.spec.ts`)

### Task 8: Wizard shell + step machine (M — EKI-86 part 1) — D-M6-2

- [ ] `step-machine.ts` pure + table-tested (§3.3); overlay mount in `App.tsx` (the one coordinated diff) gated on `onboarding.state`; Welcome Walk rail; skip-everywhere; resume from `onboarding.step`; settings-panel "Re-run setup wizard".
- [ ] Steps Welcome + Detect: CLI found/missing branches, guided install copy, manual path picker with re-probe; `~/.claude` status.
- [ ] AC: fresh profile shows wizard; mid-quit resumes; skip lands in the shell; commit.

### Task 9: Wizard steps — projects, crew, integrations, finish + sample crew (M+S — EKI-86 part 2 + EKI-88)

- [ ] Projects step: `scan_recent_projects` picks + manual `pick_folder`; Crew step: first agent (name/icon/model — haiku prefilled) or "Try with a sample project" → `create_sample_crew` (EKI-88).
- [ ] Integrations step: hooks opt-in rendering the **real preview diff** (`preview_hooks_install`, before/after with the fenced block highlighted, plain-words explanation of what is written where), MCP enable toggle per created project, notifications opt-in (T4 default rules); every integration individually declinable.
- [ ] Finish: seeded two-panel layout (chat + board), Crew Cheer confetti, `onboarding.state = done`.
- [ ] AC (EKI-86/88): wizard E2E happy path (`e2e/onboarding.spec.ts`, fresh profile → detect (fake-claude on PATH) → project → sample crew → skip hooks → finish lands in workspace); reduced-motion variants; commit.

### Task 10: Import-from-v1 UI (M — EKI-106 UI) — D-M6-8

- [ ] `ImportDialog.tsx`: v1 DB auto-detected path (from `detect_environment`) or file picker → preview table (Moving Day rows, per-table counts + skip reasons), per-project folder-override pickers for `needs_folder`, confirm → `run_v1_import` → report screen.
- [ ] Blueprint conversion client-side: returned `blueprint_json` rows → `parse-v1.ts` → `serializeRoomProps` → `world.props:<room_id>` KV writes; per-blueprint success/failure in the report.
- [ ] Entry points: wizard detect-step banner ("v1 found — bring your crew? 📦") + settings panel; second-run shows all-skipped honestly.
- [ ] AC (EKI-106): §3.2 round-trip green incl. frontend blueprint leg; commit.

### Task 11: Notification sink swap + settings UI + What's new (M — EKI-92 UI + EKI-100 UI) — D-M6-4/7, G4/G11

- [ ] `stores/toasts.ts`: EngineEvent fold for the five new triggers (pure, table-tested per §3.4); sink dispatch `toast|os|both` (OS via plugin JS API); dedupe window applies across sinks; focus-listener route to the waiting session when pending permissions exist (G11).
- [ ] Settings panel: rules list grows the new triggers, per-rule sink selector + one-click mute (`enabled`); Quiet Inbox empty state.
- [ ] `WhatsNewDialog.tsx`: `updater.pending_notes` on boot → Fresh Paint dialog (shared Markdown), clears key, sets `app.last_seen_version`; "Check for updates" in settings + palette wired to T7 IPC with downloading/relaunch states.
- [ ] AC (EKI-92): permission-needed fires an OS notification (mocked in tests, manual once for real); per-rule mute respected; meeting-complete and hook-notification triggers covered by table tests; commit.

## Lane J — Distribution workflows (CI yaml + docs only; owns `.github/workflows/**`, `RELEASING.md`)

### Task 12: `release.yml` + runbook (L — EKI-98) — D-M6-6, G6

- [ ] `plan` job (secret-presence flags) → 3-platform `tauri-action` matrix (macOS universal, Windows NSIS, Linux AppImage+deb); signing env applied only when flags true; no-key path builds with the `createUpdaterArtifacts:false` config overlay and `-unsigned` artifact names; draft release + `latest.json` upload when signed.
- [ ] `version-sync` step (tag == `tauri.conf.json` == `package.json`); macOS job is required, Windows/Linux `continue-on-error` (master plan R6); `workflow_dispatch` rehearsal documented.
- [ ] `RELEASING.md` → full runbook: secrets matrix (Appendix D verbatim), tag → draft → smoke → publish (= updater go-live), rollback (re-point draft), staged-rollout lever; commit.
- [ ] AC (EKI-98 part 1): dispatch run on this branch yields three unsigned artifacts with zero secrets configured.

### Task 13: Artifact smoke + CI guards (M — EKI-98 part 2) — G10

- [ ] `release.yml` smoke job per platform: install/launch the **bundled** artifact, wdio asserts window title + `app_info` version (macOS required; Win/Linux best-effort).
- [ ] `ci.yml`: `eprintln!`-guard grep (T6), `xmllint --noout docs/plans/*.drawio` docs check, version-sync reused on PRs touching version files.
- [ ] AC: smoke green on the unsigned rehearsal artifacts; commit.

## Closing (main lane, after all lanes merge)

### Task 14: Integration sweep (S)

- [ ] Wizard ↔ importer ↔ notifications cross-checks: import during wizard lands rooms/props visible in the 3D world; tray counts react to a spawned session; OS + toast dedupe sane.
- [ ] Playfulness AC sweep (every D-M6-12 touch + reduced-motion); capability register matches granted permissions exactly; naming-firewall grep clean (`import/`, `onboarding.rs` contain no claude tokens outside the detection probe's documented exception).
- [ ] Full E2E suite green incl. `onboarding.spec.ts`; commit.

### Task 15: Parity checklist & sunset note (S — EKI-107) — D-M6-11

- [ ] Walk the master-plan §2 triage table against a **built artifact**; `docs/release-notes/v2.0.md` with per-row ✅/⚠️ + "Known gaps vs v1".
- [ ] v1 README pointer PR in the v1 repo (OpenClaw users: v1 remains the OpenClaw build; importer location) — zero v1 behavior changes; commit (v2 side: link recorded in release notes).

### Task 16: M6 exit review

- [ ] Full local + CI gates (clippy, cargo test, tsc, vitest, E2E, Sonar, bindings drift); release rehearsal re-run.
- [ ] Linear AC walk over EKI-86/88/92/94/98/100/102/106/107; close epics EKI-84/90/96/104.
- [ ] **Exit criteria (all must hold):**
  - [ ] **A signed, notarized macOS artifact** built by CI from a tag, installed on a clean machine, passes the wizard → chat round-trip (requires Nicky's Appendix-D secrets; until they land this single criterion is parked, everything else verified on the unsigned artifact).
  - [ ] **Importer round-trip:** a real v1 `~/.crewhub/crewhub.db` imports with a truthful preview, ids preserved, second run all-skipped, v1 file hash-unchanged, blueprints visible in the 3D world.
  - [ ] Fresh profile: wizard detects the CLI (or guides install), creates project + crew (or sample crew), hooks preview shows the exact fenced block before opt-in, finish lands in a working workspace; skip + resume both work.
  - [ ] A pending permission raises an OS notification and the tray/dock badge; per-rule mute silences it; uninstalling hooks restores `~/.claude/settings.json` byte-identical.
  - [ ] Updater: vX → vX+1 across two CI-built artifacts verifies signature, installs, relaunches, shows What's new from the release notes.
  - [ ] "Report issue" produces a bundle with version + recent errors and zero transcript content; no telemetry of any kind exists.
  - [ ] Release notes contain the verified parity table; the v1 sunset PR is open.
- [ ] File the post-v2.0 backlog (Appendix B) as issues; close milestone.

---

## Build order & parallelism (Lane 0 first, then I ∥ J)

```
Lane 0 (serial, first): T1 → T2 → T3 → T4 → T5 → T6 → T7      [src-tauri/** + bindings; freeze after T7]
Lane I (UI):            T8 → T9 → T10 → T11                     [src/onboarding/**, toasts, settings, e2e]
Lane J (CI/docs):       T12 → T13   — may start IMMEDIATELY (no bindings dependency; only
                                      T13's smoke needs any merged app code, none of it M6-specific)

T14 → T15 → T16 close out after all lanes merge.
Dependencies: T8 needs T1+T2 IPC; T9 needs T2 (+T4 default rules); T10 needs T3; T11 needs T4+T7;
T12 needs T7's tauri.conf updater block to exist on the branch it rehearses (coordinate: T7 commit
message pings Lane J); T5 menu's "Check for updates" needs T7 (stub until then).
Lanes own disjoint paths; the single coordinated diff is the wizard mount in App.tsx (T8).
```

## Risks specific to M6

| #     | Risk                                                                                      | Mitigation                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6-R1 | **Apple secrets dependency stalls the milestone** (cert purchase/issuance is external)    | Parked-not-blocked by design (D-M6-6): unsigned path CI-tested from T12 day one; signing flips on via secrets alone, zero code change; the one gated exit criterion is explicitly severable |
| M6-R2 | Notarization rejects the bundle (sidecar binaries, entitlements)                          | `crewhub-signal` + app binary signed via tauri-action's standard flow; hardened-runtime entitlements reviewed in T12; first signed rehearsal happens the day secrets land, not at release   |
| M6-R3 | v1 DBs in the wild at older schema versions / dirty data                                  | Tolerant column probing + degraded-schema fixture; every skip is counted and shown, never silent; importer is read-only so a failed run is retryable by construction                        |
| M6-R4 | Updater endpoint/manifest subtly wrong → users stranded on v2.0.0                         | Two-artifact update test in exit criteria; draft-release lever means `latest.json` appears only after smoke passes; runbook documents rollback                                              |
| M6-R5 | OS notification & tray behavior diverges per platform (click events, badges, Linux trays) | Honest contract in D-M6-4/5: app-forward on click + focus-routing; per-OS manual checklist in T5/T11; Windows/Linux are best-effort at v2.0 (master plan R6)                                |
| M6-R6 | Wizard scope creep (themes, advanced layouts, every setting up front)                     | Closed step list in D-M6-2; everything else lives in settings; wizard is skippable end-to-end so nothing may exist only inside it                                                           |
| M6-R7 | Hooks install alarms users (R3 redux, now in front of newcomers)                          | Preview diff is the real text, fenced block highlighted; per-integration decline; uninstall byte-identical (existing tests); watcher-only mode remains fully functional                     |

---

## Appendix A — Settings & data introduced in M6

| Where                | Key / shape                                                                                                    | Writer                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| settings KV          | `onboarding.state` = `pending\|done\|skipped` · `onboarding.step`                                              | wizard (T8/T9), fresh-check (T2) |
| settings KV          | `claude.cli_path` (detected/chosen CLI)                                                                        | detect step (T2)                 |
| settings KV          | `updater.auto_check` (default `"true"`) · `updater.pending_notes` ({version, notes}) · `app.last_seen_version` | updater (T7), dialog (T11)       |
| settings KV          | `world.props:<room_id>` (existing M5 key — importer writes via the frontend leg)                               | import dialog (T10)              |
| `notification_rules` | five new trigger values; `config_json.sink` = `"toast"\|"os"\|"both"`                                          | T4 seeds, settings UI (T11)      |
| files                | `<app-data>/errors.jsonl` (ring, 500) · `<app-data>/signal.sock`                                               | errlog (T6), receiver (T1)       |

Migration count for the milestone: **zero**.

## Appendix B — Deliberately NOT in M6 (so nobody "helpfully" adds them)

- **Telemetry, crash auto-upload, Sentry** — report bundle is user-initiated, local, gist-able; anything automatic is a different product decision.
- **Percentage/staged-rollout CDN** — the draft-release lever suffices at this user count; revisit with real install numbers.
- **Windows named-pipe hooks bridge** — post-v2.0 (master plan R6); Windows ships watcher-only and says so.
- **In-app gist/GitHub-issue submission** — would need tokens/secrets storage (master plan §5.6 says none); reveal-the-file is the v2.0 story.
- **Importing v1 meetings/standups/threads/pipelines/placed_props/api_keys/connections** — dropped or rebuilt-different per master plan §4.4; the preview lists them as not-imported.
- **Onboarding telemetry/analytics ("how far do users get")** — no.
- **Auto-install of the Claude CLI** — guide, link, re-probe; never run installers on the user's behalf.
- **Notification action buttons (approve permission from the notification)** — needs plugin click/action support; revisit when the plugin grows it.

## Appendix C — The frozen M6 surface (single source of truth for Lane I)

New IPC commands after Lane 0 T7 (anything missing here is a Lane-0 bug, not a UI workaround):

| Command                                      | Returns                                                 | Task |
| -------------------------------------------- | ------------------------------------------------------- | ---- |
| `hooks_status()` / `preview_hooks_install()` | `HooksStatus` / `{before, after}`                       | T1   |
| `install_hooks()` / `uninstall_hooks()`      | `HooksStatus`                                           | T1   |
| `detect_environment()`                       | `EnvReport { cli, version, claude_dir, v1_db }`         | T2   |
| `scan_recent_projects()`                     | `RecentProject[] { path, last_active }`                 | T2   |
| `create_sample_crew()`                       | `SampleCrewResult { project_id, agent_ids }`            | T2   |
| `preview_v1_import(db_path?)`                | `ImportReport` (per-table counts, warnings, blueprints) | T3   |
| `run_v1_import(db_path?, options)`           | `ImportReport`                                          | T3   |
| `build_error_report()`                       | `string` (revealed path)                                | T6   |
| `check_for_update()` / `install_update()`    | `UpdateInfo \| null` / `()` (relaunches)                | T7   |

`DomainEvent`: **no new variants** — importer batches existing coarse events; wizard state rides `SettingChanged`. New webview capability: `notification:default` only. MCP tool surface: unchanged (seven tools stay seven).

## Appendix D — Secrets matrix (Nicky-provided; the workflow runs without ALL of them)

| Secret                               | Used by                     | Absent ⇒                                                                        |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | updater artifact signing    | updater artifacts disabled, bundles named `-unsigned`, release stays prerelease |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ditto                       | ditto                                                                           |
| `APPLE_CERTIFICATE` (.p12, base64)   | macOS codesign              | unsigned .app/.dmg (Gatekeeper-blocked, dev-testable)                           |
| `APPLE_CERTIFICATE_PASSWORD`         | ditto                       | ditto                                                                           |
| `APPLE_ID`                           | notarization (`notarytool`) | notarization skipped                                                            |
| `APPLE_TEAM_ID`                      | ditto                       | ditto                                                                           |
| `APPLE_PASSWORD` (app-specific)      | ditto                       | ditto                                                                           |
| `SONAR_TOKEN` (exists)               | ci.yml Sonar                | already configured                                                              |

The updater **public** key is not a secret: pinned in `tauri.conf.json` (T7) from `RELEASING.md`; the private half stays at `~/.tauri/crewhub2.key` and in the two `TAURI_SIGNING_*` secrets, never in the repo.
