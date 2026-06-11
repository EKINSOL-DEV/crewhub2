//! Task event timeline (M3 T1, D-M3-3 / G1).
//!
//! `task_events` is the single record of "what happened to a card": the detail
//! drawer's timeline, the run↔task linkage and the notification source. Events
//! are written HERE in the store layer (via the `_as` wrappers below), so human
//! IPC and MCP tools produce identical rows. Both the event vocabulary and the
//! actor format are CLOSED (D-M3-3): anything else is rejected at write time.

use super::tasks::Task;
use super::Store;
use serde::{Deserialize, Serialize};

/// Closed event vocabulary (D-M3-3). One source of truth — the v1 lesson of
/// 3×-duplicated config; lives next to [`super::tasks::TASK_STATUSES`].
pub const TASK_EVENT_TYPES: &[&str] = &[
    "created",
    "status_changed",
    "assigned",
    "run_started",
    "run_finished",
    "status_update",
];

/// Closed actor vocabulary (D-M3-3): `human` | `agent:<agent_id>` | `mcp`.
pub const ACTOR_HUMAN: &str = "human";
/// Unattributed MCP fallback (a tool call without a validated `acting_as`).
pub const ACTOR_MCP: &str = "mcp";

/// The attributed-actor form: `agent:<agent_id>`.
pub fn agent_actor(agent_id: &str) -> String {
    format!("agent:{agent_id}")
}

/// True iff `actor` is one of the closed forms of D-M3-3.
pub fn is_valid_actor(actor: &str) -> bool {
    actor == ACTOR_HUMAN
        || actor == ACTOR_MCP
        || actor
            .strip_prefix("agent:")
            .is_some_and(|id| !id.is_empty())
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct TaskEvent {
    pub id: String,
    pub task_id: String,
    pub event_type: String,
    pub actor: String,
    pub payload_json: Option<String>,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub created_at: i64,
}

fn row_to_event(r: &rusqlite::Row) -> rusqlite::Result<TaskEvent> {
    Ok(TaskEvent {
        id: r.get("id")?,
        task_id: r.get("task_id")?,
        event_type: r.get("event_type")?,
        actor: r.get("actor")?,
        payload_json: r.get("payload_json")?,
        created_at: r.get("created_at")?,
    })
}

impl Store {
    /// Append one event to a task's timeline. Vocabularies are closed:
    /// unknown `event_type`s and malformed actors are bugs, not data.
    pub fn record_task_event(
        &self,
        task_id: &str,
        event_type: &str,
        actor: &str,
        payload: Option<serde_json::Value>,
    ) -> anyhow::Result<TaskEvent> {
        if !TASK_EVENT_TYPES.contains(&event_type) {
            anyhow::bail!(
                "invalid task event type: {event_type:?} (valid: {})",
                TASK_EVENT_TYPES.join(", ")
            );
        }
        if !is_valid_actor(actor) {
            anyhow::bail!("invalid actor: {actor:?} (valid: human | agent:<id> | mcp)");
        }
        let event = TaskEvent {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: task_id.into(),
            event_type: event_type.into(),
            actor: actor.into(),
            payload_json: payload.map(|p| p.to_string()),
            created_at: Self::now_ms(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO task_events (id, task_id, event_type, actor, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                event.id,
                event.task_id,
                event.event_type,
                event.actor,
                event.payload_json,
                event.created_at
            ],
        )?;
        Ok(event)
    }

    /// A task's timeline, oldest first (insertion order breaks same-ms ties).
    pub fn list_task_events(&self, task_id: &str) -> anyhow::Result<Vec<TaskEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT * FROM task_events WHERE task_id = ?1 ORDER BY created_at, rowid")?;
        let rows = stmt.query_map([task_id], row_to_event)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// [`Store::create_task`] + a `created` timeline event attributed to
    /// `actor` — the one code path shared by IPC (`human`) and MCP
    /// (`agent:<id>` / `mcp`).
    pub fn create_task_as(&self, new: super::tasks::NewTask, actor: &str) -> anyhow::Result<Task> {
        let task = self.create_task(new)?;
        self.record_task_event(
            &task.id,
            "created",
            actor,
            Some(serde_json::json!({ "title": task.title })),
        )?;
        Ok(task)
    }

    /// [`Store::update_task`] + diff-detected timeline events: a
    /// `status_changed { from, to }` when the status differs and an
    /// `assigned { agent_id }` when the assignee differs (null = unassigned).
    pub fn update_task_as(&self, task: Task, actor: &str) -> anyhow::Result<Task> {
        let before = self
            .get_task(&task.id)?
            .ok_or_else(|| anyhow::anyhow!("task not found: {}", task.id))?;
        let task = self.update_task(task)?;
        if before.status != task.status {
            self.record_task_event(
                &task.id,
                "status_changed",
                actor,
                Some(serde_json::json!({ "from": before.status, "to": task.status })),
            )?;
        }
        if before.assignee_agent_id != task.assignee_agent_id {
            self.record_task_event(
                &task.id,
                "assigned",
                actor,
                Some(serde_json::json!({ "agent_id": task.assignee_agent_id })),
            )?;
        }
        Ok(task)
    }

    /// Run-with-agent linkage (D-M3-3): a card's "linked session" is the
    /// newest `run_started` without a matching `run_finished`.
    pub fn record_task_run_started(
        &self,
        task_id: &str,
        session_provider: &str,
        session_id: &str,
        agent_id: Option<&str>,
    ) -> anyhow::Result<TaskEvent> {
        self.record_task_event(
            task_id,
            "run_started",
            ACTOR_HUMAN,
            Some(serde_json::json!({
                "session_id": session_id,
                "agent_id": agent_id,
                "provider": session_provider,
            })),
        )
    }

    /// The matching close of [`Store::record_task_run_started`].
    pub fn record_task_run_finished(
        &self,
        task_id: &str,
        session_id: &str,
        outcome: &str,
    ) -> anyhow::Result<TaskEvent> {
        self.record_task_event(
            task_id,
            "run_finished",
            ACTOR_HUMAN,
            Some(serde_json::json!({ "session_id": session_id, "outcome": outcome })),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tasks::NewTask;

    fn new_task(title: &str) -> NewTask {
        NewTask {
            project_id: None,
            room_id: None,
            title: title.into(),
            description: None,
            priority: None,
            assignee_agent_id: None,
            created_by: None,
        }
    }

    fn payload(e: &TaskEvent) -> serde_json::Value {
        serde_json::from_str(e.payload_json.as_deref().unwrap()).unwrap()
    }

    #[test]
    fn actor_vocabulary_is_closed() {
        assert!(is_valid_actor("human"));
        assert!(is_valid_actor("mcp"));
        assert!(is_valid_actor("agent:abc-123"));
        assert!(!is_valid_actor("agent:"));
        assert!(!is_valid_actor("robot"));
        assert!(!is_valid_actor(""));
        assert_eq!(agent_actor("a1"), "agent:a1");
    }

    #[test]
    fn record_rejects_unknown_event_type_and_actor() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task(new_task("X")).unwrap();
        let err = s
            .record_task_event(&t.id, "vibed", ACTOR_HUMAN, None)
            .unwrap_err();
        assert!(err.to_string().contains("invalid task event type"));
        let err = s
            .record_task_event(&t.id, "created", "robot", None)
            .unwrap_err();
        assert!(err.to_string().contains("invalid actor"));
        assert!(s.list_task_events(&t.id).unwrap().is_empty());
    }

    #[test]
    fn record_rejects_unknown_task_via_foreign_key() {
        let s = Store::open_in_memory().unwrap();
        let err = s
            .record_task_event("ghost", "created", ACTOR_HUMAN, None)
            .unwrap_err();
        assert!(err.to_string().contains("FOREIGN KEY"), "got: {err}");
    }

    #[test]
    fn list_is_ascending_with_stable_same_ms_order() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task(new_task("X")).unwrap();
        for ty in ["created", "status_changed", "status_update"] {
            s.record_task_event(&t.id, ty, ACTOR_HUMAN, None).unwrap();
        }
        let types: Vec<_> = s
            .list_task_events(&t.id)
            .unwrap()
            .into_iter()
            .map(|e| e.event_type)
            .collect();
        assert_eq!(types, vec!["created", "status_changed", "status_update"]);
    }

    #[test]
    fn create_task_as_writes_created_event() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task_as(new_task("Ship it"), ACTOR_MCP).unwrap();
        let events = s.list_task_events(&t.id).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "created");
        assert_eq!(events[0].actor, "mcp");
        assert_eq!(payload(&events[0])["title"], "Ship it");
    }

    #[test]
    fn update_task_as_diffs_status_and_assignee() {
        let s = Store::open_in_memory().unwrap();
        let agent = s
            .create_agent(crate::store::agents::NewAgent {
                name: "Botje".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        let t = s.create_task_as(new_task("X"), ACTOR_HUMAN).unwrap();

        // no diff -> no new events
        let t = s.update_task_as(t, ACTOR_HUMAN).unwrap();
        assert_eq!(s.list_task_events(&t.id).unwrap().len(), 1);

        // status + assignee diff in one update -> two events
        let mut t2 = t.clone();
        t2.status = "in_progress".into();
        t2.assignee_agent_id = Some(agent.id.clone());
        let t2 = s.update_task_as(t2, &agent_actor(&agent.id)).unwrap();
        let events = s.list_task_events(&t2.id).unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events[1].event_type, "status_changed");
        assert_eq!(events[1].actor, format!("agent:{}", agent.id));
        assert_eq!(payload(&events[1])["from"], "todo");
        assert_eq!(payload(&events[1])["to"], "in_progress");
        assert_eq!(events[2].event_type, "assigned");
        assert_eq!(payload(&events[2])["agent_id"], agent.id.as_str());

        // unassign -> assigned event with null agent_id
        let mut t3 = t2.clone();
        t3.assignee_agent_id = None;
        let t3 = s.update_task_as(t3, ACTOR_HUMAN).unwrap();
        let events = s.list_task_events(&t3.id).unwrap();
        assert_eq!(events.last().unwrap().event_type, "assigned");
        assert!(payload(events.last().unwrap())["agent_id"].is_null());
    }

    #[test]
    fn update_task_as_unknown_task_is_an_error() {
        let s = Store::open_in_memory().unwrap();
        let mut t = s.create_task(new_task("X")).unwrap();
        s.delete_task(&t.id).unwrap();
        t.status = "done".into();
        let err = s.update_task_as(t, ACTOR_HUMAN).unwrap_err();
        assert!(err.to_string().contains("task not found"), "got: {err}");
    }

    #[test]
    fn run_event_pair_carries_linkage_payloads() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task_as(new_task("X"), ACTOR_HUMAN).unwrap();
        let started = s
            .record_task_run_started(&t.id, "claude-code", "sess-9", Some("agent-1"))
            .unwrap();
        assert_eq!(started.event_type, "run_started");
        assert_eq!(started.actor, "human");
        assert_eq!(payload(&started)["session_id"], "sess-9");
        assert_eq!(payload(&started)["provider"], "claude-code");
        assert_eq!(payload(&started)["agent_id"], "agent-1");

        let finished = s
            .record_task_run_finished(&t.id, "sess-9", "review")
            .unwrap();
        assert_eq!(finished.event_type, "run_finished");
        assert_eq!(payload(&finished)["outcome"], "review");
        assert_eq!(s.list_task_events(&t.id).unwrap().len(), 3);
    }

    /// G9 (cascade-delete semantics): deleting a task — directly or via a
    /// project/room cascade — silently drops its events. There are NO
    /// per-task DomainEvents for cascades; the frontend re-seeds on
    /// `ProjectChanged`/`RoomChanged` instead (D-M3-2).
    #[test]
    fn deleting_task_or_project_cascades_events() {
        let s = Store::open_in_memory().unwrap();
        let p = s
            .create_project(crate::store::projects::NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: "/tmp/p".into(),
                docs_path: None,
            })
            .unwrap();
        let t = s
            .create_task_as(
                NewTask {
                    project_id: Some(p.id.clone()),
                    ..new_task("X")
                },
                ACTOR_HUMAN,
            )
            .unwrap();
        assert_eq!(s.list_task_events(&t.id).unwrap().len(), 1);
        assert!(s.delete_project(&p.id).unwrap());
        assert!(s.get_task(&t.id).unwrap().is_none(), "task cascaded");
        assert!(
            s.list_task_events(&t.id).unwrap().is_empty(),
            "events cascaded with the task"
        );
    }
}
