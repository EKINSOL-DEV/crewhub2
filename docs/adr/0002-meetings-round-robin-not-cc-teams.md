# ADR 0002 — Meetings: CrewHub round-robin, not Claude Code agent teams

- **Status:** accepted
- **Date:** 2026-06-11
- **Context:** M4 plan T1 (master plan Q1, D-M4-1). Timebox: ½ day — finished well inside it.
- **Decides for:** Epic 16 (meeting engine, EKI-10) and Epic 18 (teams visualization, EKI-47/54).

## Question

Should 16.1 orchestrate meetings as a Claude Code _agent team_ (one lead session spawning
teammates natively) instead of CrewHub's round-robin over N managed sessions?

## What the spike did (claude 2.1.173, local CLI)

1. **Help surface:** `claude --help` exposes no `teams` subcommand; the feature is gated behind
   `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (env var present in the binary, confirmed working).
   In-session tools: `TeamCreate`, `TeamDelete`, `SendMessage`, plus `Agent` with
   `team_name`/`name` params to spawn teammates.
2. **Two live runs** in sandbox projects (`/tmp/teams-spike`, `/tmp/teams-fixture`), headless
   (`claude -p`), **all haiku**, one teammate ("echoer") sending one message back. Both completed
   end-to-end in under two minutes for pennies. Transcript layouts captured as fixtures in
   `src-tauri/fixtures/teams/` (sanitized).

## Recorded format (pinned by fixtures — the lasting deliverable for 18.1)

| Artifact            | Location / shape                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team config         | `~/.claude/teams/{team-name}/config.json` — `{name, description, createdAt, leadAgentId: "team-lead@<team>", leadSessionId, members[]}`; members carry `agentId: "<name>@<team>"`, `name`, `model`, `cwd`, `backendType: "in-process"` |
| Teammate transcript | `<project>/<leadSessionId>/subagents/agent-<id>.jsonl` — **the existing M1 subagent layout**; lines have `isSidechain: true` + `agentId`                                                                                               |
| Teammate meta       | `agent-<id>.meta.json` sibling: teammates = `{"agentType":"<teammate name>"}` (no `toolUseId`); Task-tool subagents = `{"agentType":…, "toolUseId":"toolu_…", …}`                                                                      |
| Message marker      | teammate/lead user turns wrapped in `<teammate-message teammate_id="…" summary="…">…</teammate-message>`                                                                                                                               |
| Lead markers        | `TeamCreate` tool_use with `input.team_name`; tool_result text JSON `{"team_name", "team_file_path", "lead_agent_id"}`                                                                                                                 |

**Caveat:** `~/.claude/teams/<name>/config.json` is **transient** — it vanished when the headless
lead exited (and on `TeamDelete`). Only transcripts + `meta.json` are durable. Team detection must
therefore be transcript-first, config-second, and tolerate both being absent.

## Scoring teams against the four meeting-engine requirements

| Requirement                                              | Verdict | Why                                                                                                                                                                      |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-turn control (timeout / retry / serialization)       | ❌      | The lead orchestrates autonomously via mailboxes; CrewHub gets no hook between turns, no way to time out or retry one participant, no turn ordering guarantee            |
| Model-per-turn policy (haiku rounds, upgraded synthesis) | ◐       | Teammate model is settable at spawn, but the lead's model is fixed for the whole run and there is no per-step upgrade point for synthesis                                |
| Restart recovery                                         | ❌      | Team state is deleted when the lead exits; a mid-meeting app kill leaves no persisted resumable position — exactly the v1 orphaned-meeting failure mode                  |
| Deterministic output capture                             | ◐       | Turn attribution exists (subagent files) but the final output is the lead's free text; rounds/structure are not recoverable without re-parsing free-form mailbox traffic |

Pre-registered expectation **confirmed**: teams optimize for _task delegation_, not _structured
discussion_. They fail (a) and (c) outright.

## Decision

1. **16.1 builds CrewHub round-robin over dedicated managed sessions** (D-M4-2/D-M4-3),
   exactly as planned. Teams appear in M4 only as visualization (Epic 18).
2. **18.1 ships fixture-pinned team detection** (the fixtures above) wrapped in the
   parse-tolerant discipline: markers absent / shapes unknown ⇒ `team = None`, never an error.
   Detection keys, in priority order: (a) sibling `agent-*.meta.json` without `toolUseId` +
   `<teammate-message` marker in the child transcript ⇒ teammate; (b) `~/.claude/teams/*/config.json`
   with matching `leadSessionId` ⇒ lead + team name (live teams only, best-effort).
3. Meetings-as-teams is **not** revisited unless dogfooding demands it (master plan Appendix B).

## Consequences

- The meeting engine owns turn order, timeouts, retries, model policy and persistence — all
  testable against fake-claude with zero API cost.
- Team visualization lights up for real CC teams (including externally started ones) because
  teammates ride the already-shipped subagent discovery; `TeamInfo` is additive on `SessionMeta`.
- The experimental env var is never set by CrewHub; we only _read_ what teams leave on disk.
