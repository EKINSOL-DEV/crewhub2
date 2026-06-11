//! Run-sequence integration tests against fake-claude (M4 T6, D-M4-5/8).
//!
//! Per-spawn scenarios (G11): each step's prompt plants its own
//! `[scenario:<name>]` marker, so step 1 and step 2 play different scripts.

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::ProviderRegistry;
use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::orchestrator::Orchestrator;
use crewhub2_lib::store::runs::NewRun;
use crewhub2_lib::store::Store;
use serde_json::json;
use std::sync::Arc;

fn stack(
    base: &std::path::Path,
    scenario_dir: &std::path::Path,
) -> (Arc<Store>, Arc<Orchestrator>) {
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
    let (notify, _rx) = tokio::sync::broadcast::channel::<DomainEvent>(256);
    let orch = Orchestrator::new(store.clone(), Arc::new(registry), notify);
    (store, orch)
}

fn write_scenario(dir: &std::path::Path, name: &str, lines: &[serde_json::Value]) {
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(dir.join(format!("{name}.jsonl")), body).unwrap();
}

fn sequence_spec(project: &std::path::Path, steps: &[(&str, &str)]) -> String {
    json!({
        "action": "sequence",
        "steps": steps.iter().map(|(marker, prompt)| json!({
            "project_path": project.display().to_string(),
            "prompt": format!("[scenario:{marker}] {prompt}"),
        })).collect::<Vec<_>>(),
    })
    .to_string()
}

/// Happy path: step 2 receives step 1's output via `{{previous_output}}`
/// (asserted INSIDE the fake via expect_arg on the rendered prompt), both
/// steps record rows with their step_index.
#[tokio::test(flavor = "multi_thread")]
async fn two_step_sequence_passes_previous_output() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    write_scenario(
        &scenarios,
        "step1",
        &[
            json!({"expect_arg": "haiku"}),
            json!({"emit": {"type":"result","subtype":"success","is_error":false,
                "session_id":"seq-s1","result":"STEP-ONE-OUTPUT"}}),
            json!({"exit": 0}),
        ],
    );
    write_scenario(
        &scenarios,
        "step2",
        &[
            // the rendered prompt must contain step 1's output text
            json!({"expect_arg": "STEP-ONE-OUTPUT"}),
            json!({"emit": {"type":"result","subtype":"success","is_error":false,
                "session_id":"seq-s2","result":"STEP-TWO-OUTPUT"}}),
            json!({"exit": 0}),
        ],
    );

    let (store, orch) = stack(dir.path(), &scenarios);
    let run = store
        .create_run(NewRun {
            kind: "manual".into(),
            schedule_cron: None,
            spec_json: sequence_spec(
                &project,
                &[
                    ("step1", "produce the summary"),
                    ("step2", "refine this: {{previous_output}}"),
                ],
            ),
        })
        .unwrap();

    orch.run_now(&run.id).await.unwrap();

    let mut results = store.list_run_results(&run.id).unwrap();
    results.sort_by_key(|r| r.step_index);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].step_index, Some(0));
    assert_eq!(results[0].status, "success");
    assert_eq!(results[0].summary.as_deref(), Some("STEP-ONE-OUTPUT"));
    assert_eq!(results[0].session_id.as_deref(), Some("seq-s1"));
    assert_eq!(results[1].step_index, Some(1));
    assert_eq!(results[1].status, "success");
    assert_eq!(results[1].summary.as_deref(), Some("STEP-TWO-OUTPUT"));
}

/// Halt-on-failure: first failure stops the sequence; the failed step is loud
/// ("error"), the remaining steps are honest "skipped" rows (M4-R7).
#[tokio::test(flavor = "multi_thread")]
async fn sequence_halts_on_failure_and_skips_the_rest() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    write_scenario(
        &scenarios,
        "ok",
        &[
            json!({"emit": {"type":"result","subtype":"success","is_error":false,"result":"fine"}}),
            json!({"exit": 0}),
        ],
    );
    write_scenario(
        &scenarios,
        "boom",
        &[
            json!({"emit": {"type":"result","subtype":"error","is_error":true,"result":"exploded"}}),
            json!({"exit": 0}),
        ],
    );
    // "never" deliberately has no scenario file: if step 3 were executed the
    // fake would exit 5 and record an error — we assert "skipped" instead.

    let (store, orch) = stack(dir.path(), &scenarios);
    let run = store
        .create_run(NewRun {
            kind: "manual".into(),
            schedule_cron: None,
            spec_json: sequence_spec(
                &project,
                &[("ok", "one"), ("boom", "two"), ("never", "three")],
            ),
        })
        .unwrap();

    orch.run_now(&run.id).await.unwrap();

    let mut results = store.list_run_results(&run.id).unwrap();
    results.sort_by_key(|r| r.step_index);
    assert_eq!(results.len(), 3);
    assert_eq!(results[0].status, "success");
    assert_eq!(results[1].status, "error");
    assert_eq!(results[2].status, "skipped");
    assert_eq!(
        results[2].summary.as_deref(),
        Some("skipped: an earlier step failed")
    );
}

/// §3.2: a sequence interrupted by an app death must NOT resume — the boot
/// scan marks the in-flight step `interrupted` and nothing re-executes.
#[tokio::test(flavor = "multi_thread")]
async fn interrupted_sequence_is_marked_not_resumed() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let (store, orch) = stack(dir.path(), &scenarios);
    let run = store
        .create_run(NewRun {
            kind: "manual".into(),
            schedule_cron: None,
            spec_json: json!({"action":"sequence","steps":[
                {"project_path":"/tmp","prompt":"a"},
                {"project_path":"/tmp","prompt":"b"}
            ]})
            .to_string(),
        })
        .unwrap();
    // simulate: step 0 completed, step 1 was running when the app died
    let done = store.begin_run_result(&run.id, Some(0)).unwrap();
    store
        .finish_run_result(&done.id, "success", Some("done"), None)
        .unwrap();
    store.begin_run_result(&run.id, Some(1)).unwrap();

    // fresh boot: recovery marks, and does NOT spawn any execution
    assert_eq!(orch.recover_on_boot(), 0, "no meetings to resume");
    let mut results = store.list_run_results(&run.id).unwrap();
    results.sort_by_key(|r| r.step_index);
    assert_eq!(results.len(), 2, "nothing re-executed");
    assert_eq!(results[0].status, "success");
    assert_eq!(results[1].status, "interrupted");
}
