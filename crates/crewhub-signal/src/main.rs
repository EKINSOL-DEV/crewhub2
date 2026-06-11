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
//!
//! Exception (T18): for `SessionStart` the helper waits up to 300ms for one
//! reply line (a JSON string) and, when present, prints
//! `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":…}}`
//! to stdout so Claude Code injects CrewHub's room/project/task envelope.

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
    let reply = send(&format!("{line}\n"), event == "SessionStart")?;
    if let Some(reply) = reply {
        if let Ok(serde_json::Value::String(context)) = serde_json::from_str(&reply) {
            if !context.is_empty() {
                let out = serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "SessionStart",
                        "additionalContext": context,
                    }
                });
                println!("{out}");
            }
        }
    }
    Some(())
}

/// Reply-wait budget for SessionStart context injection (T18).
const REPLY_TIMEOUT: Duration = Duration::from_millis(300);

#[cfg(unix)]
fn send(line: &str, await_reply: bool) -> Option<Option<String>> {
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    let mut stream = UnixStream::connect(socket_path()?).ok()?;
    stream.set_write_timeout(Some(SOCKET_TIMEOUT)).ok()?;
    stream.write_all(line.as_bytes()).ok()?;
    if !await_reply {
        return Some(None);
    }
    stream.set_read_timeout(Some(REPLY_TIMEOUT)).ok()?;
    let mut reply = String::new();
    let mut reader = BufReader::new(stream);
    match reader.read_line(&mut reply) {
        Ok(n) if n > 0 => Some(Some(reply.trim_end().to_string())),
        _ => Some(None),
    }
}

/// Windows named-pipe transport is an M6 follow-up; until then this is a no-op.
#[cfg(not(unix))]
fn send(_line: &str, _await_reply: bool) -> Option<Option<String>> {
    None
}

/// MUST mirror `hooks::signal_socket_path()` in src-tauri: env override,
/// else the OS data dir + `CrewHub/signal.sock` (the receiver binds there).
#[cfg(unix)]
fn socket_path() -> Option<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("CREWHUB_SIGNAL_SOCKET") {
        return Some(path.into());
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        Some(std::path::Path::new(&home).join("Library/Application Support/CrewHub/signal.sock"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let data_dir = match std::env::var_os("XDG_DATA_HOME") {
            Some(d) if !d.is_empty() => std::path::PathBuf::from(d),
            _ => std::path::Path::new(&std::env::var_os("HOME")?).join(".local/share"),
        };
        Some(data_dir.join("CrewHub/signal.sock"))
    }
}
