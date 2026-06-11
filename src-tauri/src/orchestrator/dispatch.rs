//! Run dispatcher (D-M4-5): ONE executor for every `runs.spec_json` shape,
//! whether triggered by cron, "run now", or a sequence step — the scheduler
//! and the UI share this code path by construction.
//!
//! `spec_json` is a tagged union, validated at WRITE time (`validate_spec`)
//! and parsed tolerantly at READ time (an unreadable spec records an error
//! result instead of wedging the scheduler).

use crate::orchestrator::DriverCtx;
use crate::store::runs::{NewRunResult, Run};
use crate::store::Store;
use serde::{Deserialize, Serialize};

/// Cap for `{{previous_output}}` carried between sequence steps (D-M4-5).
pub const PREVIOUS_OUTPUT_CAP_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SeqStep {
    pub project_path: String,
    pub prompt: String,
    #[serde(default)]
    pub model: Option<String>,
}

/// The three spec shapes (Appendix A). `deny_unknown_fields` is deliberately
/// NOT used: read-tolerance means extra fields never brick a stored row.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum RunSpec {
    Prompt {
        project_path: String,
        prompt: String,
        #[serde(default)]
        model: Option<String>,
    },
    Sequence {
        steps: Vec<SeqStep>,
    },
    Standup {
        #[serde(default)]
        agent_ids: Option<Vec<String>>,
        #[serde(default)]
        title: Option<String>,
    },
}

/// Write-time validation: every `create_run`/`update_run` goes through this.
pub fn validate_spec(spec_json: &str) -> anyhow::Result<RunSpec> {
    let spec: RunSpec =
        serde_json::from_str(spec_json).map_err(|e| anyhow::anyhow!("invalid run spec: {e}"))?;
    match &spec {
        RunSpec::Prompt {
            project_path,
            prompt,
            ..
        } => {
            anyhow::ensure!(
                !project_path.trim().is_empty(),
                "prompt run needs a project_path"
            );
            anyhow::ensure!(!prompt.trim().is_empty(), "prompt run needs a prompt");
        }
        RunSpec::Sequence { steps } => {
            anyhow::ensure!(!steps.is_empty(), "a sequence needs at least 1 step");
            for (i, s) in steps.iter().enumerate() {
                anyhow::ensure!(
                    !s.project_path.trim().is_empty(),
                    "sequence step {i} needs a project_path"
                );
                anyhow::ensure!(
                    !s.prompt.trim().is_empty(),
                    "sequence step {i} needs a prompt"
                );
                // only known variables (D-M4-8): steps may use previous_output
                for var in crate::orchestrator::substitute::referenced_variables(&s.prompt) {
                    anyhow::ensure!(
                        var == crate::orchestrator::substitute::PREVIOUS_OUTPUT_VAR,
                        "sequence step {i} references unknown variable {{{{{var}}}}}"
                    );
                }
            }
        }
        RunSpec::Standup { .. } => {}
    }
    Ok(spec)
}

/// Execute a run end-to-end and record its result row(s). Never panics, never
/// errors out of the scheduler: failures land in `run_results`.
pub(crate) async fn execute_run(ctx: &DriverCtx, run: &Run) {
    let started = Store::now_ms();
    match serde_json::from_str::<RunSpec>(&run.spec_json) {
        Ok(RunSpec::Prompt {
            project_path,
            prompt,
            model,
        }) => {
            exec_prompt_step(ctx, &run.id, None, &project_path, &prompt, model.as_deref()).await;
        }
        Ok(RunSpec::Sequence { steps }) => {
            execute_sequence(ctx, &run.id, &steps).await;
        }
        Ok(RunSpec::Standup { agent_ids, title }) => {
            execute_standup(ctx, run, agent_ids, title, started).await;
        }
        Err(e) => {
            record_error(
                ctx,
                &run.id,
                None,
                &format!("unreadable spec_json: {e}"),
                started,
            );
        }
    }
    let _ = ctx.notify.send(crate::events::DomainEvent::RunChanged {
        run_id: run.id.clone(),
    });
}

/// One prompt execution recorded as one result row (the shared primitive for
/// simple runs and sequence steps). Persist-then-act (T6/§3.2): the row is
/// written as "running" BEFORE the process starts; an app death mid-step
/// leaves it for the boot scan to mark `interrupted` — sequences are
/// atomic-or-stopped, never auto-resumed. Returns the exec for chaining.
async fn exec_prompt_step(
    ctx: &DriverCtx,
    run_id: &str,
    step_index: Option<i64>,
    project_path: &str,
    prompt: &str,
    model: Option<&str>,
) -> Option<crate::engine::types::HeadlessRun> {
    let started = Store::now_ms();
    let Some(runner) = ctx.registry.headless_runner() else {
        record_error(
            ctx,
            run_id,
            step_index,
            "no headless-capable provider",
            started,
        );
        return None;
    };
    let Ok(row) = ctx.store.begin_run_result(run_id, step_index) else {
        return None;
    };
    match runner
        .exec_headless(std::path::Path::new(project_path), prompt, model)
        .await
    {
        Ok(exec) => {
            let summary: String = exec.text.chars().take(500).collect();
            let _ = ctx.store.finish_run_result(
                &row.id,
                &exec.status,
                Some(&summary),
                exec.session_id.as_deref(),
            );
            Some(exec)
        }
        Err(e) => {
            let _ = ctx.store.finish_run_result(
                &row.id,
                "error",
                Some(&format!("exec failed: {e}")),
                None,
            );
            None
        }
    }
}

/// Sequences (17.2, D-M4-5/8): serial steps; `{{previous_output}}` carries the
/// prior step's text (16 KB cap); FIRST failure stops the sequence and the
/// remaining steps are recorded `skipped`. Interrupted-app ⇒ whatever rows
/// exist stay as they are and the LAST started step is recorded `interrupted`
/// on the next validation pass — sequences are atomic-or-stopped, never
/// auto-resumed (§3.2).
async fn execute_sequence(ctx: &DriverCtx, run_id: &str, steps: &[SeqStep]) {
    let mut previous_output = String::new();
    let mut failed_at: Option<usize> = None;
    for (i, step) in steps.iter().enumerate() {
        let started = Store::now_ms();
        let prompt = match crate::orchestrator::substitute::substitute(
            &step.prompt,
            &[(
                crate::orchestrator::substitute::PREVIOUS_OUTPUT_VAR,
                previous_output.as_str(),
            )],
        ) {
            Ok(p) => p,
            Err(e) => {
                record_error(ctx, run_id, Some(i as i64), &e.to_string(), started);
                failed_at = Some(i);
                break;
            }
        };
        match exec_prompt_step(
            ctx,
            run_id,
            Some(i as i64),
            &step.project_path,
            &prompt,
            step.model.as_deref(),
        )
        .await
        {
            Some(exec) if exec.status == "success" => {
                previous_output =
                    crate::orchestrator::meeting::cap_text(&exec.text, PREVIOUS_OUTPUT_CAP_BYTES);
            }
            _ => {
                failed_at = Some(i);
                break;
            }
        }
        let _ = ctx.notify.send(crate::events::DomainEvent::RunChanged {
            run_id: run_id.to_string(),
        });
    }
    if let Some(failed) = failed_at {
        // remaining steps recorded skipped — honest step states (M4-R7)
        let now = Store::now_ms();
        for i in (failed + 1)..steps.len() {
            let _ = ctx.store.add_run_result(NewRunResult {
                run_id,
                session_id: None,
                status: "skipped",
                summary: Some("skipped: an earlier step failed"),
                step_index: Some(i as i64),
                started_at: now,
                finished_at: now,
            });
        }
    }
}

async fn execute_standup(
    ctx: &DriverCtx,
    run: &Run,
    agent_ids: Option<Vec<String>>,
    title: Option<String>,
    started: i64,
) {
    let all = ctx.store.list_agents().unwrap_or_default();
    let agents: Vec<_> = match &agent_ids {
        Some(ids) => all.into_iter().filter(|a| ids.contains(&a.id)).collect(),
        None => all,
    };
    if agents.is_empty() {
        record_error(ctx, &run.id, None, "standup run: no agents", started);
        return;
    }
    let standup = match ctx.store.create_standup(
        title.as_deref().unwrap_or("Scheduled standup"),
        Some("scheduler"),
    ) {
        Ok(s) => s,
        Err(e) => {
            record_error(
                ctx,
                &run.id,
                None,
                &format!("standup create failed: {e}"),
                started,
            );
            return;
        }
    };
    let _ = ctx.notify.send(crate::events::DomainEvent::StandupChanged {
        standup_id: standup.id.clone(),
    });
    let n = agents.len();
    crate::orchestrator::standup::run_standup_fanout(ctx.clone(), standup.id.clone(), agents).await;
    let _ = ctx.store.add_run_result(NewRunResult {
        run_id: &run.id,
        session_id: None,
        status: "success",
        summary: Some(&format!("standup {} gathered {} agent(s)", standup.id, n)),
        step_index: None,
        started_at: started,
        finished_at: Store::now_ms(),
    });
}

fn record_error(
    ctx: &DriverCtx,
    run_id: &str,
    step_index: Option<i64>,
    message: &str,
    started: i64,
) {
    let _ = ctx.store.add_run_result(NewRunResult {
        run_id,
        session_id: None,
        status: "error",
        summary: Some(message),
        step_index,
        started_at: started,
        finished_at: Store::now_ms(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_the_three_shapes() {
        assert!(matches!(
            validate_spec(r#"{"action":"prompt","project_path":"/p","prompt":"hi"}"#).unwrap(),
            RunSpec::Prompt { .. }
        ));
        assert!(matches!(
            validate_spec(
                r#"{"action":"sequence","steps":[{"project_path":"/p","prompt":"a"},{"project_path":"/p","prompt":"use {{previous_output}}"}]}"#
            )
            .unwrap(),
            RunSpec::Sequence { .. }
        ));
        assert!(matches!(
            validate_spec(r#"{"action":"standup","agent_ids":["a"],"title":"Daily"}"#).unwrap(),
            RunSpec::Standup { .. }
        ));
    }

    #[test]
    fn rejects_garbage_and_missing_fields() {
        for bad in [
            "{}",
            r#"{"action":"teleport"}"#,
            r#"{"action":"prompt","project_path":"","prompt":"x"}"#,
            r#"{"action":"prompt","project_path":"/p","prompt":"  "}"#,
            r#"{"action":"sequence","steps":[]}"#,
            "not json",
        ] {
            assert!(validate_spec(bad).is_err(), "should reject: {bad}");
        }
    }

    #[test]
    fn sequence_steps_may_only_reference_previous_output() {
        let err = validate_spec(
            r#"{"action":"sequence","steps":[{"project_path":"/p","prompt":"{{mystery}}"}]}"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("mystery"), "got: {err}");
        // {{previous_output}} is the one reserved variable
        assert!(validate_spec(
            r#"{"action":"sequence","steps":[{"project_path":"/p","prompt":"{{previous_output}}"}]}"#
        )
        .is_ok());
    }

    #[test]
    fn read_tolerance_extra_fields_pass() {
        let spec = validate_spec(
            r#"{"action":"prompt","project_path":"/p","prompt":"x","model":"haiku","future_field":42}"#,
        )
        .unwrap();
        assert!(matches!(spec, RunSpec::Prompt { model: Some(m), .. } if m == "haiku"));
    }
}
