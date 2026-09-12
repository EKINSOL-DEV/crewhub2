# Shared application contract

Small TypeScript types for the browser/bridge boundary. The current draft contains
`SessionSummary` and `SessionSnapshot`, used only by the mock fixture.

This is CrewHub's application model, not Herdr's socket schema. It contains no
rendering, transport, authentication, process, or provider implementation.

Before live integration, add runtime validation, generated or equivalent Rust
types, version negotiation, identity mapping, and snapshot/event reconciliation
with focused contract tests. A TypeScript type alone does not validate network
input. See [architecture](../../docs/ARCHITECTURE.md).
