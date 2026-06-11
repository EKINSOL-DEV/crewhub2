//! One-shot headless runs (`claude -p`), used by the scheduler, sequences,
//! meetings synthesis and standups (M4).
//!
//! Split per D-M4-5 (G5): [`exec_headless`] is PURE execution — no store, no
//! `runs` row required — so meetings/standups can call it directly;
//! [`record_run_result`] is the thin `run_results` writer; [`run_headless`]
//! is the composition the scheduler/dispatcher uses.
//!
//! Model policy: defaults to the cheapest capable tier ("haiku") per the
//! standing product directive — callers upgrade explicitly when the task
//! demands it.

use crate::engine::types::HeadlessRun;
use crate::store::runs::NewRunResult;
use crate::store::Store;
use serde_json::Value;
use std::path::Path;

pub const DEFAULT_HEADLESS_MODEL: &str = "haiku";

/// Max characters of result text persisted into `run_results.summary`.
const SUMMARY_CAP: usize = 500;

#[derive(Debug, Clone, PartialEq)]
pub struct HeadlessOutcome {
    pub run_result_id: String,
    pub session_id: Option<String>,
    pub status: String, // "success" | "error"
    pub summary: String,
}

/// Run `claude -p` once and parse the result line. Pure execution: writes
/// nothing anywhere.
pub async fn exec_headless(
    cli_path: &Path,
    extra_env: &[(String, String)],
    project_path: &Path,
    prompt: &str,
    model: Option<&str>,
) -> anyhow::Result<HeadlessRun> {
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
    let mut text = String::new();
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
            text = v
                .get("result")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
        }
    }
    Ok(HeadlessRun {
        session_id,
        status,
        text,
    })
}

/// Persist one execution as a `run_results` row (`step_index` for sequence
/// steps, NULL otherwise). Returns the row id.
pub fn record_run_result(
    store: &Store,
    run_id: &str,
    step_index: Option<i64>,
    exec: &HeadlessRun,
    started_at: i64,
    finished_at: i64,
) -> anyhow::Result<String> {
    let summary: String = exec.text.chars().take(SUMMARY_CAP).collect();
    let row = store.add_run_result(NewRunResult {
        run_id,
        session_id: exec.session_id.as_deref(),
        status: &exec.status,
        summary: Some(&summary),
        step_index,
        started_at,
        finished_at,
    })?;
    Ok(row.id)
}

/// Execute + record: the composition the scheduler and "run now" use.
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
    let exec = exec_headless(cli_path, extra_env, project_path, prompt, model).await?;
    let result_id = record_run_result(store, run_id, None, &exec, started, Store::now_ms())?;
    Ok(HeadlessOutcome {
        run_result_id: result_id,
        session_id: exec.session_id.clone(),
        status: exec.status.clone(),
        summary: exec.text.chars().take(SUMMARY_CAP).collect(),
    })
}
