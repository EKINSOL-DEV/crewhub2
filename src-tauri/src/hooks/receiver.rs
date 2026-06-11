//! UDS receiver for `crewhub-signal` lines — the low-latency signal path.
//!
//! Listens on a unix socket; each line is `{"event":"<hook_event_name>",
//! "session_id":"...","payload":{...}}` as written by the `crewhub-signal`
//! helper. Wire event names are runtime-specific (see module docs in
//! [`crate::hooks`]); they are mapped here to the provider-neutral
//! [`HookSignal`] names and emitted as [`SessionEvent::Signal`].
//!
//! `pre-tool` signals for file-mutating tools also feed the
//! [`ConflictDetector`] (T19), emitting [`SessionEvent::Conflict`] on overlap.
//!
//! Malformed lines are skipped — the stream never crashes on bad input.

use super::conflicts::ConflictDetector;
use crate::engine::types::{HookSignal, SessionEvent, SessionId};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
#[cfg(unix)]
use tokio::net::UnixListener;
use tokio::sync::broadcast;

/// Builds the SessionStart `additionalContext` envelope for a cwd, when the
/// cwd belongs to a registered project (T18). `None` = no injection.
pub type ContextProvider = Arc<dyn Fn(&str) -> Option<String> + Send + Sync>;

#[derive(Debug, Clone)]
pub struct ReceiverConfig {
    pub socket_path: PathBuf,
    /// Provider tag stamped on emitted [`SessionId`]s. Defaults to the Claude
    /// Code provider — the only hook source in M1.
    pub provider: String,
    /// Conflict-detection window; see [`super::conflicts`].
    pub conflict_window_ms: i64,
}

impl Default for ReceiverConfig {
    fn default() -> Self {
        Self {
            socket_path: PathBuf::new(),
            provider: crate::engine::claude::PROVIDER_ID.into(),
            conflict_window_ms: super::conflicts::DEFAULT_WINDOW_MS,
        }
    }
}

/// Wire hook event → provider-neutral signal name. Unknown events pass
/// through unchanged so future hook types are forwarded, not dropped.
fn map_event(wire: &str) -> &str {
    match wire {
        "SessionStart" => "session-start",
        "PreToolUse" => "pre-tool",
        "PostToolUse" => "post-tool",
        "Stop" => "stop",
        "SubagentStop" => "subagent-stop",
        "Notification" => "notification",
        other => other,
    }
}

/// Tools whose `pre-tool` signals count as file touches for conflict detection.
const MUTATING_TOOLS: &[&str] = &["Edit", "Write", "MultiEdit"];

pub struct HookReceiver {
    socket_path: PathBuf,
    accept_task: tokio::task::JoinHandle<()>,
}

impl Drop for HookReceiver {
    fn drop(&mut self) {
        self.accept_task.abort();
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

impl HookReceiver {
    /// Binds the socket and spawns the accept loop; signals flow into `tx`.
    /// Must be called within a tokio runtime. A stale socket file from a
    /// previous run is replaced.
    pub fn start(
        config: ReceiverConfig,
        tx: broadcast::Sender<SessionEvent>,
    ) -> anyhow::Result<Self> {
        Self::start_with_context(config, tx, None)
    }

    /// Like [`Self::start`], but SessionStart lines get a one-line JSON-string
    /// reply with the context envelope (consumed by `crewhub-signal`).
    /// Windows: the UDS transport is an M6 follow-up (named pipes); hooks run
    /// in degraded mode (watcher-only) there. Mirrors crewhub-signal's no-op.
    #[cfg(not(unix))]
    pub fn start_with_context(
        _config: ReceiverConfig,
        _tx: broadcast::Sender<SessionEvent>,
        _context: Option<ContextProvider>,
    ) -> anyhow::Result<Self> {
        anyhow::bail!("hook signal transport is not supported on this platform yet")
    }

    #[cfg(unix)]
    pub fn start_with_context(
        config: ReceiverConfig,
        tx: broadcast::Sender<SessionEvent>,
        context: Option<ContextProvider>,
    ) -> anyhow::Result<Self> {
        if let Some(parent) = config.socket_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let _ = std::fs::remove_file(&config.socket_path);
        let listener = UnixListener::bind(&config.socket_path)?;
        let socket_path = config.socket_path.clone();
        let provider = config.provider;
        let conflicts = Arc::new(Mutex::new(ConflictDetector::new(config.conflict_window_ms)));

        let accept_task = tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let tx = tx.clone();
                let provider = provider.clone();
                let conflicts = conflicts.clone();
                let context = context.clone();
                tokio::spawn(async move {
                    let (read, mut write) = stream.into_split();
                    let mut lines = tokio::io::BufReader::new(read).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        if let Some(reply) =
                            handle_line(&provider, &line, &tx, &conflicts, context.as_ref())
                        {
                            let _ = write
                                .write_all(
                                    format!("{}\n", serde_json::Value::String(reply)).as_bytes(),
                                )
                                .await;
                            let _ = write.flush().await;
                        }
                    }
                });
            }
        });

        Ok(Self {
            socket_path,
            accept_task,
        })
    }
}

fn handle_line(
    provider: &str,
    line: &str,
    tx: &broadcast::Sender<SessionEvent>,
    conflicts: &Mutex<ConflictDetector>,
    context: Option<&ContextProvider>,
) -> Option<String> {
    // malformed lines: skip, keep the stream alive
    let value = serde_json::from_str::<serde_json::Value>(line).ok()?;
    let wire_event = value.get("event").and_then(serde_json::Value::as_str)?;
    let session_id = value
        .get("session_id")
        .and_then(serde_json::Value::as_str)?;
    let event = map_event(wire_event);
    let payload = value.get("payload");
    let (tool, path) = if event == "pre-tool" {
        let tool = payload
            .and_then(|p| p.get("tool_name"))
            .and_then(serde_json::Value::as_str);
        let path = payload
            .and_then(|p| p.get("tool_input"))
            .and_then(|i| i.get("file_path"))
            .and_then(serde_json::Value::as_str);
        (tool.map(str::to_string), path.map(str::to_string))
    } else {
        (None, None)
    };

    let id = SessionId {
        provider: provider.to_string(),
        id: session_id.to_string(),
    };
    let now = crate::store::Store::now_ms();
    let signal = HookSignal {
        event: event.to_string(),
        tool: tool.clone(),
        path: path.clone(),
        payload_json: payload.map(ToString::to_string),
        ts: now,
    };
    let _ = tx.send(SessionEvent::Signal {
        id: id.clone(),
        signal,
    });

    if let (Some(tool), Some(path)) = (tool, path) {
        if MUTATING_TOOLS.contains(&tool.as_str()) {
            let conflict = conflicts.lock().unwrap().record(&path, id, now);
            if let Some(event) = conflict {
                let _ = tx.send(event);
            }
        }
    }

    // T18: SessionStart with a registered-project cwd gets a context reply.
    if event == "session-start" {
        if let Some(provider) = context {
            let cwd = payload
                .and_then(|p| p.get("cwd"))
                .and_then(serde_json::Value::as_str)?;
            return provider(cwd);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::io::AsyncWriteExt;
    use tokio::net::UnixStream;

    fn test_socket(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("chr-{name}-{}.sock", std::process::id()))
    }

    fn test_config(socket: &std::path::Path) -> ReceiverConfig {
        ReceiverConfig {
            socket_path: socket.to_path_buf(),
            ..Default::default()
        }
    }

    async fn next_event(rx: &mut broadcast::Receiver<SessionEvent>) -> SessionEvent {
        tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timeout")
            .expect("recv")
    }

    fn next_signal(event: SessionEvent) -> (SessionId, HookSignal) {
        match event {
            SessionEvent::Signal { id, signal } => (id, signal),
            other => panic!("expected Signal, got {other:?}"),
        }
    }

    /// Recorded-shape line as `crewhub-signal` would emit it.
    fn wire_line(event: &str, session: &str, payload_extra: &str) -> String {
        format!(
            concat!(
                r#"{{"event":"{event}","session_id":"{session}","payload":"#,
                r#"{{"hook_event_name":"{event}","session_id":"{session}","#,
                r#""transcript_path":"/tmp/t.jsonl","cwd":"/tmp/proj"{extra}}}}}"#,
                "\n"
            ),
            event = event,
            session = session,
            extra = payload_extra,
        )
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn maps_all_hook_events_to_neutral_signals() {
        let socket = test_socket("map");
        let (tx, mut rx) = broadcast::channel(64);
        let _receiver = HookReceiver::start(test_config(&socket), tx).unwrap();

        let mut stream = UnixStream::connect(&socket).await.unwrap();
        let cases = [
            ("SessionStart", "session-start"),
            ("PostToolUse", "post-tool"),
            ("Stop", "stop"),
            ("SubagentStop", "subagent-stop"),
            ("Notification", "notification"),
        ];
        for (wire, _) in &cases {
            stream
                .write_all(wire_line(wire, "sess-1", "").as_bytes())
                .await
                .unwrap();
        }
        for (wire, neutral) in &cases {
            let (id, signal) = next_signal(next_event(&mut rx).await);
            assert_eq!(id.provider, "claude-code");
            assert_eq!(id.id, "sess-1");
            assert_eq!(signal.event, *neutral);
            assert!(signal.tool.is_none());
            let payload: serde_json::Value =
                serde_json::from_str(signal.payload_json.as_deref().unwrap()).unwrap();
            assert_eq!(payload["hook_event_name"], *wire);
            assert_eq!(payload["cwd"], "/tmp/proj");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pre_tool_extracts_tool_and_path() {
        let socket = test_socket("pretool");
        let (tx, mut rx) = broadcast::channel(64);
        let _receiver = HookReceiver::start(test_config(&socket), tx).unwrap();

        let mut stream = UnixStream::connect(&socket).await.unwrap();
        stream
            .write_all(
                wire_line(
                    "PreToolUse",
                    "sess-1",
                    r#","tool_name":"Edit","tool_input":{"file_path":"/tmp/proj/src/a.rs"}"#,
                )
                .as_bytes(),
            )
            .await
            .unwrap();

        let (_, signal) = next_signal(next_event(&mut rx).await);
        assert_eq!(signal.event, "pre-tool");
        assert_eq!(signal.tool.as_deref(), Some("Edit"));
        assert_eq!(signal.path.as_deref(), Some("/tmp/proj/src/a.rs"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn malformed_line_is_skipped_and_stream_survives() {
        let socket = test_socket("garbage");
        let (tx, mut rx) = broadcast::channel(64);
        let _receiver = HookReceiver::start(test_config(&socket), tx).unwrap();

        let mut stream = UnixStream::connect(&socket).await.unwrap();
        stream.write_all(b"not json at all\n").await.unwrap();
        stream
            .write_all(b"{\"event\":\"Stop\"}\n") // missing session_id: skipped
            .await
            .unwrap();
        stream
            .write_all(wire_line("Stop", "sess-2", "").as_bytes())
            .await
            .unwrap();

        let (id, signal) = next_signal(next_event(&mut rx).await);
        assert_eq!(signal.event, "stop");
        assert_eq!(id.id, "sess-2");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn session_start_in_exact_helper_output_shape() {
        // The helper binary's own integration tests (crates/crewhub-signal)
        // spawn the real binary via CARGO_BIN_EXE; here we replay its exact
        // output shape, built with the same serialization it uses.
        let socket = test_socket("e2e");
        let (tx, mut rx) = broadcast::channel(64);
        let _receiver = HookReceiver::start(test_config(&socket), tx).unwrap();

        let payload: serde_json::Value = serde_json::from_str(concat!(
            r#"{"hook_event_name":"SessionStart","session_id":"e2e-1","#,
            r#""transcript_path":"/tmp/t.jsonl","cwd":"/tmp/proj","source":"startup"}"#
        ))
        .unwrap();
        let line = serde_json::json!({
            "event": payload["hook_event_name"],
            "session_id": payload["session_id"],
            "payload": payload,
        });
        let mut stream = UnixStream::connect(&socket).await.unwrap();
        stream
            .write_all(format!("{line}\n").as_bytes())
            .await
            .unwrap();

        let (id, signal) = next_signal(next_event(&mut rx).await);
        assert_eq!(id.id, "e2e-1");
        assert_eq!(signal.event, "session-start");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn two_sessions_editing_same_path_emit_conflict() {
        let socket = test_socket("conflict");
        let (tx, mut rx) = broadcast::channel(64);
        let _receiver = HookReceiver::start(test_config(&socket), tx).unwrap();

        let extra = r#","tool_name":"Write","tool_input":{"file_path":"/tmp/proj/shared.rs"}"#;
        // Separate connections, like two distinct hook invocations. Each
        // connection is served by its own task, so processing order across
        // connections is not guaranteed — await sess-a's Signal before
        // sending sess-b to make first-touch order deterministic.
        let mut stream_a = UnixStream::connect(&socket).await.unwrap();
        stream_a
            .write_all(wire_line("PreToolUse", "sess-a", extra).as_bytes())
            .await
            .unwrap();
        loop {
            if let SessionEvent::Signal { id, .. } = next_event(&mut rx).await {
                assert_eq!(id.id, "sess-a");
                break;
            }
        }
        let mut stream_b = UnixStream::connect(&socket).await.unwrap();
        stream_b
            .write_all(wire_line("PreToolUse", "sess-b", extra).as_bytes())
            .await
            .unwrap();

        let mut conflict = None;
        for _ in 0..3 {
            if let SessionEvent::Conflict { path, sessions } = next_event(&mut rx).await {
                conflict = Some((path, sessions));
                break;
            }
        }
        let (path, sessions) = conflict.expect("no Conflict event seen");
        assert_eq!(path, "/tmp/proj/shared.rs");
        let ids: Vec<&str> = sessions.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["sess-a", "sess-b"]);
    }
}
