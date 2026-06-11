//! Managed Claude Code child processes (bidirectional stream-json).
//!
//! Conversation items reach the UI via the transcript watcher (single read path);
//! this module owns the WRITE path: spawning, stdin, permissions, interrupt, kill.

use super::control::{self, CliEvent};
use super::PROVIDER_ID;
use crate::engine::types::*;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, mpsc};

pub struct ProcessManager {
    cli_path: PathBuf,
    extra_env: Vec<(String, String)>,
    tx: broadcast::Sender<SessionEvent>,
    inner: Arc<Mutex<HashMap<String, Handle>>>,
}

struct Handle {
    stdin_tx: mpsc::UnboundedSender<String>,
    kill_tx: tokio::sync::watch::Sender<bool>,
    /// request_id -> original tool input (echoed back on allow)
    pending_permissions: HashMap<String, String>,
    project_path: String,
}

impl ProcessManager {
    pub fn new(
        cli_path: PathBuf,
        extra_env: Vec<(String, String)>,
        tx: broadcast::Sender<SessionEvent>,
    ) -> Self {
        Self {
            cli_path,
            extra_env,
            tx,
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn permission_mode_flag(mode: PermissionMode) -> &'static str {
        match mode {
            PermissionMode::Default => "default",
            PermissionMode::AcceptEdits => "acceptEdits",
            PermissionMode::Plan => "plan",
            PermissionMode::BypassPermissions => "bypassPermissions",
        }
    }

    pub fn spawn(&self, spec: SpawnSpec) -> anyhow::Result<SessionId> {
        let session_uuid = match (&spec.resume_session, spec.fork) {
            (Some(_), false) => spec.resume_session.clone().unwrap(),
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let mut cmd = tokio::process::Command::new(&self.cli_path);
        cmd.arg("--print")
            .arg("--verbose")
            .args(["--input-format", "stream-json"])
            .args(["--output-format", "stream-json"])
            .args(["--permission-prompt-tool", "stdio"])
            .args([
                "--permission-mode",
                Self::permission_mode_flag(spec.permission_mode),
            ]);
        match (&spec.resume_session, spec.fork) {
            (Some(resume), true) => {
                cmd.args(["--resume", resume])
                    .args(["--session-id", &session_uuid]);
            }
            (Some(resume), false) => {
                cmd.args(["--resume", resume]);
            }
            (None, _) => {
                cmd.args(["--session-id", &session_uuid]);
            }
        }
        if let Some(model) = &spec.model {
            cmd.args(["--model", model]);
        }
        if let Some(sys) = &spec.append_system_prompt {
            cmd.args(["--append-system-prompt", sys]);
        }
        for (k, v) in &self.extra_env {
            cmd.env(k, v);
        }
        cmd.current_dir(&spec.project_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);

        let mut child = cmd.spawn()?;
        let mut stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");

        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<String>();
        let (kill_tx, mut kill_rx) = tokio::sync::watch::channel(false);

        let _ = stdin_tx.send(control::initialize_line("crewhub-init"));
        if let Some(prompt) = &spec.prompt {
            let _ = stdin_tx.send(control::user_message_line(prompt));
        }

        let id = SessionId {
            provider: PROVIDER_ID.into(),
            id: session_uuid.clone(),
        };
        {
            let mut inner = self.inner.lock().unwrap();
            inner.insert(
                session_uuid.clone(),
                Handle {
                    stdin_tx,
                    kill_tx,
                    pending_permissions: HashMap::new(),
                    project_path: spec.project_path.clone(),
                },
            );
        }
        let _ = self.tx.send(SessionEvent::Discovered {
            meta: SessionMeta {
                id: id.clone(),
                origin: SessionOrigin::Managed,
                project_path: spec.project_path.clone(),
                model: spec.model.clone(),
                status: SessionStatus::Working,
                activity_detail: Some("Starting…".into()),
                parent: None,
                usage: UsageTotals::default(),
                git_branch: None,
                last_activity_ms: crate::store::Store::now_ms(),
            },
        });

        // stdin pump
        tokio::spawn(async move {
            while let Some(line) = stdin_rx.recv().await {
                if stdin.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if stdin.write_all(b"\n").await.is_err() {
                    break;
                }
                let _ = stdin.flush().await;
            }
        });

        // stdout reader + supervision
        let tx = self.tx.clone();
        let inner = self.inner.clone();
        let reader_id = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                tokio::select! {
                    _ = kill_rx.changed() => {
                        let _ = child.start_kill();
                        break;
                    }
                    line = lines.next_line() => {
                        match line {
                            Ok(Some(line)) => {
                                Self::handle_line(&tx, &inner, &reader_id, &line);
                            }
                            _ => break, // EOF or error -> process gone
                        }
                    }
                }
            }
            let _ = child.wait().await;
            inner.lock().unwrap().remove(&reader_id.id);
            let _ = tx.send(SessionEvent::Updated {
                meta: SessionMeta {
                    id: reader_id.clone(),
                    origin: SessionOrigin::Managed,
                    project_path: String::new(),
                    model: None,
                    status: SessionStatus::Ended,
                    activity_detail: None,
                    parent: None,
                    usage: UsageTotals::default(),
                    git_branch: None,
                    last_activity_ms: crate::store::Store::now_ms(),
                },
            });
        });

        Ok(id)
    }

    fn handle_line(
        tx: &broadcast::Sender<SessionEvent>,
        inner: &Arc<Mutex<HashMap<String, Handle>>>,
        id: &SessionId,
        line: &str,
    ) {
        match control::parse_cli_line(line) {
            Some(CliEvent::Permission(request)) => {
                if let Some(handle) = inner.lock().unwrap().get_mut(&id.id) {
                    handle
                        .pending_permissions
                        .insert(request.request_id.clone(), request.input_json.clone());
                }
                let _ = tx.send(SessionEvent::PermissionRequest {
                    id: id.clone(),
                    request,
                });
            }
            Some(CliEvent::TurnResult { is_error, summary }) => {
                let _ = tx.send(SessionEvent::Signal {
                    id: id.clone(),
                    signal: HookSignal {
                        event: if is_error {
                            "turn-error".into()
                        } else {
                            "turn-complete".into()
                        },
                        tool: None,
                        path: None,
                        payload_json: Some(serde_json::json!({ "summary": summary }).to_string()),
                        ts: crate::store::Store::now_ms(),
                    },
                });
            }
            _ => {}
        }
    }

    pub fn send(&self, id: &SessionId, input: &UserInput) -> anyhow::Result<()> {
        let inner = self.inner.lock().unwrap();
        let handle = inner
            .get(&id.id)
            .ok_or_else(|| anyhow::anyhow!("no managed session {}", id.id))?;
        handle
            .stdin_tx
            .send(control::user_message_line(&input.text))?;
        Ok(())
    }

    pub fn respond_permission(
        &self,
        id: &SessionId,
        request_id: &str,
        resp: &PermissionResponse,
    ) -> anyhow::Result<()> {
        let mut inner = self.inner.lock().unwrap();
        let handle = inner
            .get_mut(&id.id)
            .ok_or_else(|| anyhow::anyhow!("no managed session {}", id.id))?;
        let original = handle
            .pending_permissions
            .remove(request_id)
            .ok_or_else(|| anyhow::anyhow!("no pending permission {request_id}"))?;
        handle.stdin_tx.send(control::permission_response_line(
            request_id, resp, &original,
        ))?;
        Ok(())
    }

    pub fn interrupt(&self, id: &SessionId) -> anyhow::Result<()> {
        let inner = self.inner.lock().unwrap();
        let handle = inner
            .get(&id.id)
            .ok_or_else(|| anyhow::anyhow!("no managed session {}", id.id))?;
        handle
            .stdin_tx
            .send(control::interrupt_line(&uuid::Uuid::new_v4().to_string()))?;
        Ok(())
    }

    pub fn kill(&self, id: &SessionId) -> anyhow::Result<()> {
        let inner = self.inner.lock().unwrap();
        let handle = inner
            .get(&id.id)
            .ok_or_else(|| anyhow::anyhow!("no managed session {}", id.id))?;
        let _ = handle.kill_tx.send(true);
        Ok(())
    }

    pub fn is_managed(&self, id: &SessionId) -> bool {
        self.inner.lock().unwrap().contains_key(&id.id)
    }

    pub fn managed_project(&self, id: &SessionId) -> Option<String> {
        self.inner
            .lock()
            .unwrap()
            .get(&id.id)
            .map(|h| h.project_path.clone())
    }
}
