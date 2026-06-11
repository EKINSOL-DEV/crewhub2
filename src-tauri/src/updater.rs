//! Updater wiring (M6 T7 — D-M6-7, EKI-100).
//!
//! The pubkey is pinned in `tauri.conf.json` (`plugins.updater.pubkey`, from
//! `docs/RELEASING.md`); the endpoint is the GitHub latest-release
//! `latest.json`. Updater calls are **Rust-side typed IPC** — the webview
//! gets no updater plugin grant. Degradation contract: offline / unsigned /
//! plugin-absent simply yields a readable error from `check`; the app never
//! depends on the updater to run.
//!
//! "What's new" mechanics: before relaunch, [`install`] persists
//! `{version, notes}` to the `updater.pending_notes` setting; the frontend
//! finds it on next boot, shows the Fresh Paint dialog and clears the key
//! (Lane I T11 owns the dialog + `app.last_seen_version`).

use crate::store::Store;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// `"true"` (default) | `"false"` — gates the on-launch debounced check.
pub const AUTO_CHECK_KEY: &str = "updater.auto_check";
/// JSON `{version, notes}` persisted just before install+relaunch.
pub const PENDING_NOTES_KEY: &str = "updater.pending_notes";
/// JSON [`UpdateInfo`] written when a background check finds an update;
/// announced via `SettingChanged` so the UI can offer the install.
pub const AVAILABLE_KEY: &str = "updater.available";

/// Delay before the on-launch check (don't compete with boot I/O).
pub const AUTO_CHECK_DELAY_SECS: u64 = 15;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

/// Ask the configured endpoint for an update. `None` = up to date.
pub async fn check<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<Option<UpdateInfo>> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater()?.check().await?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    }))
}

/// Download, verify (signature is enforced by the plugin against the pinned
/// pubkey), persist the What's-new payload, install and relaunch.
pub async fn install<R: Runtime>(app: &AppHandle<R>, store: &Store) -> anyhow::Result<()> {
    use tauri_plugin_updater::UpdaterExt;
    let Some(update) = app.updater()?.check().await? else {
        anyhow::bail!("no update available");
    };
    persist_pending_notes(store, &update.version, update.body.as_deref())?;
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}

/// The `updater.pending_notes` write (D-M6-7), separated for tests.
pub fn persist_pending_notes(
    store: &Store,
    version: &str,
    notes: Option<&str>,
) -> anyhow::Result<()> {
    store.set_setting(
        PENDING_NOTES_KEY,
        &serde_json::json!({ "version": version, "notes": notes }).to_string(),
    )
}

/// Whether the on-launch check should run (default on; only an explicit
/// `"false"` turns it off).
pub fn auto_check_enabled(store: &Store) -> bool {
    store.get_setting(AUTO_CHECK_KEY).ok().flatten().as_deref() != Some("false")
}

/// Record a background-found update and announce it (`SettingChanged`).
pub fn record_available<R: Runtime>(app: &AppHandle<R>, store: &Store, info: &UpdateInfo) {
    let json = serde_json::json!({
        "version": info.version,
        "notes": info.notes,
        "date": info.date,
    })
    .to_string();
    if store.set_setting(AVAILABLE_KEY, &json).is_ok() {
        use tauri_specta::Event;
        let _ = crate::events::DomainEvent::SettingChanged {
            key: AVAILABLE_KEY.into(),
        }
        .emit(app);
    }
}

/// The on-launch debounced check (spawned from `lib.rs` setup). Offline or
/// unsigned builds just log — degradation by design.
pub async fn auto_check<R: Runtime>(app: AppHandle<R>) {
    let store = app.state::<std::sync::Arc<Store>>().inner().clone();
    if !auto_check_enabled(&store) {
        return;
    }
    tokio::time::sleep(std::time::Duration::from_secs(AUTO_CHECK_DELAY_SECS)).await;
    match check(&app).await {
        Ok(Some(info)) => record_available(&app, &store, &info),
        Ok(None) => {}
        Err(e) => crate::errlog::error("updater", format!("auto-check skipped: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_notes_round_trip() {
        let store = Store::open_in_memory().unwrap();
        persist_pending_notes(&store, "2.1.0", Some("- shiny things\n- fewer bugs")).unwrap();
        let raw = store.get_setting(PENDING_NOTES_KEY).unwrap().unwrap();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(value["version"], "2.1.0");
        assert!(value["notes"].as_str().unwrap().contains("shiny"));

        persist_pending_notes(&store, "2.2.0", None).unwrap();
        let raw = store.get_setting(PENDING_NOTES_KEY).unwrap().unwrap();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(value["version"], "2.2.0");
        assert!(value["notes"].is_null());
    }

    #[test]
    fn auto_check_defaults_on_and_only_false_disables() {
        let store = Store::open_in_memory().unwrap();
        assert!(auto_check_enabled(&store)); // absent -> on (Appendix A)
        store.set_setting(AUTO_CHECK_KEY, "true").unwrap();
        assert!(auto_check_enabled(&store));
        store.set_setting(AUTO_CHECK_KEY, "false").unwrap();
        assert!(!auto_check_enabled(&store));
    }

    /// D-M6-7 config pinning guard: the RELEASING.md pubkey and the GitHub
    /// latest.json endpoint are in tauri.conf.json, and updater artifacts
    /// are enabled. (Signature verification itself is the plugin's tested
    /// behavior against this pubkey; the real endpoint is exercised manually
    /// at first release per §3.8.)
    #[test]
    fn tauri_conf_pins_pubkey_endpoint_and_updater_artifacts() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = &conf["plugins"]["updater"];
        assert_eq!(
            updater["pubkey"].as_str().unwrap(),
            "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIzQjY5N0I1RTgwOUY1NjIKUldSaTlRbm90WmUySThnalZKc3NOd1g0bm00eCtHa1RrVFJNYTZtV292WEQ1UEpIVmY2dGFzMjIK",
            "pubkey must match docs/RELEASING.md"
        );
        let endpoint = updater["endpoints"][0].as_str().unwrap();
        assert!(
            endpoint.ends_with("/releases/latest/download/latest.json"),
            "got: {endpoint}"
        );
        assert_eq!(conf["bundle"]["createUpdaterArtifacts"], true);
    }
}
