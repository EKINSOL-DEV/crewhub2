//! Claude Code provider — the ONLY module allowed to know Claude Code specifics
//! (transcript JSONL format, CLI flags, control protocol, hooks). See `engine/mod.rs`.
pub mod commands;
pub mod control;
pub mod detect;
pub mod headless;
pub mod history;
pub mod lineage;
pub mod persona;
pub mod process;
pub mod registration;
pub mod transcript;
pub mod watcher;

pub const PROVIDER_ID: &str = "claude-code";

/// The project context file the persona block is materialized into (G9).
pub const CONTEXT_FILE: &str = "CLAUDE.md";

use crate::engine::provider::{ProviderCaps, ProviderId, SessionProvider};
use crate::engine::types::*;
use crate::store::Store;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

/// Where Claude Code keeps its data and how to invoke it; injectable for tests.
#[derive(Clone)]
pub struct ClaudeConfig {
    pub root: std::path::PathBuf,
    pub cli_path: std::path::PathBuf,
    /// Managed sessions idle longer than this get ended (still resumable). v1 default: 30 min.
    pub idle_timeout_ms: i64,
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
            idle_timeout_ms: 30 * 60 * 1000,
            extra_env: Vec::new(),
        }
    }
}

impl ClaudeConfig {
    /// Default config, with `cli_path` taken from the persisted
    /// [`detect::CLI_PATH_SETTING`] when present (M6 T2, G2): a detected or
    /// hand-picked non-PATH install survives restarts. Fallback unchanged
    /// (`"claude"` on PATH).
    pub fn from_settings(store: &Store) -> Self {
        let mut config = Self::default();
        if let Ok(Some(path)) = store.get_setting(detect::CLI_PATH_SETTING) {
            if !path.trim().is_empty() {
                config.cli_path = path.into();
            }
        }
        config
    }
}

/// The first [`SessionProvider`]: transcript watcher = read path for every
/// session (managed and terminal-spawned); [`process::ProcessManager`] = write
/// path for managed ones.
pub struct ClaudeCodeProvider {
    config: ClaudeConfig,
    /// History/search keep their FTS index in the app store (M1 T7).
    store: Arc<Store>,
    tx: broadcast::Sender<SessionEvent>,
    processes: process::ProcessManager,
    metas: Arc<Mutex<HashMap<SessionId, SessionMeta>>>,
    _watcher: watcher::TranscriptWatcher,
}

impl ClaudeCodeProvider {
    /// Must be called within a tokio runtime (watcher + cache tasks are spawned).
    pub fn start(config: ClaudeConfig, store: Arc<Store>) -> anyhow::Result<Self> {
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

        let idle_ms = config.idle_timeout_ms;
        let this = Self {
            config,
            store,
            tx,
            processes,
            metas,
            _watcher: watcher,
        };
        // Idle sweep: provider-owned lifecycle policy (T12).
        let sweeper = this.processes.clone_for_sweep();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                let _ = sweeper.sweep_idle(idle_ms);
            }
        });
        Ok(this)
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

    async fn answer_question(&self, id: &SessionId, resp: QuestionResponse) -> anyhow::Result<()> {
        self.processes.answer_question(id, &resp)
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

    async fn list_archived(
        &self,
        project_path: Option<&str>,
    ) -> anyhow::Result<Vec<ArchivedSession>> {
        Ok(history::list_archived_sessions(
            &self.config.root,
            project_path,
        ))
    }

    async fn search_transcripts(&self, query: &str) -> anyhow::Result<Vec<SearchHit>> {
        history::search(&self.store, &self.config.root, query)
    }

    async fn read_transcript(
        &self,
        id: &SessionId,
        offset: u64,
        limit: u32,
    ) -> anyhow::Result<TranscriptPage> {
        history::read_transcript_page(&self.config.root, &id.id, offset, limit)
    }

    async fn exec_headless(
        &self,
        project_dir: &Path,
        prompt: &str,
        model: Option<&str>,
    ) -> anyhow::Result<HeadlessRun> {
        headless::exec_headless(
            &self.config.cli_path,
            &self.config.extra_env,
            project_dir,
            prompt,
            model,
        )
        .await
    }

    async fn register_mcp(&self, project_dir: &Path, port: u16, token: &str) -> anyhow::Result<()> {
        // refresh (remove-then-add) so re-enabling after a token rotation works.
        registration::refresh(&self.mcp_cli_config(), project_dir, port, token).await
    }

    async fn unregister_mcp(&self, project_dir: &Path) -> anyhow::Result<()> {
        registration::unregister(&self.mcp_cli_config(), project_dir).await
    }

    fn set_permission_rules(&self, rules: crate::engine::rules::PermissionRules) {
        self.processes.set_rules(rules);
    }

    async fn list_slash_commands(&self, project_dir: &Path) -> anyhow::Result<Vec<SlashCommand>> {
        Ok(commands::list_slash_commands(
            project_dir,
            self.user_claude_dir().as_deref(),
        ))
    }

    async fn materialize_persona(&self, project_dir: &Path, content: &str) -> anyhow::Result<()> {
        persona::materialize(&project_dir.join(CONTEXT_FILE), content)
    }

    async fn remove_persona(&self, project_dir: &Path) -> anyhow::Result<()> {
        persona::remove(&project_dir.join(CONTEXT_FILE))
    }
}

impl ClaudeCodeProvider {
    /// Test/scheduler access to process-level operations (idle sweep).
    pub fn processes_for_test(&self) -> &process::ProcessManager {
        &self.processes
    }

    fn mcp_cli_config(&self) -> registration::McpCliConfig {
        registration::McpCliConfig {
            cli_path: self.config.cli_path.clone(),
            extra_env: self.config.extra_env.clone(),
        }
    }

    /// The user-level `.claude` directory, derived from the configured
    /// projects root (`<user .claude>/projects`) so tests can inject it.
    fn user_claude_dir(&self) -> Option<std::path::PathBuf> {
        self.config.root.parent().map(Path::to_path_buf)
    }
}
