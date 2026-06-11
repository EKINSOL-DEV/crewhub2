//! Scheduler + dispatcher integration against fake-claude (M4 T5, D-M4-4/5).

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::ProviderRegistry;
use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::orchestrator::Orchestrator;
use crewhub2_lib::store::runs::NewRun;
use crewhub2_lib::store::Store;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

fn stack(
    base: &std::path::Path,
    scenario_dir: &std::path::Path,
) -> (
    Arc<Store>,
    Arc<Orchestrator>,
    tokio::sync::broadcast::Receiver<DomainEvent>,
) {
    let root = base.join("claude-projects");
    std::fs::create_dir_all(root.join("fakeproj")).unwrap();
    let store = Arc::new(Store::open_in_memory().unwrap());
    let provider = ClaudeCodeProvider::start(
        ClaudeConfig {
            root,
            cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
            idle_timeout_ms: 30 * 60 * 1000,
            extra_env: vec![(
                "FAKE_CLAUDE_SCENARIO_DIR".into(),
                scenario_dir.display().to_string(),
            )],
        },
        store.clone(),
    )
    .unwrap();
    let mut registry = ProviderRegistry::default();
    registry.register(Arc::new(provider));
    let (notify, notify_rx) = tokio::sync::broadcast::channel(256);
    let orch = Orchestrator::new(store.clone(), Arc::new(registry), notify);
    (store, orch, notify_rx)
}

fn write_default_scenario(dir: &std::path::Path, lines: &[serde_json::Value]) {
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(dir.join("default.jsonl"), body).unwrap();
}

/// A schedule with an every-second cron fires through the REAL loop into a
/// fake-claude execution; the result row lands and `last_run_at` advances.
#[tokio::test(flavor = "multi_thread")]
async fn scheduled_run_fires_and_records_result() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    write_default_scenario(
        &scenarios,
        &[
            json!({"expect_arg": "haiku"}), // default model preserved (G5)
            json!({"emit": {"type":"result","subtype":"success","is_error":false,
                "session_id":"sched-1","result":"nightly things done"}}),
            json!({"exit": 0}),
        ],
    );

    let (store, orch, mut notify_rx) = stack(dir.path(), &scenarios);
    let run = store
        .create_run(NewRun {
            kind: "scheduled".into(),
            schedule_cron: Some("* * * * * *".into()), // every second
            spec_json: json!({"action":"prompt",
                "project_path": project.display().to_string(),
                "prompt":"summarize the night"})
            .to_string(),
        })
        .unwrap();
    orch.start_scheduler();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    let results = loop {
        let results = store.list_run_results(&run.id).unwrap();
        // rows begin as "running" (T6 persist-then-act) — wait for the finish
        if results.iter().any(|r| r.status != "running") {
            break results;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "schedule never fired"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    assert_eq!(results[0].status, "success");
    assert_eq!(results[0].summary.as_deref(), Some("nightly things done"));
    assert_eq!(results[0].session_id.as_deref(), Some("sched-1"));
    assert!(store
        .get_run(&run.id)
        .unwrap()
        .unwrap()
        .last_run_at
        .is_some());

    // RunChanged announced the firing
    let mut saw = false;
    while let Ok(ev) = notify_rx.try_recv() {
        if matches!(ev, DomainEvent::RunChanged { ref run_id } if *run_id == run.id) {
            saw = true;
        }
    }
    assert!(saw, "RunChanged must accompany the firing");
}

/// "Run now" is the same dispatcher path: manual run, no cron, result returned.
#[tokio::test(flavor = "multi_thread")]
async fn run_now_executes_and_returns_the_result() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    write_default_scenario(
        &scenarios,
        &[
            json!({"expect_arg": "sonnet"}), // explicit per-run model override
            json!({"emit": {"type":"result","subtype":"success","is_error":false,
                "result":"manual things done"}}),
            json!({"exit": 0}),
        ],
    );

    let (store, orch, _rx) = stack(dir.path(), &scenarios);
    let run = store
        .create_run(NewRun {
            kind: "manual".into(),
            schedule_cron: None,
            spec_json: json!({"action":"prompt",
                "project_path": project.display().to_string(),
                "prompt":"do it now","model":"sonnet"})
            .to_string(),
        })
        .unwrap();

    let result = orch.run_now(&run.id).await.unwrap();
    assert_eq!(result.status, "success");
    assert_eq!(result.summary.as_deref(), Some("manual things done"));
}

/// An unreadable stored spec records an honest error row instead of wedging.
#[tokio::test(flavor = "multi_thread")]
async fn unreadable_spec_records_error_result() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let (store, orch, _rx) = stack(dir.path(), &scenarios);
    // bypass write-time validation to simulate drift (raw SQL insert)
    {
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO runs (id, kind, spec_json) VALUES ('drifted','manual','{\"action\":\"alien\"}')",
            [],
        )
        .unwrap();
    }
    let result = orch.run_now("drifted").await.unwrap();
    assert_eq!(result.status, "error");
    assert!(result.summary.unwrap().contains("unreadable spec_json"));
}

/// A scheduled `standup` spec delegates to the T4 fan-out (16.4's "scheduled
/// or manual" falls out of 17.1 for free).
#[tokio::test(flavor = "multi_thread")]
async fn standup_spec_dispatches_the_fanout() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();
    let reply = "```json\n{\"yesterday\":\"y\",\"today\":\"t\",\"blockers\":null}\n```";
    write_default_scenario(
        &scenarios,
        &[
            json!({"expect_arg": "haiku"}),
            json!({"emit": {"type":"result","subtype":"success","is_error":false,"result": reply}}),
            json!({"exit": 0}),
        ],
    );
    let (store, orch, _rx) = stack(dir.path(), &scenarios);
    store
        .create_agent(crewhub2_lib::store::agents::NewAgent {
            name: "scheduled-sam".into(),
            icon: None,
            color: None,
            default_model: None,
            project_path: Some(project.display().to_string()),
            permission_mode: None,
            system_prompt: None,
        })
        .unwrap();
    let run = store
        .create_run(NewRun {
            kind: "scheduled".into(),
            schedule_cron: Some("0 9 * * *".into()),
            spec_json: json!({"action":"standup","title":"Nightly"}).to_string(),
        })
        .unwrap();

    let result = orch.run_now(&run.id).await.unwrap();
    assert_eq!(result.status, "success");
    let standups = store.list_standups().unwrap();
    assert_eq!(standups.len(), 1);
    assert_eq!(standups[0].title, "Nightly");
    let entries = store.list_standup_entries(&standups[0].id).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].yesterday.as_deref(), Some("y"));
}
