//! Standup engine integration tests against fake-claude (M4 T4, D-M4-7).
//!
//! Headless standup runs carry no `[scenario:…]` marker in argv, so every
//! gathering process plays `default.jsonl` from `FAKE_CLAUDE_SCENARIO_DIR`.

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::ProviderRegistry;
use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::orchestrator::standup::NO_RESPONSE;
use crewhub2_lib::orchestrator::Orchestrator;
use crewhub2_lib::store::agents::NewAgent;
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

fn agent(store: &Store, name: &str, project: &std::path::Path) -> String {
    store
        .create_agent(NewAgent {
            name: name.into(),
            icon: None,
            color: None,
            default_model: None,
            project_path: Some(project.display().to_string()),
            permission_mode: None,
            system_prompt: None,
        })
        .unwrap()
        .id
}

async fn wait_for_entries(store: &Store, standup_id: &str, n: usize, secs: u64) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(secs);
    loop {
        let entries = store.list_standup_entries(standup_id).unwrap();
        if entries.len() >= n {
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "timeout: only {} of {n} entries",
            entries.len()
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

/// Happy path + cost discipline + bounded fan-out: 4 agents, haiku asserted
/// inside the scenario (`expect_arg`), concurrency ≤ 2 probed via entry
/// completion timestamps (a 3rd entry can only land a full sleep after the
/// first pair).
#[tokio::test(flavor = "multi_thread")]
async fn standup_fans_out_capped_at_two_with_haiku() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    let reply = "```json\n{\"yesterday\":\"shipped the thing\",\"today\":\"reviewing\",\"blockers\":null}\n```";
    let lines = [
        json!({"expect_arg": "haiku"}),
        json!({"expect_arg": "write a standup"}),
        json!({"sleep_ms": 600}),
        json!({"emit": {"type":"result","subtype":"success","is_error":false,
            "session_id":"st-1","result": reply}}),
        json!({"exit": 0}),
    ];
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(scenarios.join("default.jsonl"), body).unwrap();

    let (store, orch, mut notify_rx) = stack(dir.path(), &scenarios);
    for name in ["a1", "a2", "a3", "a4"] {
        agent(&store, name, &project);
    }

    let standup = orch.start_standup(None, Some("Daily".into())).unwrap();
    assert_eq!(standup.title, "Daily");
    wait_for_entries(&store, &standup.id, 4, 60).await;

    let entries = store.list_standup_entries(&standup.id).unwrap();
    assert_eq!(entries.len(), 4);
    for e in &entries {
        assert_eq!(e.yesterday.as_deref(), Some("shipped the thing"));
        assert_eq!(e.today.as_deref(), Some("reviewing"));
        assert_eq!(e.blockers, None);
    }

    // concurrency ≤ 2: with a 600 ms gathering sleep, the 3rd completion must
    // land at least ~one sleep after the 1st (cap 3+ would finish together)
    let mut ts: Vec<i64> = entries.iter().map(|e| e.submitted_at).collect();
    ts.sort();
    assert!(
        ts[2] - ts[0] >= 400,
        "3rd entry too early for a fan-out cap of 2: {ts:?}"
    );

    // StandupChanged events flowed (one per entry + creation)
    let mut changed = 0;
    while let Ok(ev) = notify_rx.try_recv() {
        if matches!(ev, DomainEvent::StandupChanged { ref standup_id } if *standup_id == standup.id)
        {
            changed += 1;
        }
    }
    assert!(changed >= 4, "got {changed}");
}

/// Honesty: an agent whose run fails (or answers garbage) records the
/// "(no response 🤷)" entry — the standup never hangs and never fakes.
#[tokio::test(flavor = "multi_thread")]
async fn failed_or_unparseable_agent_records_no_response() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    // fake exits with an error result — unusable answer
    let lines = [
        json!({"emit": {"type":"result","subtype":"error","is_error":true,"result":"rate limited"}}),
        json!({"exit": 0}),
    ];
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(scenarios.join("default.jsonl"), body).unwrap();

    let (store, orch, _rx) = stack(dir.path(), &scenarios);
    let only = agent(&store, "silent-sam", &project);

    let standup = orch.start_standup(Some(vec![only.clone()]), None).unwrap();
    wait_for_entries(&store, &standup.id, 1, 30).await;

    let entries = store.list_standup_entries(&standup.id).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].agent_id, only);
    assert_eq!(entries[0].yesterday, None);
    assert_eq!(entries[0].blockers.as_deref(), Some(NO_RESPONSE));
}

#[tokio::test(flavor = "multi_thread")]
async fn standup_with_no_agents_errors() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let (_store, orch, _rx) = stack(dir.path(), &scenarios);
    let err = orch.start_standup(None, None).unwrap_err();
    assert!(err.to_string().contains("no agents"));
}
