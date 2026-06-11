//! Hooks bridge: realtime signals from agent-runtime hooks into the engine.
//!
//! # Naming-firewall note (see `engine/mod.rs`)
//!
//! This module emits only provider-neutral types ([`crate::engine::types`]),
//! but its *wire surface* is runtime-specific by nature and documented as the
//! sanctioned exception: hook event names on the socket (`SessionStart`,
//! `PreToolUse`, …) and the tool names checked for conflicts (`Edit`,
//! `Write`, `MultiEdit`) are Claude Code's — [`receiver`] maps them to neutral
//! signal names; [`installer`] manages a fenced block in the runtime's
//! `settings.json` (path injectable; the runtime's schema is the contract
//! being written). These strings are kept to this module and never leak past
//! [`SessionEvent`].
//!
//! # M6 T1 — the bridge is wired (D-M6-1, G1)
//!
//! `crewhub-signal` ships as a bundled sidecar (`bundle.externalBin`, built by
//! `build.rs`), the UDS receiver boots in `lib.rs`, and this module exposes
//! the status/preview/install/uninstall surface the IPC layer wraps.
//! Windows: unsupported (UDS; named pipes are post-v2.0, master plan R6) —
//! [`bridge_status`] reports `supported: false` and install/uninstall refuse.
//!
//! [`SessionEvent`]: crate::engine::types::SessionEvent
pub mod conflicts;
pub mod context;
pub mod installer;
pub mod receiver;

use serde::Serialize;
use std::path::PathBuf;

/// Wire status of the hooks bridge (Appendix C `HooksStatus`).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct HooksStatus {
    /// False on Windows: the bridge is UDS-based; the app runs watcher-only.
    pub supported: bool,
    pub installed: bool,
    pub settings_path: String,
    /// The bundled `crewhub-signal` binary was found on disk.
    pub sidecar_ok: bool,
}

/// Before/after settings text for the wizard's real preview diff.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct HooksPreview {
    pub before: String,
    pub after: String,
}

/// The agent runtime's settings file the installer manages
/// (`~/.claude/settings.json` — the sanctioned runtime-specific exception).
pub fn runtime_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/settings.json")
}

/// Where the receiver binds and where `crewhub-signal` connects by default.
///
/// Deliberate deviation from the plan's literal `<app-data>/signal.sock`:
/// the helper runs with no args and no env (the installer writes a bare
/// command path so uninstall stays byte-identical), so both sides must agree
/// on a zero-config path. That is the OS data dir + `CrewHub/signal.sock`
/// (macOS: `~/Library/Application Support/CrewHub/signal.sock`), overridable
/// for tests with `$CREWHUB_SIGNAL_SOCKET` — mirrored in
/// `crates/crewhub-signal/src/main.rs`.
pub fn signal_socket_path() -> PathBuf {
    if let Some(path) = std::env::var_os("CREWHUB_SIGNAL_SOCKET") {
        return path.into();
    }
    dirs::data_dir()
        .unwrap_or_default()
        .join("CrewHub/signal.sock")
}

/// Resolve the bundled `crewhub-signal` binary.
///
/// Bundled and `tauri dev` builds find it next to the app executable (where
/// `externalBin` placement puts it); tests and plain `cargo` builds fall back
/// to the copy `build.rs` drops in `<src-tauri>/binaries/`.
pub fn sidecar_path() -> Option<PathBuf> {
    let name = format!("crewhub-signal{}", std::env::consts::EXE_SUFFIX);
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent();
        for _ in 0..3 {
            let Some(d) = dir else { break };
            let candidate = d.join(&name);
            if candidate.is_file() {
                return Some(candidate);
            }
            dir = d.parent();
        }
    }
    let fallback = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "binaries/crewhub-signal-{}{}",
        env!("CREWHUB_TARGET_TRIPLE"),
        std::env::consts::EXE_SUFFIX
    ));
    fallback.is_file().then_some(fallback)
}

fn bridge_installer() -> installer::HookInstaller {
    installer::HookInstaller::new(runtime_settings_path(), sidecar_path().unwrap_or_default())
}

/// Current bridge status (M6 T1 IPC backing).
pub fn bridge_status() -> HooksStatus {
    let settings_path = runtime_settings_path();
    HooksStatus {
        supported: cfg!(unix),
        installed: bridge_installer().is_installed().unwrap_or(false),
        settings_path: settings_path.display().to_string(),
        sidecar_ok: sidecar_path().is_some(),
    }
}

/// Exact before/after text of an install on the real settings file.
pub fn bridge_preview() -> anyhow::Result<HooksPreview> {
    ensure_supported()?;
    let (before, after) = bridge_installer().preview()?;
    Ok(HooksPreview { before, after })
}

pub fn bridge_install() -> anyhow::Result<HooksStatus> {
    ensure_supported()?;
    anyhow::ensure!(
        sidecar_path().is_some(),
        "crewhub-signal sidecar not found; cannot install hooks"
    );
    bridge_installer().install()?;
    Ok(bridge_status())
}

pub fn bridge_uninstall() -> anyhow::Result<HooksStatus> {
    ensure_supported()?;
    bridge_installer().uninstall()?;
    Ok(bridge_status())
}

fn ensure_supported() -> anyhow::Result<()> {
    anyhow::ensure!(
        cfg!(unix),
        "the hooks bridge is not supported on Windows (watcher-only mode)"
    );
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::engine::types::SessionEvent;
    use std::io::Write as _;
    use std::process::{Command, Stdio};
    use tokio::sync::broadcast;

    /// §3.5 flagship: a recorded hook payload through the REAL bundled
    /// `crewhub-signal` binary into the booted receiver yields a `Signal`
    /// event — the full wire path the installer's command string sets up.
    #[tokio::test(flavor = "multi_thread")]
    async fn recorded_payload_through_real_sidecar_reaches_receiver() {
        let sidecar = sidecar_path().expect("bundled crewhub-signal must resolve");
        let socket = std::env::temp_dir().join(format!("chb-{}.sock", std::process::id()));
        let (tx, mut rx) = broadcast::channel(16);
        let _receiver = receiver::HookReceiver::start_with_context(
            receiver::ReceiverConfig {
                socket_path: socket.clone(),
                ..Default::default()
            },
            tx,
            None,
        )
        .unwrap();

        // Recorded PostToolUse payload shape (M1 fixtures).
        let payload = concat!(
            r#"{"hook_event_name":"PostToolUse","session_id":"wire-1","#,
            r#""transcript_path":"/tmp/t.jsonl","cwd":"/tmp/proj","tool_name":"Bash"}"#
        );
        let mut child = Command::new(&sidecar)
            .env("CREWHUB_SIGNAL_SOCKET", &socket)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(payload.as_bytes())
            .unwrap();
        let status = child.wait().unwrap();
        assert!(status.success(), "crewhub-signal must always exit 0");

        let event = tokio::time::timeout(std::time::Duration::from_secs(5), rx.recv())
            .await
            .expect("timeout")
            .expect("recv");
        match event {
            SessionEvent::Signal { id, signal } => {
                assert_eq!(id.id, "wire-1");
                assert_eq!(id.provider, "claude-code");
                assert_eq!(signal.event, "post-tool");
            }
            other => panic!("expected Signal, got {other:?}"),
        }
        let _ = std::fs::remove_file(&socket);
    }

    #[test]
    fn bridge_status_reports_unix_support_and_sidecar() {
        let status = bridge_status();
        assert!(status.supported);
        assert!(status.sidecar_ok, "sidecar should resolve in the workspace");
        assert!(status.settings_path.ends_with(".claude/settings.json"));
    }

    #[test]
    fn socket_path_honors_env_override() {
        // NOTE: process-global env; safe because no test in this module reads
        // the default path concurrently.
        std::env::set_var("CREWHUB_SIGNAL_SOCKET", "/tmp/custom.sock");
        assert_eq!(signal_socket_path(), PathBuf::from("/tmp/custom.sock"));
        std::env::remove_var("CREWHUB_SIGNAL_SOCKET");
        assert!(signal_socket_path().ends_with("CrewHub/signal.sock"));
    }
}
