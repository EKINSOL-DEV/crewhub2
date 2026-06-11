//! CrewHub MCP server (master plan §4.2 D4, §5; M1 Epic 8).
//!
//! The loopback surface that makes agents first-class CrewHub users: a
//! streamable-HTTP MCP server on `127.0.0.1:<random port>` guarded by a
//! per-launch bearer token held only in memory. This is the single listening
//! socket in the whole app; it exposes only the whitelisted CrewHub tools —
//! never shell, filesystem, or IPC passthrough.

pub mod server;
pub mod tools;
