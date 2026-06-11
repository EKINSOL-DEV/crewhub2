# v1 → v2 Parity Checklist (EKI-107, verified 2026-06-12)

Re-verification of the master plan's triage table (§2) against the shipped app.

## Keep — all delivered ✅

| v1 feature                                                            | v2 status                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Agents registry (incl. pinning, auto-spawn, models, permission modes) | ✅ Crew panel + agents store                                        |
| Projects & rooms (HQ, styling via themes)                             | ✅ Projects/Rooms panels                                            |
| Task board (statuses, priorities, history)                            | ✅ Board panel + task_events timeline                               |
| Room assignment rules                                                 | ✅ Rule editor + Rust evaluator (TS mirror tested 1:1)              |
| Session display names                                                 | ✅ session_bindings (SQLite, not localStorage)                      |
| Session history & archive + search                                    | ✅ History panel + FTS5                                             |
| Chat (markdown, thinking, tools, media, permissions)                  | ✅ Chat panel (virtualized, p95 9.3ms @ 5k items)                   |
| Activity feed                                                         | ✅ Activity panel (hook-driven, sub-second)                         |
| Handoff (terminal/editor/copy)                                        | ✅ Handoff menu (Rust-side, path-policy)                            |
| Meetings & standups + action items → tasks                            | ✅ Meetings panel (round-robin per ADR-0002, haiku gathering)       |
| Theming, shortcuts, palette                                           | ✅ 9 v1 themes, full keymap, ⌘K                                     |
| Onboarding wizard                                                     | ✅ First-run overlay (detect → projects → crew → hooks → MCP)       |
| Backup/restore                                                        | ✅ superseded by v1 importer + report bundles; DB lives in app-data |
| Desktop notifications & tray                                          | ✅ OS sink + tray counts + dock badge                               |
| Org chart / crew overview                                             | ✅ folded into crew bar + session tree (👥 teams)                   |
| 3D world (rooms, bots, status, task wall, first-person)               | ✅ World panel (R3F v9, theme-aware, 118–121 fps)                   |

## Reimagine — all delivered with the better mechanism ✅

Context injection (SessionStart hook envelope), agents-update-tasks (MCP tools + acting_as),
conflict detection (PreToolUse), activity (FS events + hooks, no polling), pipelines (run
sequences + native subagents/teams viz), cron (in-app croner scheduler), personas (fenced
CLAUDE.md materialization), permissions (control protocol + allow-always rules), group chat
(superseded by meetings + send_message_to_agent inbox), templates (+ slash-command listing),
terminal-session adopt (watcher + take-over), zen mode (IS the shell).

## Defer — confirmed deferred, seams intact

| Feature                              | Status                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| OpenClaw runtime                     | Deferred; `SessionProvider` seam proven by TestProvider compile-test. **v1 remains the OpenClaw build.** |
| Creator mode                         | Parked (EKI-83) — product decision pending; revive path = headless `claude -p`                           |
| Embedded browser panel               | Deferred (panel registry accepts new kinds)                                                              |
| Mobile / web app                     | Deferred per non-goals                                                                                   |
| Agent file storage, voice messages   | Deferred                                                                                                 |
| Windows hook transport (named pipes) | Documented no-op; degraded watcher-only mode works                                                       |

## Drop — confirmed gone

FastAPI/REST/SSE, API keys/scopes/audit, Codex connection type, Python runtime,
discovery service, demo mode, localStorage persistence — none resurfaced.
