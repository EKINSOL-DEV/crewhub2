//! Integration tests spawning the real `crewhub-signal` binary against a test
//! unix socket (same spirit as `src-tauri/tests/fake_claude_playback.rs`).
#![cfg(unix)]

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixListener;
use std::process::{Command, Stdio};
use std::time::Instant;

fn test_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("chs-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run_with_stdin(socket: &std::path::Path, stdin: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_crewhub-signal"))
        .env("CREWHUB_SIGNAL_SOCKET", socket)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn forwards_hook_payload_as_one_line_to_socket() {
    let dir = test_dir("fwd");
    let socket = dir.join("signal.sock");
    let listener = UnixListener::bind(&socket).unwrap();

    let hook_json = concat!(
        r#"{"hook_event_name":"PreToolUse","session_id":"abc-123","#,
        r#""transcript_path":"/tmp/t.jsonl","cwd":"/tmp/proj","#,
        r#""tool_name":"Edit","tool_input":{"file_path":"/tmp/proj/src/x.rs"}}"#
    );
    let writer = std::thread::spawn({
        let socket = socket.clone();
        move || run_with_stdin(&socket, hook_json)
    });

    let (stream, _) = listener.accept().unwrap();
    let mut line = String::new();
    BufReader::new(stream).read_line(&mut line).unwrap();
    let out = writer.join().unwrap();
    assert!(out.status.success(), "must exit 0");

    let value: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(value["event"], "PreToolUse");
    assert_eq!(value["session_id"], "abc-123");
    assert_eq!(value["payload"]["tool_name"], "Edit");
    assert_eq!(
        value["payload"]["tool_input"]["file_path"],
        "/tmp/proj/src/x.rs"
    );
}

#[test]
fn exits_zero_and_fast_when_socket_absent() {
    let dir = test_dir("nosock");
    let started = Instant::now();
    let out = run_with_stdin(
        &dir.join("missing.sock"),
        r#"{"hook_event_name":"Stop","session_id":"abc"}"#,
    );
    let elapsed = started.elapsed();
    assert!(out.status.success(), "must exit 0 even without a socket");
    // Budget is <50ms of own work; allow generous slack for process startup in CI.
    assert!(elapsed.as_millis() < 1_000, "took {elapsed:?}");
}

#[test]
fn exits_zero_on_malformed_stdin() {
    let dir = test_dir("badjson");
    let socket = dir.join("signal.sock");
    let _listener = UnixListener::bind(&socket).unwrap();
    let out = run_with_stdin(&socket, "this is not json");
    assert!(out.status.success(), "must exit 0 on malformed input");
}
