//! Tray icon & dock badge (M6 T5 — D-M6-5, EKI-94).
//!
//! Everything lives Rust-side: zero webview capability impact. Counts fold
//! from the registry's meta cache, recomputed on engine events with a 500 ms
//! debounce; the dock/taskbar badge carries the pending-permission count —
//! the #1 "why is it stuck" signal. Tray Mood (D-M6-12): the icon swaps
//! calm → busy → waiting between three static assets, no animation.

use crate::engine::provider::ProviderRegistry;
use crate::engine::types::{SessionMeta, SessionStatus};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

pub const TRAY_ID: &str = "crewhub-tray";
/// Debounce window for engine-event-driven recomputes (D-M6-5).
pub const DEBOUNCE_MS: u64 = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TrayCounts {
    /// Sessions actively working.
    pub active: u32,
    /// Sessions waiting on the human (pending permissions).
    pub waiting: u32,
}

/// Pure count fold over the registry meta cache (unit-tested).
pub fn fold_counts(metas: &[SessionMeta]) -> TrayCounts {
    let mut counts = TrayCounts::default();
    for meta in metas {
        match meta.status {
            SessionStatus::Working => counts.active += 1,
            SessionStatus::WaitingForPermission => counts.waiting += 1,
            _ => {}
        }
    }
    counts
}

pub fn tooltip(counts: &TrayCounts) -> String {
    format!(
        "CrewHub — {} active / {} waiting",
        counts.active, counts.waiting
    )
}

/// Tray Mood (D-M6-12): calm → busy → "waiting on you".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mood {
    Calm,
    Busy,
    Waiting,
}

pub fn mood(counts: &TrayCounts) -> Mood {
    if counts.waiting > 0 {
        Mood::Waiting
    } else if counts.active > 0 {
        Mood::Busy
    } else {
        Mood::Calm
    }
}

fn icon_bytes(mood: Mood) -> &'static [u8] {
    match mood {
        Mood::Calm => include_bytes!("../icons/tray/calm.png"),
        Mood::Busy => include_bytes!("../icons/tray/busy.png"),
        Mood::Waiting => include_bytes!("../icons/tray/waiting.png"),
    }
}

fn icon(mood: Mood) -> tauri::image::Image<'static> {
    tauri::image::Image::from_bytes(icon_bytes(mood)).expect("bundled tray png is valid")
}

/// The mutable menu line ("N active / M waiting") kept for updates.
struct TrayMenuState<R: Runtime> {
    counts_item: MenuItem<R>,
}

/// Build the tray once at setup. Menu: Open CrewHub · counts · Check for
/// updates (T7 IPC) · Quit.
pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open CrewHub", true, None::<&str>)?;
    let counts_item = MenuItem::with_id(
        app,
        "counts",
        tooltip(&TrayCounts::default()),
        false,
        None::<&str>,
    )?;
    let check = MenuItem::with_id(
        app,
        "check-updates",
        "Check for updates…",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit CrewHub", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &counts_item, &check, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon(Mood::Calm))
        .tooltip(tooltip(&TrayCounts::default()))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => focus_main(app),
            "check-updates" => crate::updater_menu_check(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    app.manage(TrayMenuState { counts_item });
    Ok(())
}

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Apply fresh counts: tooltip + mood icon + menu line + dock badge.
pub fn update<R: Runtime>(app: &AppHandle<R>, counts: &TrayCounts) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip(counts)));
        let _ = tray.set_icon(Some(icon(mood(counts))));
    }
    if let Some(state) = app.try_state::<TrayMenuState<R>>() {
        let _ = state.counts_item.set_text(tooltip(counts));
    }
    // Dock/taskbar badge = pending permissions (macOS dock, Linux Unity;
    // best-effort elsewhere — errors ignored by design, master plan R6).
    if let Some(window) = app.get_webview_window("main") {
        let badge = (counts.waiting > 0).then_some(counts.waiting as i64);
        let _ = window.set_badge_count(badge);
    }
}

/// Engine-event watcher: recompute counts, debounced [`DEBOUNCE_MS`].
pub async fn watch<R: Runtime>(app: AppHandle<R>, registry: Arc<ProviderRegistry>) {
    let mut rx = registry.aggregate_events();
    let mut last = TrayCounts::default();
    loop {
        match rx.recv().await {
            Ok(_) => {}
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
        tokio::time::sleep(std::time::Duration::from_millis(DEBOUNCE_MS)).await;
        while rx.try_recv().is_ok() {} // coalesce the burst
        let counts = fold_counts(&registry.list_all_sessions().await);
        if counts != last {
            last = counts;
            update(&app, &counts);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::types::{SessionId, SessionOrigin, UsageTotals};

    fn meta(n: u32, status: SessionStatus) -> SessionMeta {
        SessionMeta {
            id: SessionId {
                provider: "test".into(),
                id: format!("s{n}"),
            },
            origin: SessionOrigin::Managed,
            project_path: "/p".into(),
            model: None,
            status,
            activity_detail: None,
            parent: None,
            team: None,
            usage: UsageTotals::default(),
            git_branch: None,
            last_activity_ms: 0,
        }
    }

    #[test]
    fn fold_counts_active_and_waiting() {
        let metas = vec![
            meta(1, SessionStatus::Working),
            meta(2, SessionStatus::Working),
            meta(3, SessionStatus::WaitingForPermission),
            meta(4, SessionStatus::Idle),
            meta(5, SessionStatus::WaitingForInput),
            meta(6, SessionStatus::Ended),
        ];
        let counts = fold_counts(&metas);
        assert_eq!(
            counts,
            TrayCounts {
                active: 2,
                waiting: 1
            }
        );
        assert_eq!(tooltip(&counts), "CrewHub — 2 active / 1 waiting");
    }

    /// Tray Mood transitions (D-M6-12): waiting trumps busy trumps calm.
    #[test]
    fn mood_transitions() {
        assert_eq!(mood(&TrayCounts::default()), Mood::Calm);
        assert_eq!(
            mood(&TrayCounts {
                active: 3,
                waiting: 0
            }),
            Mood::Busy
        );
        assert_eq!(
            mood(&TrayCounts {
                active: 3,
                waiting: 1
            }),
            Mood::Waiting
        );
    }

    /// The three static assets are valid PNG (no animation by design).
    #[test]
    fn mood_icons_decode() {
        for m in [Mood::Calm, Mood::Busy, Mood::Waiting] {
            let img = tauri::image::Image::from_bytes(icon_bytes(m)).unwrap();
            assert_eq!((img.width(), img.height()), (32, 32));
        }
    }
}
