//! Claude Code provider — the ONLY module allowed to know Claude Code specifics
//! (transcript JSONL format, CLI flags, control protocol, hooks). See `engine/mod.rs`.
pub mod transcript;

pub const PROVIDER_ID: &str = "claude-code";
