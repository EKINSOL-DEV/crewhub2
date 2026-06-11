//! crewhub-signal — hook → CrewHub bridge (bundled as a Tauri sidecar).
//!
//! Invoked by agent-runtime hooks (Claude Code `~/.claude/settings.json`).
//! Reads the hook payload (one JSON object) from stdin and forwards a single
//! line to the CrewHub unix socket:
//!
//! ```json
//! {"event":"<hook_event_name>","session_id":"...","payload":{...original json...}}
//! ```
//!
//! Socket path: `$CREWHUB_SIGNAL_SOCKET`, default
//! `~/Library/Application Support/CrewHub/signal.sock`.
//!
//! Contract: total budget <50ms and **always exit 0** — a session must never
//! hang or fail because CrewHub is down. Any error (no socket, malformed
//! stdin, write timeout) is swallowed silently.

use std::io::Read;
use std::time::Duration;

/// Per-operation socket timeout; keeps the worst case well under the 50ms budget.
const SOCKET_TIMEOUT: Duration = Duration::from_millis(40);

fn main() {
    // Never propagate failures: hooks must not block or fail the session.
    let _ = run();
}

fn run() -> Option<()> {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&input).ok()?;
    let event = payload
        .get("hook_event_name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown");
    let session_id = payload
        .get("session_id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let line = serde_json::json!({
        "event": event,
        "session_id": session_id,
        "payload": payload,
    });
    send(&format!("{line}\n"))
}

#[cfg(unix)]
fn send(line: &str) -> Option<()> {
    use std::io::Write;
    use std::os::unix::net::UnixStream;
    let mut stream = UnixStream::connect(socket_path()?).ok()?;
    stream.set_write_timeout(Some(SOCKET_TIMEOUT)).ok()?;
    stream.write_all(line.as_bytes()).ok()?;
    Some(())
}

/// Windows named-pipe transport is an M6 follow-up; until then this is a no-op.
#[cfg(not(unix))]
fn send(_line: &str) -> Option<()> {
    None
}

#[cfg(unix)]
fn socket_path() -> Option<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("CREWHUB_SIGNAL_SOCKET") {
        return Some(path.into());
    }
    let home = std::env::var_os("HOME")?;
    Some(std::path::Path::new(&home).join("Library/Application Support/CrewHub/signal.sock"))
}
