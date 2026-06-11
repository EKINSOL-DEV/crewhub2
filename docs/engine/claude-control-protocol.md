# Claude Code stream-json control protocol — verified findings

Pinned against **Claude Code 2.1.172** (2026-06-11) by live spike (M1 plan, Task 9 step 1).
Recordings: `src-tauri/fixtures/control/*.jsonl` (`{"dir":"in|out","msg":{...}}` per line).

## Invocation for managed sessions

```
claude --print --verbose \
  --input-format stream-json --output-format stream-json \
  [--include-partial-messages] \
  --permission-mode default \
  --permission-prompt-tool stdio \
  [--session-id <uuid>] [--resume <id>] [--model <m>] [--append-system-prompt <s>]
```

- `--verbose` is **required** with `--output-format stream-json` in print mode (CLI errors otherwise).
- `--permission-prompt-tool stdio` is **not listed in `--help`** but is the switch that routes
  permission prompts over the control protocol. Without it, non-allowlisted tool calls are
  silently denied (`tool_result` with `is_error: true`, "you haven't granted it yet").
- Safe commands (e.g. `Bash echo`) auto-allow in default mode without any prompt.

## Output message types (stdout, one JSON per line)

| type                 | subtype/notes                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `system`             | `init` (session_id, cwd, tools[], model…), `status`, `thinking_tokens` (delta counter), `hook_started`/`hook_response` (user hooks fire inside managed sessions!) |
| `stream_event`       | raw API deltas when `--include-partial-messages`: `message_start`, `content_block_start/delta/stop`, `message_delta`, `message_stop`                              |
| `assistant` / `user` | complete messages (same content-block shapes as transcripts)                                                                                                      |
| `control_request`    | `request_id` + `request.subtype = can_use_tool` (`tool_name`, `display_name`, `input`, `description`, `permission_suggestions[]`)                                 |
| `control_response`   | replies to OUR control_requests (e.g. initialize → includes available commands list)                                                                              |
| `rate_limit_event`   | quota telemetry                                                                                                                                                   |
| `result`             | `subtype: success                                                                                                                                                 | error…`, `session_id`, `total_cost_usd`, `usage`, `num_turns`, `result` text |

## Input messages (stdin)

- User turn: `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"…"}]}}`
- Initialize (recommended first message): `{"type":"control_request","request_id":"…","request":{"subtype":"initialize","hooks":{}}}`
- Permission reply:
  `{"type":"control_response","response":{"subtype":"success","request_id":"<their id>","response":{"behavior":"allow","updatedInput":{…}}}}`
  (deny: `{"behavior":"deny","message":"…"}`)
- Other request subtypes present in the binary (not yet spiked): `interrupt`,
  `set_permission_mode`, `set_model`, `hook_callback`, `mcp_message`, `rewind`,
  plus `control_cancel_request`.

## D1 checkpoint (ADR-0001) — verdict

Permission round-trip ✅ (proven end-to-end: file only written after our allow).
Mid-run input ✅ (stream-json stdin). Interrupt: subtype exists in binary; live spike lands with T11.
**No SDK-sidecar pivot needed.**

## Gotchas for the engine

- The user's global `~/.claude/settings.json` hooks run inside OUR managed sessions
  (SessionStart fired here). Expected, but transcript/status code must tolerate hook noise.
- `permission_suggestions` (e.g. `setMode: acceptEdits`) should surface in the UI later (M2).
