# ADR-0001: Drive the Claude Code CLI via stream-json instead of an Agent SDK sidecar

Date: 2026-06-10 · Status: accepted (re-evaluation checkpoint at M1 exit, Linear EKI-48)

## Decision

CrewHub v2's Rust core spawns and drives the `claude` CLI directly using
`--input-format stream-json --output-format stream-json`, rather than embedding the
TypeScript Claude Agent SDK in a Node sidecar process.

## Rationale

- Zero bundled runtime: no Node sidecar binary to build, sign, and ship per platform.
- The user's existing `claude` install, auth, and version are the single source of truth.
- One fewer process layer to supervise; the control protocol covers streaming output,
  mid-run input, interrupts, and structured permission requests/responses.

## Alternative considered

TypeScript Agent SDK in a sidecar: richer programmatic API (in-process hooks,
`canUseTool` callback), but adds a second runtime to package and drifts from the
user's installed Claude Code version.

## Risk & mitigation

The control protocol may evolve between Claude Code releases. All protocol knowledge
is isolated in `engine/claude/control.rs` and `engine/claude/transcript.rs` (M1),
behind versioned tests with recorded fixtures.

## Checkpoint

At M1 exit (EKI-48): if any required capability (interrupt, permission round-trip,
mid-run input) is not achievable via the CLI control protocol, write a follow-up ADR
and pivot Epic 5 to the Agent SDK sidecar before M2 begins.
