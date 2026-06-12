//! Creator mode (EKI-83): `world_generate_prop`'s inner path against
//! fake-claude — the prompt reaches the CLI, the model defaults to haiku
//! (haiku-default principle, test-asserted), and the result text round-trips.

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::ProviderRegistry;
use crewhub2_lib::ipc::generate_prop_inner;
use crewhub2_lib::store::Store;
use serde_json::json;
use std::sync::Arc;

fn registry_with_fake_claude(
    base: &std::path::Path,
    scenario_dir: &std::path::Path,
) -> ProviderRegistry {
    let root = base.join("claude-projects");
    std::fs::create_dir_all(&root).unwrap();
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
        store,
    )
    .unwrap();
    let mut registry = ProviderRegistry::default();
    registry.register(Arc::new(provider));
    registry
}

fn write_default_scenario(dir: &std::path::Path, lines: &[serde_json::Value]) {
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(dir.join("default.jsonl"), body).unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn generate_prop_defaults_to_haiku_and_returns_result_text() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    let prop_json = json!({
        "label": "Rubber duck", "emoji": "🦆", "radius": 0.5,
        "parts": [{"shape":"sphere","size":[0.4],"at":[0,0.4,0],"color":"accent"}],
    });
    write_default_scenario(
        &scenarios,
        &[
            json!({"expect_arg": "haiku"}),
            json!({"expect_arg": "desk-toy duck"}),
            json!({"emit": {"type":"result","subtype":"success","is_error":false,
                "session_id":"creator-1","result": prop_json.to_string()}}),
            json!({"exit": 0}),
        ],
    );
    let registry = registry_with_fake_claude(dir.path(), &scenarios);

    let run = generate_prop_inner(&registry, "Dream up: a desk-toy duck", None)
        .await
        .unwrap();
    assert_eq!(run.status, "success");
    assert!(run.text.contains("Rubber duck"));
}

#[tokio::test(flavor = "multi_thread")]
async fn generate_prop_surfaces_cli_error_status() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    write_default_scenario(
        &scenarios,
        &[
            json!({"emit": {"type":"result","subtype":"error","is_error":true,
                "session_id":"creator-2","result":"the muse is out for coffee"}}),
            json!({"exit": 0}),
        ],
    );
    let registry = registry_with_fake_claude(dir.path(), &scenarios);

    let run = generate_prop_inner(&registry, "anything", None)
        .await
        .unwrap();
    assert_eq!(run.status, "error");
    assert!(run.text.contains("muse"));
}

#[tokio::test(flavor = "multi_thread")]
async fn generate_prop_without_headless_provider_fails_cleanly() {
    let registry = ProviderRegistry::default();
    let err = generate_prop_inner(&registry, "anything", None)
        .await
        .unwrap_err();
    assert!(err.to_string().contains("headless"));
}
