//! Managed-session lifecycle against the fake-claude scenario binary (T9).

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::SessionProvider;
use crewhub2_lib::engine::types::*;
use std::time::Duration;

fn write_scenario(dir: &std::path::Path, body: &str) -> std::path::PathBuf {
    let path = dir.join("scenario.jsonl");
    std::fs::write(&path, body).unwrap();
    path
}

async fn wait_for<F: Fn(&SessionEvent) -> bool>(
    rx: &mut tokio::sync::broadcast::Receiver<SessionEvent>,
    what: &str,
    pred: F,
) -> SessionEvent {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let ev = tokio::time::timeout(remaining, rx.recv())
            .await
            .unwrap_or_else(|_| panic!("timeout waiting for {what}"))
            .expect("event stream closed");
        if pred(&ev) {
            return ev;
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn spawn_permission_roundtrip_and_exit() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_arg":"--permission-prompt-tool"}"#,
            "\n",
            r#"{"expect_arg":"--session-id"}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init","session_id":"fake-1"}}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"do-the-task"}}"#,
            "\n",
            r#"{"emit":{"type":"control_request","request_id":"perm-1","request":{"subtype":"can_use_tool","tool_name":"Write","input":{"file_path":"/tmp/x"},"permission_suggestions":[]}}}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"allow"}}"#,
            "\n",
            r#"{"emit":{"type":"result","subtype":"success","is_error":false,"result":"done"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );

    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        extra_env: vec![(
            "FAKE_CLAUDE_SCENARIO".into(),
            scenario.display().to_string(),
        )],
    })
    .unwrap();
    let mut rx = provider.subscribe();

    let id = provider
        .spawn(SpawnSpec {
            project_path: project.display().to_string(),
            prompt: Some("do-the-task".into()),
            model: None,
            permission_mode: PermissionMode::Default,
            resume_session: None,
            fork: false,
            append_system_prompt: None,
            agent_id: None,
        })
        .await
        .unwrap();
    assert_eq!(id.provider, "claude-code");

    let ev = wait_for(
        &mut rx,
        "Discovered(Managed)",
        |e| matches!(e, SessionEvent::Discovered { meta } if meta.origin == SessionOrigin::Managed),
    )
    .await;
    let SessionEvent::Discovered { meta } = ev else {
        unreachable!()
    };
    assert_eq!(meta.id, id);

    let ev = wait_for(&mut rx, "PermissionRequest", |e| {
        matches!(e, SessionEvent::PermissionRequest { .. })
    })
    .await;
    let SessionEvent::PermissionRequest { id: pid, request } = ev else {
        unreachable!()
    };
    assert_eq!(pid, id);
    assert_eq!(request.tool, "Write");

    provider
        .respond_permission(&id, &request.request_id, PermissionResponse::AllowOnce)
        .await
        .unwrap();

    wait_for(
        &mut rx,
        "turn-complete signal",
        |e| matches!(e, SessionEvent::Signal { signal, .. } if signal.event == "turn-complete"),
    )
    .await;

    // scenario exits 0 -> supervision reports Ended
    wait_for(
        &mut rx,
        "Ended",
        |e| matches!(e, SessionEvent::Updated { meta } if meta.status == SessionStatus::Ended),
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn kill_terminates_managed_session() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init","session_id":"fake-2"}}"#,
            "\n",
            r#"{"sleep_ms":30000}"#,
            "\n",
        ),
    );
    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        extra_env: vec![(
            "FAKE_CLAUDE_SCENARIO".into(),
            scenario.display().to_string(),
        )],
    })
    .unwrap();
    let mut rx = provider.subscribe();

    let id = provider
        .spawn(SpawnSpec {
            project_path: project.display().to_string(),
            prompt: None,
            model: None,
            permission_mode: PermissionMode::Default,
            resume_session: None,
            fork: false,
            append_system_prompt: None,
            agent_id: None,
        })
        .await
        .unwrap();

    wait_for(&mut rx, "Discovered", |e| {
        matches!(e, SessionEvent::Discovered { .. })
    })
    .await;
    provider.kill(&id).await.unwrap();
    wait_for(
        &mut rx,
        "Ended after kill",
        |e| matches!(e, SessionEvent::Updated { meta } if meta.status == SessionStatus::Ended),
    )
    .await;
}
