//! Local error log + report bundle (M6 T6 — D-M6-10, EKI-102).
//!
//! One JSONL file (`<app-data>/errors.jsonl`), ring-capped at the last
//! [`RING_CAP`] entries (rewrite-on-rotate, no file-handle daemon), one
//! launch header per boot, and a panic hook that records panic + backtrace
//! before the default hook runs. The report bundle is **user-initiated
//! only**: a single markdown file in temp — app version, OS/arch, last 50
//! error lines, capability summary — containing **no transcript content, no
//! settings values, no paths beyond the app's own** (master plan §5.8: no
//! telemetry, nothing leaves the machine unprompted).
//!
//! Before [`init`] runs (early boot, unit tests) entries fall back to
//! stderr — never lost, never panicking.

use std::fmt::Display;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// Keep the last N entries (D-M6-10).
pub const RING_CAP: usize = 500;
/// Lines included in the report bundle.
pub const REPORT_LINES: usize = 50;
pub const LOG_FILE_NAME: &str = "errors.jsonl";

static LOG: OnceLock<Mutex<PathBuf>> = OnceLock::new();

/// Install the log file + panic hook. Called once from `lib.rs` setup with
/// `<app-data>/errors.jsonl`; injectable path for tests.
pub fn init(log_path: PathBuf, app_version: &str) {
    if LOG.set(Mutex::new(log_path)).is_err() {
        return; // already initialized (tests)
    }
    append(
        "launch",
        format!(
            "version={app_version} os={} arch={}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ),
    );
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        append("panic", format!("{info}\nbacktrace:\n{backtrace}"));
        previous(info);
    }));
}

/// Record one error line: `{ts, context, message}`. The replacement for
/// every former `eprintln!` site (CI-grep-enforced, Lane J).
pub fn error(context: &str, message: impl Display) {
    append(context, message.to_string());
}

fn append(context: &str, message: String) {
    let Some(lock) = LOG.get() else {
        eprintln!("[{context}] {message}");
        return;
    };
    let line = serde_json::json!({
        "ts": crate::store::Store::now_ms(),
        "context": context,
        "message": message,
    })
    .to_string();
    let path = lock.lock().unwrap();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let written = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&*path)
        .and_then(|mut f| writeln!(f, "{line}"));
    if written.is_err() {
        eprintln!("[{context}] {message}");
        return;
    }
    rotate(&path);
}

/// Rewrite-on-rotate: keep the last [`RING_CAP`] lines.
fn rotate(path: &Path) {
    let Ok(text) = std::fs::read_to_string(path) else {
        return;
    };
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= RING_CAP {
        return;
    }
    let keep = &lines[lines.len() - RING_CAP..];
    let _ = std::fs::write(path, format!("{}\n", keep.join("\n")));
}

/// The last `n` log lines (newest last); empty when uninitialized/missing.
pub fn last_lines(n: usize) -> Vec<String> {
    let Some(lock) = LOG.get() else {
        return Vec::new();
    };
    let path = lock.lock().unwrap();
    let Ok(text) = std::fs::read_to_string(&*path) else {
        return Vec::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].iter().map(|s| s.to_string()).collect()
}

/// Static capability summary for the bundle (kept in sync with
/// `capabilities/README.md` — the granted webview surface, nothing dynamic).
const CAPABILITY_SUMMARY: &str = "main window: core:default, \
clipboard-manager:allow-write-text, notification:default · settings window: \
core:default · everything else is typed Rust IPC (no fs/shell/dialog grants)";

/// Assemble the report bundle markdown in a fresh temp dir; returns its path.
/// Content contract (§3.7, tested): version + OS/arch + capability summary +
/// last [`REPORT_LINES`] error lines — and nothing else.
pub fn build_report(app_version: &str) -> anyhow::Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!(
        "crewhub-report-{}-{}",
        std::process::id(),
        crate::store::Store::now_ms()
    ));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("crewhub-error-report.md");
    let mut out = String::new();
    out.push_str("# CrewHub error report\n\n");
    out.push_str(&format!("- App version: {app_version}\n"));
    out.push_str(&format!(
        "- OS/arch: {} / {}\n",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    out.push_str(&format!("- Webview capabilities: {CAPABILITY_SUMMARY}\n"));
    out.push_str(&format!(
        "\n## Last {REPORT_LINES} error-log lines\n\n```jsonl\n"
    ));
    for line in last_lines(REPORT_LINES) {
        out.push_str(&line);
        out.push('\n');
    }
    out.push_str(
        "```\n\nGenerated locally by CrewHub — nothing was uploaded. \
                  Attach or gist this file yourself when reporting an issue.\n",
    );
    std::fs::write(&path, out)?;
    Ok(path)
}

/// Reveal the bundle next to the user (fixed argv — the handoff precedent;
/// no shell, the path is the only variable and always a trailing argument).
pub fn reveal(path: &Path) {
    let target = path.display().to_string();
    #[cfg(target_os = "macos")]
    let argv: Vec<String> = vec!["open".into(), "-R".into(), target];
    #[cfg(target_os = "windows")]
    let argv: Vec<String> = vec!["explorer".into(), format!("/select,{target}")];
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let argv: Vec<String> = vec![
        "xdg-open".into(),
        path.parent()
            .map(|p| p.display().to_string())
            .unwrap_or(target),
    ];
    let _ = std::process::Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    // LOG is process-global: one test exercises the whole initialized
    // lifecycle so ordering never flakes; pure helpers are tested separately.
    #[test]
    fn initialized_lifecycle_header_ring_panic_and_report() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("errors.jsonl");
        init(log.clone(), "9.9.9-test");
        init(log.clone(), "9.9.9-test"); // second init: no-op, no panic

        // header line present
        let first = std::fs::read_to_string(&log).unwrap();
        assert!(first.contains("\"context\":\"launch\""));
        assert!(first.contains("version=9.9.9-test"));

        // entries are one JSON object per line
        error("mcp", "server failed to start: boom");
        let lines = last_lines(10);
        let last: serde_json::Value = serde_json::from_str(lines.last().unwrap()).unwrap();
        assert_eq!(last["context"], "mcp");
        assert!(last["message"].as_str().unwrap().contains("boom"));
        assert!(last["ts"].as_i64().unwrap() > 0);

        // ring rotation at the cap
        for n in 0..(RING_CAP + 25) {
            error("flood", format!("entry {n}"));
        }
        let text = std::fs::read_to_string(&log).unwrap();
        assert_eq!(text.lines().count(), RING_CAP);
        assert!(text
            .lines()
            .last()
            .unwrap()
            .contains(&format!("entry {}", RING_CAP + 24)));

        // panic hook records panic + backtrace (any thread)
        let result = std::thread::Builder::new()
            .name("deliberate-panic".into())
            .spawn(|| panic!("deliberate test panic"))
            .unwrap()
            .join();
        assert!(result.is_err());
        let text = std::fs::read_to_string(&log).unwrap();
        assert!(text.contains("\"context\":\"panic\""));
        assert!(text.contains("deliberate test panic"));
        assert!(text.contains("backtrace"));

        // report bundle: version + last lines, NO foreign content (§3.7) —
        // a seeded transcript-like marker in app data must never leak in.
        std::fs::write(
            dir.path().join("transcript.jsonl"),
            "SECRET-TRANSCRIPT-MARKER",
        )
        .unwrap();
        error("report-test", "report-visible-line");
        let report_path = build_report("9.9.9-test").unwrap();
        let report = std::fs::read_to_string(&report_path).unwrap();
        assert!(report.contains("App version: 9.9.9-test"));
        assert!(report.contains("report-visible-line"));
        assert!(report.contains("capabilities"));
        assert!(!report.contains("SECRET-TRANSCRIPT-MARKER"));
        assert!(report.contains("nothing was uploaded"));
        // exactly the documented line budget
        assert!(report.matches("\"context\"").count() <= REPORT_LINES);
        let _ = std::fs::remove_dir_all(report_path.parent().unwrap());
    }

    #[test]
    fn uninitialized_error_falls_back_to_stderr_without_panicking() {
        // LOG may already be set by the other test (shared process) — the
        // contract here is simply "never panic".
        error("early", "before init");
    }
}
