//! T18 end-to-end: real crewhub-signal binary -> UDS receiver -> Store-backed
//! context envelope -> `additionalContext` on the helper's stdout.

use crewhub2_lib::hooks::receiver::{ContextProvider, HookReceiver, ReceiverConfig};
use crewhub2_lib::store::projects::NewProject;
use crewhub2_lib::store::Store;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::Arc;

fn signal_binary() -> std::path::PathBuf {
    let target =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/debug/crewhub-signal");
    {
        let status = Command::new("cargo")
            .args(["build", "-p", "crewhub-signal", "--quiet"])
            .current_dir(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
            .status()
            .expect("cargo build crewhub-signal");
        assert!(status.success());
    }
    target
}

#[tokio::test(flavor = "multi_thread")]
async fn session_start_gets_additional_context_for_registered_project() {
    let socket = std::env::temp_dir().join(format!("chr-ctx-{}.sock", std::process::id()));

    let store = Arc::new(Store::open_in_memory().unwrap());
    store
        .create_project(NewProject {
            name: "Alpha".into(),
            description: None,
            icon: None,
            color: None,
            folder_path: "/work/alpha".into(),
            docs_path: None,
        })
        .unwrap();

    let ctx_store = store.clone();
    let provider: ContextProvider =
        Arc::new(move |cwd| crewhub2_lib::hooks::context::build_envelope(&ctx_store, cwd));

    let (tx, _rx) = tokio::sync::broadcast::channel(16);
    let _receiver = HookReceiver::start_with_context(
        ReceiverConfig {
            socket_path: socket.clone(),
            ..Default::default()
        },
        tx,
        Some(provider),
    )
    .unwrap();

    let socket_for_run = socket.clone();
    let run = move |cwd: &str| {
        let payload =
            format!(r#"{{"hook_event_name":"SessionStart","session_id":"s1","cwd":"{cwd}"}}"#);
        let bin = signal_binary();
        let mut child = Command::new(bin)
            .env("CREWHUB_SIGNAL_SOCKET", &socket_for_run)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(payload.as_bytes())
            .unwrap();
        let out = child.wait_with_output().unwrap();
        assert!(out.status.success(), "helper must always exit 0");
        String::from_utf8_lossy(&out.stdout).to_string()
    };

    let inside = tokio::task::spawn_blocking({
        let r = run.clone();
        move || r("/work/alpha/src")
    })
    .await
    .unwrap();
    assert!(inside.contains("additionalContext"), "got: {inside}");
    assert!(inside.contains("CrewHub context"));
    assert!(inside.contains("Alpha"));

    let outside = tokio::task::spawn_blocking(move || run("/elsewhere"))
        .await
        .unwrap();
    assert!(
        outside.is_empty(),
        "no context outside registered projects, got: {outside}"
    );
}
