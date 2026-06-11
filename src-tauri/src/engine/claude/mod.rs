//! Claude Code provider — the ONLY module allowed to know Claude Code specifics
//! (transcript JSONL format, CLI flags, control protocol, hooks). See `engine/mod.rs`.
pub mod control;
pub mod history;
pub mod lineage;
pub mod process;
pub mod transcript;
pub mod watcher;

pub const PROVIDER_ID: &str = "claude-code";

use crate::engine::provider::{ProviderCaps, ProviderId, SessionProvider};
use crate::engine::types::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

/// Where Claude Code keeps its data and how to invoke it; injectable for tests.
#[derive(Clone)]
pub struct ClaudeConfig {
    pub root: std::path::PathBuf,
    pub cli_path: std::path::PathBuf,
    /// Extra env vars for spawned CLI processes (tests use this to feed
    /// fake-claude its scenario without process-global env mutation).
    pub extra_env: Vec<(String, String)>,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            root: home.join(".claude/projects"),
            cli_path: "claude".into(),
            extra_env: Vec::new(),
        }
    }
}

/// The first [`SessionProvider`]: transcript watcher = read path for every
/// session (managed and terminal-spawned); [`process::ProcessManager`] = write
/// path for managed ones.
pub struct ClaudeCodeProvider {
    tx: broadcast::Sender<SessionEvent>,
    processes: process::ProcessManager,
    metas: Arc<Mutex<HashMap<SessionId, SessionMeta>>>,
    _watcher: watcher::TranscriptWatcher,
}

impl ClaudeCodeProvider {
    /// Must be called within a tokio runtime (watcher + cache tasks are spawned).
    pub fn start(config: ClaudeConfig) -> anyhow::Result<Self> {
        let (tx, _) = broadcast::channel(1024);
        let watcher = watcher::TranscriptWatcher::start(
            watcher::WatcherConfig {
                root: config.root.clone(),
                ..Default::default()
            },
            tx.clone(),
        )?;
        let processes = process::ProcessManager::new(
            config.cli_path.clone(),
            config.extra_env.clone(),
            tx.clone(),
        );

        // Meta cache so list_sessions() is cheap and always current.
        let metas: Arc<Mutex<HashMap<SessionId, SessionMeta>>> = Arc::default();
        let cache = metas.clone();
        let mut rx = tx.subscribe();
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(SessionEvent::Discovered { meta }) | Ok(SessionEvent::Updated { meta }) => {
                        cache.lock().unwrap().insert(meta.id.clone(), meta);
                    }
                    Ok(SessionEvent::Removed { id }) => {
                        cache.lock().unwrap().remove(&id);
                    }
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        Ok(Self {
            tx,
            processes,
            metas,
            _watcher: watcher,
        })
    }
}

#[async_trait::async_trait]
impl SessionProvider for ClaudeCodeProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID
    }

    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            spawn: true,
            resume: true,
            fork: true,
            permissions: true,
            interrupt: true,
            thinking: true,
            subagents: true,
            headless_runs: true,
            hooks: true,
            mcp_registration: true,
        }
    }

    async fn list_sessions(&self) -> Vec<SessionMeta> {
        self.metas.lock().unwrap().values().cloned().collect()
    }

    async fn spawn(&self, spec: SpawnSpec) -> anyhow::Result<SessionId> {
        self.processes.spawn(spec)
    }

    async fn send(&self, id: &SessionId, input: UserInput) -> anyhow::Result<()> {
        self.processes.send(id, &input)
    }

    async fn respond_permission(
        &self,
        id: &SessionId,
        request_id: &str,
        resp: PermissionResponse,
    ) -> anyhow::Result<()> {
        self.processes.respond_permission(id, request_id, &resp)
    }

    async fn answer_question(
        &self,
        _id: &SessionId,
        _resp: QuestionResponse,
    ) -> anyhow::Result<()> {
        anyhow::bail!("questions land in M1 T15")
    }

    async fn interrupt(&self, id: &SessionId) -> anyhow::Result<()> {
        self.processes.interrupt(id)
    }

    async fn kill(&self, id: &SessionId) -> anyhow::Result<()> {
        self.processes.kill(id)
    }

    fn subscribe(&self) -> broadcast::Receiver<SessionEvent> {
        self.tx.subscribe()
    }
}
