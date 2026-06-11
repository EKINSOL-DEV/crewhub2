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
        idle_timeout_ms: 30 * 60 * 1000,
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
        idle_timeout_ms: 30 * 60 * 1000,
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

#[tokio::test(flavor = "multi_thread")]
async fn resume_fork_and_model_flags_reach_the_cli() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_arg":"--resume"}"#,
            "\n",
            r#"{"expect_arg":"old-session-id"}"#,
            "\n",
            r#"{"expect_arg":"--session-id"}"#,
            "\n",
            r#"{"expect_arg":"--model"}"#,
            "\n",
            r#"{"expect_arg":"haiku"}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init","session_id":"forked"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );

    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        idle_timeout_ms: 30 * 60 * 1000,
        extra_env: vec![(
            "FAKE_CLAUDE_SCENARIO".into(),
            scenario.display().to_string(),
        )],
    })
    .unwrap();
    let mut rx = provider.subscribe();

    // fork: --resume old + fresh --session-id; model haiku (cheap-by-default policy)
    let id = provider
        .spawn(SpawnSpec {
            project_path: project.display().to_string(),
            prompt: None,
            model: Some("haiku".into()),
            permission_mode: PermissionMode::Default,
            resume_session: Some("old-session-id".into()),
            fork: true,
            append_system_prompt: None,
            agent_id: None,
        })
        .await
        .unwrap();
    assert_ne!(id.id, "old-session-id", "fork must mint a new session id");

    // fake exits 0 only if all expect_arg directives matched
    wait_for(
        &mut rx,
        "Ended (fake exited cleanly => argv asserted)",
        |e| matches!(e, SessionEvent::Updated { meta } if meta.status == SessionStatus::Ended),
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn interrupt_sends_control_request_on_stdin() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init","session_id":"int-1"}}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"interrupt"}}"#,
            "\n",
            r#"{"emit":{"type":"result","subtype":"success","is_error":false,"result":"interrupted"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );

    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        idle_timeout_ms: 30 * 60 * 1000,
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
    provider.interrupt(&id).await.unwrap();
    wait_for(
        &mut rx,
        "turn-complete after interrupt",
        |e| matches!(e, SessionEvent::Signal { signal, .. } if signal.event == "turn-complete"),
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn idle_sweep_kills_only_stale_sessions() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"system","subtype":"init","session_id":"idle-1"}}"#,
            "\n",
            r#"{"sleep_ms":30000}"#,
            "\n",
        ),
    );
    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        idle_timeout_ms: 30 * 60 * 1000,
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

    // generous timeout -> nothing swept
    assert!(provider.processes_for_test().sweep_idle(60_000).is_empty());
    // zero timeout -> our session is stale and gets killed
    let killed = provider.processes_for_test().sweep_idle(-1);
    assert_eq!(killed, vec![id]);
    wait_for(
        &mut rx,
        "Ended after idle sweep",
        |e| matches!(e, SessionEvent::Updated { meta } if meta.status == SessionStatus::Ended),
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn headless_run_records_result_with_haiku_default() {
    use crewhub2_lib::engine::claude::headless::{run_headless, DEFAULT_HEADLESS_MODEL};
    use crewhub2_lib::store::Store;

    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_arg":"--model"}"#,
            "\n",
            r#"{"expect_arg":"haiku"}"#,
            "\n",
            r#"{"expect_arg":"summarize-this"}"#,
            "\n",
            r#"{"emit":{"type":"result","subtype":"success","is_error":false,"session_id":"head-1","result":"all good"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );
    let store = Store::open_in_memory().unwrap();
    {
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO runs (id, kind, spec_json) VALUES ('run-1','manual','{}')",
            [],
        )
        .unwrap();
    }
    let env = vec![(
        "FAKE_CLAUDE_SCENARIO".to_string(),
        scenario.display().to_string(),
    )];
    let outcome = run_headless(
        &store,
        std::path::Path::new(env!("CARGO_BIN_EXE_fake-claude")),
        &env,
        "run-1",
        &project,
        "summarize-this",
        None, // -> DEFAULT_HEADLESS_MODEL (haiku) asserted via expect_arg
    )
    .await
    .unwrap();
    assert_eq!(DEFAULT_HEADLESS_MODEL, "haiku");
    assert_eq!(outcome.status, "success");
    assert_eq!(outcome.summary, "all good");
    assert_eq!(outcome.session_id.as_deref(), Some("head-1"));
    let n: i64 = store
        .conn
        .lock()
        .unwrap()
        .query_row(
            "SELECT count(*) FROM run_results WHERE run_id='run-1' AND status='success'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn allow_always_rule_auto_responds_without_surfacing() {
    use crewhub2_lib::engine::rules::{PermissionRule, PermissionRules};

    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"control_request","request_id":"p1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"ls"}}}}"#,
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
        idle_timeout_ms: 30 * 60 * 1000,
        extra_env: vec![(
            "FAKE_CLAUDE_SCENARIO".into(),
            scenario.display().to_string(),
        )],
    })
    .unwrap();
    provider.set_permission_rules(PermissionRules {
        rules: vec![PermissionRule {
            agent_id: None,
            tool_pattern: "Bash".into(),
        }],
    });
    let mut rx = provider.subscribe();
    provider
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

    // We must see the auto-allow signal and NEVER a PermissionRequest.
    let mut saw_auto = false;
    loop {
        match wait_for(&mut rx, "events until Ended", |_| true).await {
            SessionEvent::PermissionRequest { .. } => panic!("rule should have auto-answered"),
            SessionEvent::Signal { signal, .. } if signal.event == "permission-auto-allowed" => {
                assert_eq!(signal.tool.as_deref(), Some("Bash"));
                saw_auto = true;
            }
            SessionEvent::Updated { meta } if meta.status == SessionStatus::Ended => break,
            _ => {}
        }
    }
    assert!(saw_auto);
}

#[tokio::test(flavor = "multi_thread")]
async fn ask_user_question_surfaces_and_answer_is_relayed() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let scenario = write_scenario(
        dir.path(),
        concat!(
            r#"{"expect_stdin":{"contains":"initialize"}}"#,
            "\n",
            r#"{"emit":{"type":"control_request","request_id":"q1","request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion","input":{"questions":[{"question":"Alpha or Beta?","header":"Pref","options":[{"label":"Alpha"},{"label":"Beta"}],"multiSelect":false}]}}}}"#,
            "\n",
            r#"{"expect_stdin":{"contains":"User selected: Beta"}}"#,
            "\n",
            r#"{"emit":{"type":"result","subtype":"success","is_error":false,"result":"ok"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );
    let provider = ClaudeCodeProvider::start(ClaudeConfig {
        root: dir.path().join("claude-projects"),
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        idle_timeout_ms: 30 * 60 * 1000,
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

    let ev = wait_for(&mut rx, "Question event", |e| {
        matches!(e, SessionEvent::Question { .. })
    })
    .await;
    let SessionEvent::Question { question, .. } = ev else {
        unreachable!()
    };
    assert_eq!(question.kind, "question");
    assert_eq!(question.text, "Alpha or Beta?");
    assert_eq!(question.options, vec!["Alpha", "Beta"]);

    provider
        .answer_question(
            &id,
            QuestionResponse {
                request_id: question.request_id,
                answers: vec!["Beta".into()],
            },
        )
        .await
        .unwrap();

    wait_for(
        &mut rx,
        "turn-complete after answer",
        |e| matches!(e, SessionEvent::Signal { signal, .. } if signal.event == "turn-complete"),
    )
    .await;
}
