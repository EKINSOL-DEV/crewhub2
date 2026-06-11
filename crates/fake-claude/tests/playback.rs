use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn plays_scenario_emitting_expecting_and_writing_transcript() {
    let dir = std::env::temp_dir().join(format!("fake-claude-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let scenario = dir.join("scenario.jsonl");
    let transcript = dir.join("transcript.jsonl");
    std::fs::write(
        &scenario,
        concat!(
            r#"{"expect_arg":"--output-format"}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init"}}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"hello"}}"#,
            "\n",
            r#"{"emit":{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}}"#,
            "\n",
            r#"{"write_transcript":{"type":"user","message":{"content":"hello"}}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    )
    .unwrap();

    let mut child = Command::new(env!("CARGO_BIN_EXE_fake-claude"))
        .arg("--output-format")
        .arg("stream-json")
        .env("FAKE_CLAUDE_SCENARIO", &scenario)
        .env("FAKE_CLAUDE_TRANSCRIPT", &transcript)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"{\"type\":\"user\",\"text\":\"hello\"}\n")
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    let stdout = String::from_utf8_lossy(&out.stdout);
    let lines: Vec<&str> = stdout.lines().collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].contains("init"));
    assert!(lines[1].contains("assistant"));
    assert!(std::fs::read_to_string(&transcript)
        .unwrap()
        .contains("hello"));
}
