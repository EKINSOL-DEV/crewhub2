//! UDS receiver for `crewhub-signal` lines — the low-latency signal path.
//!
//! Listens on a unix socket; each line is `{"event":"<hook_event_name>",
//! "session_id":"...","payload":{...}}` as written by the `crewhub-signal`
//! helper. Wire event names are runtime-specific (see module docs in
//! [`crate::hooks`]); they are mapped here to the provider-neutral
//! [`HookSignal`] names and emitted as [`SessionEvent::Signal`].
//!
//! Malformed lines are skipped — the stream never crashes on bad input.

use crate::engine::types::{HookSignal, SessionEvent, SessionId};
use std::path::PathBuf;
use tokio::io::AsyncBufReadExt;
use tokio::net::UnixListener;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub struct ReceiverConfig {
    pub socket_path: PathBuf,
    /// Provider tag stamped on emitted [`SessionId`]s. Defaults to the Claude
    /// Code provider — the only hook source in M1.
    pub provider: String,
}

impl Default for ReceiverConfig {
    fn default() -> Self {
        Self {
            socket_path: PathBuf::new(),
            provider: crate::engine::claude::PROVIDER_ID.into(),
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
        if let Some(parent) = config.socket_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let _ = std::fs::remove_file(&config.socket_path);
        let listener = UnixListener::bind(&config.socket_path)?;
        let socket_path = config.socket_path.clone();
        let provider = config.provider;

        let accept_task = tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let tx = tx.clone();
                let provider = provider.clone();
                tokio::spawn(async move {
                    let mut lines = tokio::io::BufReader::new(stream).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        handle_line(&provider, &line, &tx);
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

fn handle_line(provider: &str, line: &str, tx: &broadcast::Sender<SessionEvent>) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return; // malformed line: skip, keep the stream alive
    };
    let Some(wire_event) = value.get("event").and_then(serde_json::Value::as_str) else {
        return;
    };
    let Some(session_id) = value.get("session_id").and_then(serde_json::Value::as_str) else {
        return;
    };
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

    let signal = HookSignal {
        event: event.to_string(),
        tool,
        path,
        payload_json: payload.map(ToString::to_string),
        ts: crate::store::Store::now_ms(),
    };
    let _ = tx.send(SessionEvent::Signal {
        id: SessionId {
            provider: provider.to_string(),
            id: session_id.to_string(),
        },
        signal,
    });
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
}
