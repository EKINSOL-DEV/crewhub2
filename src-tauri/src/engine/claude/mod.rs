//! Claude Code provider — the ONLY module allowed to know Claude Code specifics
//! (transcript JSONL format, CLI flags, control protocol, hooks). See `engine/mod.rs`.
pub mod history;
pub mod lineage;
pub mod transcript;
pub mod watcher;

pub const PROVIDER_ID: &str = "claude-code";

/// Where Claude Code keeps its data (`~/.claude`); injectable for tests.
pub struct ClaudeConfig {
    pub root: std::path::PathBuf,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            root: home.join(".claude/projects"),
        }
    }
}
