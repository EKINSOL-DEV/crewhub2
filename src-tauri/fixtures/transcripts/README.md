# Transcript fixtures

Sanitized real Claude Code transcripts (structure intact, all content masked to `x`-strings,
paths replaced). Generated with `scripts/collect-fixture.py`. **Never commit unsanitized transcripts.**

| File                        | Source CC version | Exercises                                                                                    |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| rich-tooluse-cc2.1.jsonl    | 2.1.x             | heavy tool_use/tool_result, file-history snapshots, queue ops                                |
| thinking-images-cc2.1.jsonl | 2.1.x             | thinking blocks + image content                                                              |
| small-session-cc2.1.jsonl   | 2.1.x             | minimal fresh session                                                                        |
| subagent-parent-cc2.1.jsonl | 2.1.x             | parent session (first 300 lines) of a session with subagents                                 |
| subagent-child-cc2.1.jsonl  | 2.1.x             | subagent transcript (`<session>/subagents/agent-<id>.jsonl`, `isSidechain: true`, `agentId`) |

Parser contract proven against these: zero panics, zero `Unknown` items.
When a new CC version changes the format, add a fixture here — do not edit existing ones.
