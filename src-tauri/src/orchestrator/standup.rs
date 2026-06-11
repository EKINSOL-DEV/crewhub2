//! Standup engine (16.4, D-M4-7): one short headless run per participating
//! agent — haiku by default, concurrency capped at 2, 60 s per agent — and
//! HONEST about silence: a failed/timeout/unparseable response records
//! "(no response 🤷)" instead of hanging or faking an answer.

use crate::orchestrator::action_items::fenced_blocks;
use crate::orchestrator::meeting::{cap_text, TURN_CAP_BYTES};
use crate::orchestrator::substitute::substitute;
use crate::orchestrator::DriverCtx;
use crate::store::agents::Agent;
use serde_json::Value;
use std::sync::Arc;

/// Fan-out bound (master-plan R5: short and bounded).
pub const STANDUP_CONCURRENCY: usize = 2;
/// Per-agent wall clock budget.
pub const STANDUP_TIMEOUT_MS: u64 = 60_000;
/// Recent-activity window: last ≤50 transcript items of the latest session.
pub const ACTIVITY_ITEM_WINDOW: u64 = 50;
/// The honest no-answer marker (Coffee Standup renders it as cold coffee).
pub const NO_RESPONSE: &str = "(no response 🤷)";

/// Appendix D scaffold — structure frozen, slots via `substitute`.
pub const STANDUP_SCAFFOLD: &str = r#"You are {{agent_name}}. Based on your recent activity and tasks below, write a standup.
Recent activity: {{activity}}
Open tasks: {{tasks}}
Reply with ONE fenced json block: {"yesterday": "...", "today": "...", "blockers": "..." | null}"#;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct StandupReply {
    pub yesterday: Option<String>,
    pub today: Option<String>,
    pub blockers: Option<String>,
}

/// Tolerant reply parser (same family as the action-items parser): the LAST
/// fenced JSON block carrying at least one expected key wins; anything else
/// (no block, broken JSON, alien shape) is `None` — the caller records the
/// honest no-response entry instead.
pub fn parse_standup_reply(text: &str) -> Option<StandupReply> {
    for (_, _, body) in fenced_blocks(text).into_iter().rev() {
        let Ok(v) = serde_json::from_str::<Value>(body.trim()) else {
            continue;
        };
        let Some(obj) = v.as_object() else { continue };
        if !["yesterday", "today", "blockers"]
            .iter()
            .any(|k| obj.contains_key(*k))
        {
            continue;
        }
        let s = |k: &str| {
            obj.get(k)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        };
        return Some(StandupReply {
            yesterday: s("yesterday"),
            today: s("today"),
            blockers: s("blockers"),
        });
    }
    None
}

/// Assemble one agent's standup prompt (pure given its inputs): open tasks
/// from the store + a bounded digest of recent activity.
pub fn build_standup_prompt(agent_name: &str, tasks: &str, activity: &str) -> String {
    substitute(
        STANDUP_SCAFFOLD,
        &[
            ("agent_name", agent_name),
            ("activity", activity),
            ("tasks", tasks),
        ],
    )
    .expect("standup scaffold slots are fixed")
}

/// The agent's open/in-progress tasks as prompt lines.
pub fn tasks_digest(tasks: &[crate::store::tasks::Task], agent_id: &str) -> String {
    let lines: Vec<String> = tasks
        .iter()
        .filter(|t| t.assignee_agent_id.as_deref() == Some(agent_id) && t.status != "done")
        .map(|t| format!("- [{}] {} ({})", t.status, t.title, t.priority))
        .collect();
    if lines.is_empty() {
        "(no open tasks)".to_string()
    } else {
        lines.join("\n")
    }
}

/// Digest of the agent's most recent bound session: last ≤50 transcript items
/// through the provider read path (offsets, bounded — never raw file access).
async fn activity_digest(ctx: &DriverCtx, agent_id: &str) -> String {
    let Ok(bindings) = ctx.store.list_session_bindings() else {
        return "(no recent activity)".into();
    };
    // bindings are ordered by updated_at DESC — first match is the latest
    let Some(binding) = bindings
        .iter()
        .find(|b| b.agent_id.as_deref() == Some(agent_id))
    else {
        return "(no recent activity)".into();
    };
    let Some(provider) = ctx
        .registry
        .headless_runner()
        .or_else(|| ctx.registry.spawner())
    else {
        return "(no recent activity)".into();
    };
    let sid = crate::engine::types::SessionId {
        provider: provider.id().to_string(),
        id: binding.session_id.clone(),
    };
    let Ok(probe) = provider.read_transcript(&sid, 0, 0).await else {
        return "(no recent activity)".into();
    };
    let offset = probe.total.saturating_sub(ACTIVITY_ITEM_WINDOW);
    let Ok(page) = provider
        .read_transcript(&sid, offset, ACTIVITY_ITEM_WINDOW as u32)
        .await
    else {
        return "(no recent activity)".into();
    };
    let mut out = String::new();
    for seq in page.items {
        use crate::engine::types::TranscriptItem::*;
        let line = match seq.item {
            UserText { text, .. } => Some(format!("user: {}", cap_text(&text, 200))),
            AssistantText { text, .. } => Some(format!("agent: {}", cap_text(&text, 200))),
            ToolUse { tool, .. } => Some(format!("tool: {tool}")),
            _ => None,
        };
        if let Some(line) = line {
            out.push_str(&line);
            out.push('\n');
        }
    }
    if out.is_empty() {
        "(no recent activity)".into()
    } else {
        cap_text(&out, TURN_CAP_BYTES)
    }
}

/// Run the whole standup fan-out to completion (the orchestrator's
/// `start_standup` spawns this; tests may await it directly).
pub(crate) async fn run_standup_fanout(ctx: DriverCtx, standup_id: String, agents: Vec<Agent>) {
    let model = crate::orchestrator::policy_model(
        &ctx.store,
        crate::orchestrator::MODEL_POLICY_STANDUP_KEY,
        crate::orchestrator::DEFAULT_STANDUP_MODEL,
    );
    let semaphore = Arc::new(tokio::sync::Semaphore::new(STANDUP_CONCURRENCY));
    let mut handles = Vec::new();
    for agent in agents {
        let ctx = ctx.clone();
        let standup_id = standup_id.clone();
        let model = model.clone();
        let semaphore = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await.expect("semaphore open");
            let reply = gather_one(&ctx, &agent, &model).await;
            let reply = reply.unwrap_or_else(|| StandupReply {
                yesterday: None,
                today: None,
                blockers: Some(NO_RESPONSE.into()),
            });
            let _ = ctx.store.add_standup_entry(
                &standup_id,
                &agent.id,
                reply.yesterday.as_deref(),
                reply.today.as_deref(),
                reply.blockers.as_deref(),
            );
            let _ = ctx.notify.send(crate::events::DomainEvent::StandupChanged {
                standup_id: standup_id.clone(),
            });
        }));
    }
    for h in handles {
        let _ = h.await;
    }
}

/// One agent's gathering run: build prompt, exec headless (policy model,
/// 60 s budget), parse tolerantly. `None` = no usable answer.
async fn gather_one(ctx: &DriverCtx, agent: &Agent, model: &str) -> Option<StandupReply> {
    let runner = ctx.registry.headless_runner()?;
    let tasks = ctx.store.list_tasks().unwrap_or_default();
    let tasks_text = tasks_digest(&tasks, &agent.id);
    let activity = activity_digest(ctx, &agent.id).await;
    let prompt = build_standup_prompt(&agent.name, &tasks_text, &activity);
    let project = agent
        .project_path
        .clone()
        .unwrap_or_else(|| std::env::temp_dir().display().to_string());
    let exec = tokio::time::timeout(
        std::time::Duration::from_millis(STANDUP_TIMEOUT_MS),
        runner.exec_headless(std::path::Path::new(&project), &prompt, Some(model)),
    )
    .await
    .ok()? // timeout
    .ok()?; // exec error
    if exec.status != "success" {
        return None;
    }
    parse_standup_reply(&exec.text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_reply_parses() {
        let text = "Here you go.\n```json\n{\"yesterday\":\"shipped\",\"today\":\"testing\",\"blockers\":null}\n```";
        let r = parse_standup_reply(text).unwrap();
        assert_eq!(r.yesterday.as_deref(), Some("shipped"));
        assert_eq!(r.today.as_deref(), Some("testing"));
        assert_eq!(r.blockers, None);
    }

    #[test]
    fn missing_fields_tolerated() {
        let r = parse_standup_reply("```json\n{\"today\":\"more tests\"}\n```").unwrap();
        assert_eq!(r.yesterday, None);
        assert_eq!(r.today.as_deref(), Some("more tests"));
    }

    #[test]
    fn last_relevant_block_wins() {
        let text = "```json\n{\"today\":\"old\"}\n```\n```json\n{\"today\":\"new\"}\n```";
        assert_eq!(
            parse_standup_reply(text).unwrap().today.as_deref(),
            Some("new")
        );
    }

    #[test]
    fn garbage_is_none_not_panic() {
        for s in [
            "",
            "no fence here",
            "```json\n{broken\n```",
            "```json\n{\"alien\":true}\n```",
            "```json\n[1,2]\n```",
        ] {
            assert_eq!(parse_standup_reply(s), None, "input: {s:?}");
        }
    }

    #[test]
    fn prompt_contains_name_tasks_and_activity() {
        let p = build_standup_prompt("Rusty", "- [todo] Fix flux (high)", "agent: refactored");
        assert!(p.contains("You are Rusty"));
        assert!(p.contains("Fix flux"));
        assert!(p.contains("refactored"));
        assert!(p.contains("fenced json block"));
    }

    #[test]
    fn tasks_digest_filters_by_agent_and_open_status() {
        use crate::store::Store;
        let s = Store::open_in_memory().unwrap();
        let agent = s
            .create_agent(crate::store::agents::NewAgent {
                name: "a".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        let mk = |title: &str, assignee: Option<&str>| crate::store::tasks::NewTask {
            project_id: None,
            room_id: None,
            title: title.into(),
            description: None,
            priority: None,
            assignee_agent_id: assignee.map(str::to_string),
            created_by: None,
        };
        s.create_task(mk("mine-open", Some(&agent.id))).unwrap();
        let mut done = s.create_task(mk("mine-done", Some(&agent.id))).unwrap();
        done.status = "done".into();
        s.update_task(done).unwrap();
        s.create_task(mk("not-mine", None)).unwrap();
        let digest = tasks_digest(&s.list_tasks().unwrap(), &agent.id);
        assert!(digest.contains("mine-open"));
        assert!(!digest.contains("mine-done"));
        assert!(!digest.contains("not-mine"));
        assert_eq!(tasks_digest(&[], &agent.id), "(no open tasks)");
    }
}
