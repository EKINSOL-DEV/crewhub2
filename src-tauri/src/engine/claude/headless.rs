//! One-shot headless runs (`claude -p`), used by the scheduler (M4) and meetings.
//!
//! Model policy: defaults to the cheapest capable tier ("haiku") per the standing
//! product directive — callers upgrade explicitly when the task demands it.

use crate::store::Store;
use serde_json::Value;
use std::path::Path;

pub const DEFAULT_HEADLESS_MODEL: &str = "haiku";

#[derive(Debug, Clone, PartialEq)]
pub struct HeadlessOutcome {
    pub run_result_id: String,
    pub session_id: Option<String>,
    pub status: String, // "success" | "error"
    pub summary: String,
}

pub async fn run_headless(
    store: &Store,
    cli_path: &Path,
    extra_env: &[(String, String)],
    run_id: &str,
    project_path: &Path,
    prompt: &str,
    model: Option<&str>,
) -> anyhow::Result<HeadlessOutcome> {
    let started = Store::now_ms();
    let model = model.unwrap_or(DEFAULT_HEADLESS_MODEL);
    let mut cmd = tokio::process::Command::new(cli_path);
    cmd.arg("--print")
        .arg("--verbose")
        .args(["--output-format", "stream-json"])
        .args(["--model", model])
        .arg(prompt)
        .current_dir(project_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    let output = cmd.output().await?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut session_id = None;
    let mut status = "error".to_string();
    let mut summary = String::new();
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v.get("type").and_then(Value::as_str) == Some("result") {
            session_id = v
                .get("session_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            let is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(true);
            status = if is_error || !output.status.success() {
                "error"
            } else {
                "success"
            }
            .to_string();
            summary = v
                .get("result")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .chars()
                .take(500)
                .collect();
        }
    }

    let result_id = uuid::Uuid::new_v4().to_string();
    {
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO run_results (id, run_id, session_id, status, summary, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![result_id, run_id, session_id, status, summary, started, Store::now_ms()],
        )?;
    }
    Ok(HeadlessOutcome {
        run_result_id: result_id,
        session_id,
        status,
        summary,
    })
}
