//! CrewHub MCP tools (T20 `list_crew`, T21 task tools, T22 context & messaging).
//!
//! Domain failures (unknown ids, invalid enum values) come back as MCP *tool
//! errors* (`isError: true`) so the calling model can read and correct them;
//! infrastructure failures map to JSON-RPC errors. Every mutation broadcasts
//! a [`DomainEvent`] on the internal channel (see `mcp/mod.rs`).

use std::sync::Arc;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, Implementation, ServerCapabilities, ServerInfo};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::broadcast;

use crate::events::DomainEvent;
use crate::store::rooms::Room;
use crate::store::tasks::NewTask;
use crate::store::Store;

/// Valid task statuses (mirrors the CHECK constraint in migration 001).
pub const TASK_STATUSES: &[&str] = &["todo", "in_progress", "review", "done", "blocked"];
/// Valid task priorities (mirrors the CHECK constraint in migration 001).
pub const TASK_PRIORITIES: &[&str] = &["low", "medium", "high", "urgent"];
/// Attribution recorded on rows created through the MCP server.
pub const MCP_ACTOR: &str = "agent:mcp";

/// The MCP service: one instance is constructed per request (stateless mode),
/// all sharing the same store and notify channel.
pub struct CrewHubMcp {
    store: Arc<Store>,
    notify: broadcast::Sender<DomainEvent>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksParams {
    /// Only tasks belonging to this project.
    #[serde(default)]
    pub project_id: Option<String>,
    /// Only tasks on this room's board.
    #[serde(default)]
    pub room_id: Option<String>,
    /// Only tasks with this status: todo | in_progress | review | done | blocked.
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskParams {
    /// Short task title.
    pub title: String,
    /// Room whose board the task appears on (required — tasks without a room
    /// are invisible).
    pub room_id: String,
    /// Longer task description (markdown allowed).
    #[serde(default)]
    pub description: Option<String>,
    /// low | medium | high | urgent (default: medium).
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskStatusParams {
    /// Id of the task to move.
    pub task_id: String,
    /// New status: todo | in_progress | review | done | blocked.
    pub status: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PostStatusUpdateParams {
    /// The status update text.
    pub text: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetRoomContextParams {
    /// Room to fetch context for; defaults to the HQ room when omitted.
    #[serde(default)]
    pub room_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SendMessageParams {
    /// Id of the agent to message.
    pub agent_id: String,
    /// Message text.
    pub text: String,
}

#[tool_router]
impl CrewHubMcp {
    pub fn new(store: Arc<Store>, notify: broadcast::Sender<DomainEvent>) -> Self {
        Self { store, notify }
    }

    fn emit(&self, event: DomainEvent) {
        // No subscribers (e.g. headless tests) is fine.
        let _ = self.notify.send(event);
    }

    #[tool(description = "List all CrewHub crew members (agents).")]
    fn list_crew(&self) -> Result<CallToolResult, ErrorData> {
        let agents = self.store.list_agents().map_err(internal)?;
        Ok(CallToolResult::structured(json!({ "agents": agents })))
    }

    #[tool(
        description = "List tasks on the CrewHub board, optionally filtered by project, room and/or status."
    )]
    fn list_tasks(
        &self,
        Parameters(p): Parameters<ListTasksParams>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Some(status) = &p.status {
            if !TASK_STATUSES.contains(&status.as_str()) {
                return Ok(invalid_value_error("status", status, TASK_STATUSES));
            }
        }
        let tasks: Vec<_> = self
            .store
            .list_tasks()
            .map_err(internal)?
            .into_iter()
            .filter(|t| {
                p.project_id
                    .as_ref()
                    .is_none_or(|id| t.project_id.as_deref() == Some(id))
                    && p.room_id
                        .as_ref()
                        .is_none_or(|id| t.room_id.as_deref() == Some(id))
                    && p.status.as_ref().is_none_or(|s| &t.status == s)
            })
            .collect();
        Ok(CallToolResult::structured(json!({ "tasks": tasks })))
    }

    #[tool(
        description = "Create a task on a room's board. room_id is required: tasks without a room do not show up anywhere."
    )]
    fn create_task(
        &self,
        Parameters(p): Parameters<CreateTaskParams>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Some(priority) = &p.priority {
            if !TASK_PRIORITIES.contains(&priority.as_str()) {
                return Ok(invalid_value_error("priority", priority, TASK_PRIORITIES));
            }
        }
        let Some(room) = self.store.get_room(&p.room_id).map_err(internal)? else {
            return Ok(tool_error(format!("room not found: {}", p.room_id)));
        };
        let task = self
            .store
            .create_task(NewTask {
                project_id: room.project_id,
                room_id: Some(room.id),
                title: p.title,
                description: p.description,
                priority: p.priority,
                assignee_agent_id: None,
                created_by: Some(MCP_ACTOR.into()),
            })
            .map_err(internal)?;
        self.emit(DomainEvent::TaskChanged {
            task_id: task.id.clone(),
        });
        Ok(CallToolResult::structured(json!({ "task": task })))
    }

    #[tool(description = "Move a task to a new status on the board.")]
    fn update_task_status(
        &self,
        Parameters(p): Parameters<UpdateTaskStatusParams>,
    ) -> Result<CallToolResult, ErrorData> {
        if !TASK_STATUSES.contains(&p.status.as_str()) {
            return Ok(invalid_value_error("status", &p.status, TASK_STATUSES));
        }
        let Some(mut task) = self.store.get_task(&p.task_id).map_err(internal)? else {
            return Ok(tool_error(format!("task not found: {}", p.task_id)));
        };
        task.status = p.status;
        let task = self.store.update_task(task).map_err(internal)?;
        self.emit(DomainEvent::TaskChanged {
            task_id: task.id.clone(),
        });
        Ok(CallToolResult::structured(json!({ "task": task })))
    }

    #[tool(description = "Post a short status update visible to the CrewHub user.")]
    fn post_status_update(
        &self,
        Parameters(p): Parameters<PostStatusUpdateParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let update = json!({ "text": p.text, "by": MCP_ACTOR, "ts": Store::now_ms() });
        self.store
            .set_setting("last_status_update", &update.to_string())
            .map_err(internal)?;
        self.emit(DomainEvent::SettingChanged {
            key: "last_status_update".into(),
        });
        Ok(CallToolResult::structured(json!({ "posted": update })))
    }

    #[tool(
        description = "Get the context envelope for a room: the room itself, its project and its open tasks. Defaults to the HQ room when room_id is omitted."
    )]
    fn get_room_context(
        &self,
        Parameters(p): Parameters<GetRoomContextParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let room = match &p.room_id {
            Some(id) => self.store.get_room(id).map_err(internal)?,
            None => default_room(&self.store.list_rooms().map_err(internal)?),
        };
        let Some(room) = room else {
            return Ok(tool_error(match p.room_id {
                Some(id) => format!("room not found: {id}"),
                None => "no rooms exist yet".into(),
            }));
        };
        let project = match &room.project_id {
            Some(id) => self.store.get_project(id).map_err(internal)?,
            None => None,
        };
        let open_tasks: Vec<_> = self
            .store
            .list_tasks()
            .map_err(internal)?
            .into_iter()
            .filter(|t| t.room_id.as_deref() == Some(&room.id) && t.status != "done")
            .collect();
        Ok(CallToolResult::structured(json!({
            "room": room,
            "project": project,
            "open_tasks": open_tasks,
        })))
    }

    // TODO(T22 follow-up): once lib.rs wires the engine ProviderRegistry to the
    // MCP server, route to the target agent's managed session via provider
    // `send`; until then messages land in a settings-backed inbox the UI can
    // poll/display.
    #[tool(
        description = "Send a message to another crew member (agent). Delivered to the agent's CrewHub inbox."
    )]
    fn send_message_to_agent(
        &self,
        Parameters(p): Parameters<SendMessageParams>,
    ) -> Result<CallToolResult, ErrorData> {
        if self
            .store
            .get_agent(&p.agent_id)
            .map_err(internal)?
            .is_none()
        {
            return Ok(tool_error(format!("agent not found: {}", p.agent_id)));
        }
        let key = format!("agent_inbox:{}", p.agent_id);
        let mut inbox: Vec<serde_json::Value> = self
            .store
            .get_setting(&key)
            .map_err(internal)?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        let message = json!({ "text": p.text, "from": MCP_ACTOR, "ts": Store::now_ms() });
        inbox.push(message.clone());
        self.store
            .set_setting(&key, &serde_json::to_string(&inbox).map_err(internal)?)
            .map_err(internal)?;
        self.emit(DomainEvent::SettingChanged { key });
        Ok(CallToolResult::structured(json!({ "delivered": message })))
    }
}

#[tool_handler]
impl ServerHandler for CrewHubMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::new(ServerCapabilities::builder().enable_tools().build());
        info.server_info = Implementation::new("crewhub", env!("CARGO_PKG_VERSION"));
        info.instructions = Some(
            "CrewHub crew & task board. Use the tools to inspect the crew, manage tasks \
             (create_task requires a room_id), fetch room context and message other agents."
                .into(),
        );
        info
    }
}

/// HQ room if one exists, otherwise the first room by board order.
fn default_room(rooms: &[Room]) -> Option<Room> {
    rooms
        .iter()
        .find(|r| r.is_hq)
        .or_else(|| rooms.first())
        .cloned()
}

fn internal(e: impl std::fmt::Display) -> ErrorData {
    ErrorData::internal_error(e.to_string(), None)
}

/// Domain failure surfaced to the calling model (not a protocol error).
fn tool_error(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![Content::text(message)])
}

fn invalid_value_error(field: &str, got: &str, valid: &[&str]) -> CallToolResult {
    tool_error(format!(
        "invalid {field}: {got:?} (valid: {})",
        valid.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::agents::NewAgent;
    use crate::store::rooms::NewRoom;

    fn mcp() -> (CrewHubMcp, broadcast::Receiver<DomainEvent>) {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let (tx, rx) = broadcast::channel(16);
        (CrewHubMcp::new(store, tx), rx)
    }

    fn room(mcp: &CrewHubMcp, name: &str) -> Room {
        mcp.store
            .create_room(NewRoom {
                project_id: None,
                name: name.into(),
                icon: None,
                color: None,
                is_hq: None,
            })
            .unwrap()
    }

    fn structured(result: &CallToolResult) -> &serde_json::Value {
        assert_ne!(result.is_error, Some(true), "unexpected tool error");
        result.structured_content.as_ref().expect("structured")
    }

    fn is_tool_error(result: &CallToolResult) -> bool {
        result.is_error == Some(true)
    }

    #[test]
    fn router_exposes_all_seven_tools() {
        let mut names: Vec<_> = CrewHubMcp::tool_router()
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec![
                "create_task",
                "get_room_context",
                "list_crew",
                "list_tasks",
                "post_status_update",
                "send_message_to_agent",
                "update_task_status",
            ]
        );
    }

    #[test]
    fn list_crew_returns_agents() {
        let (mcp, _rx) = mcp();
        mcp.store
            .create_agent(NewAgent {
                name: "Botje".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        let result = mcp.list_crew().unwrap();
        let agents = structured(&result)["agents"].as_array().unwrap().clone();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0]["name"], "Botje");
    }

    #[test]
    fn create_task_requires_existing_room_and_emits() {
        let (mcp, mut rx) = mcp();
        let missing = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "X".into(),
                room_id: "nope".into(),
                description: None,
                priority: None,
            }))
            .unwrap();
        assert!(is_tool_error(&missing));

        let room = room(&mcp, "Lab");
        let result = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "Ship it".into(),
                room_id: room.id.clone(),
                description: Some("desc".into()),
                priority: Some("high".into()),
            }))
            .unwrap();
        let task = &structured(&result)["task"];
        assert_eq!(task["created_by"], MCP_ACTOR);
        assert_eq!(task["room_id"], room.id.as_str());
        assert_eq!(task["priority"], "high");
        let task_id = task["id"].as_str().unwrap();
        assert!(mcp.store.get_task(task_id).unwrap().is_some());
        assert!(
            matches!(rx.try_recv(), Ok(DomainEvent::TaskChanged { task_id: id }) if id == task_id)
        );
    }

    #[test]
    fn create_task_rejects_bad_priority() {
        let (mcp, _rx) = mcp();
        let room = room(&mcp, "Lab");
        let result = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "X".into(),
                room_id: room.id,
                description: None,
                priority: Some("asap".into()),
            }))
            .unwrap();
        assert!(is_tool_error(&result));
    }

    #[test]
    fn create_task_inherits_project_from_room() {
        let (mcp, _rx) = mcp();
        let project = mcp
            .store
            .create_project(crate::store::projects::NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: "/tmp/p".into(),
                docs_path: None,
            })
            .unwrap();
        let room = mcp
            .store
            .create_room(NewRoom {
                project_id: Some(project.id.clone()),
                name: "Lab".into(),
                icon: None,
                color: None,
                is_hq: None,
            })
            .unwrap();
        let result = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "X".into(),
                room_id: room.id,
                description: None,
                priority: None,
            }))
            .unwrap();
        assert_eq!(structured(&result)["task"]["project_id"], project.id);
    }

    #[test]
    fn update_task_status_validates_and_emits() {
        let (mcp, mut rx) = mcp();
        let room = room(&mcp, "Lab");
        let created = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "X".into(),
                room_id: room.id,
                description: None,
                priority: None,
            }))
            .unwrap();
        let task_id = structured(&created)["task"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        let _ = rx.try_recv(); // drain create event

        let bad = mcp
            .update_task_status(Parameters(UpdateTaskStatusParams {
                task_id: task_id.clone(),
                status: "nonsense".into(),
            }))
            .unwrap();
        assert!(is_tool_error(&bad));
        assert!(rx.try_recv().is_err(), "invalid update must not emit");

        let missing = mcp
            .update_task_status(Parameters(UpdateTaskStatusParams {
                task_id: "nope".into(),
                status: "done".into(),
            }))
            .unwrap();
        assert!(is_tool_error(&missing));

        let ok = mcp
            .update_task_status(Parameters(UpdateTaskStatusParams {
                task_id: task_id.clone(),
                status: "in_progress".into(),
            }))
            .unwrap();
        assert_eq!(structured(&ok)["task"]["status"], "in_progress");
        assert_eq!(
            mcp.store.get_task(&task_id).unwrap().unwrap().status,
            "in_progress"
        );
        assert!(
            matches!(rx.try_recv(), Ok(DomainEvent::TaskChanged { task_id: id }) if id == task_id)
        );
    }

    #[test]
    fn list_tasks_filters_by_room_and_status() {
        let (mcp, _rx) = mcp();
        let a = room(&mcp, "A");
        let b = room(&mcp, "B");
        for (title, room_id) in [("t1", &a.id), ("t2", &a.id), ("t3", &b.id)] {
            mcp.create_task(Parameters(CreateTaskParams {
                title: title.into(),
                room_id: room_id.clone(),
                description: None,
                priority: None,
            }))
            .unwrap();
        }
        let result = mcp
            .list_tasks(Parameters(ListTasksParams {
                project_id: None,
                room_id: Some(a.id.clone()),
                status: Some("todo".into()),
            }))
            .unwrap();
        assert_eq!(structured(&result)["tasks"].as_array().unwrap().len(), 2);

        let bad = mcp
            .list_tasks(Parameters(ListTasksParams {
                project_id: None,
                room_id: None,
                status: Some("bogus".into()),
            }))
            .unwrap();
        assert!(is_tool_error(&bad));
    }

    #[test]
    fn post_status_update_persists_and_emits() {
        let (mcp, mut rx) = mcp();
        let result = mcp
            .post_status_update(Parameters(PostStatusUpdateParams {
                text: "halfway there".into(),
            }))
            .unwrap();
        assert_eq!(structured(&result)["posted"]["text"], "halfway there");
        let stored = mcp
            .store
            .get_setting("last_status_update")
            .unwrap()
            .unwrap();
        let stored: serde_json::Value = serde_json::from_str(&stored).unwrap();
        assert_eq!(stored["text"], "halfway there");
        assert_eq!(stored["by"], MCP_ACTOR);
        assert!(matches!(
            rx.try_recv(),
            Ok(DomainEvent::SettingChanged { key }) if key == "last_status_update"
        ));
    }

    #[test]
    fn get_room_context_builds_envelope_and_defaults_to_hq() {
        let (mcp, _rx) = mcp();
        let lab = room(&mcp, "Lab");
        let hq = mcp
            .store
            .create_room(NewRoom {
                project_id: None,
                name: "HQ".into(),
                icon: None,
                color: None,
                is_hq: Some(true),
            })
            .unwrap();
        mcp.create_task(Parameters(CreateTaskParams {
            title: "open".into(),
            room_id: lab.id.clone(),
            description: None,
            priority: None,
        }))
        .unwrap();
        let done = mcp
            .create_task(Parameters(CreateTaskParams {
                title: "done".into(),
                room_id: lab.id.clone(),
                description: None,
                priority: None,
            }))
            .unwrap();
        mcp.update_task_status(Parameters(UpdateTaskStatusParams {
            task_id: structured(&done)["task"]["id"].as_str().unwrap().into(),
            status: "done".into(),
        }))
        .unwrap();

        let ctx = mcp
            .get_room_context(Parameters(GetRoomContextParams {
                room_id: Some(lab.id.clone()),
            }))
            .unwrap();
        let envelope = structured(&ctx);
        assert_eq!(envelope["room"]["id"], lab.id.as_str());
        assert!(envelope["project"].is_null());
        let open = envelope["open_tasks"].as_array().unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0]["title"], "open");

        let default = mcp
            .get_room_context(Parameters(GetRoomContextParams { room_id: None }))
            .unwrap();
        assert_eq!(structured(&default)["room"]["id"], hq.id.as_str());
    }

    #[test]
    fn get_room_context_with_no_rooms_is_tool_error() {
        let (mcp, _rx) = mcp();
        let result = mcp
            .get_room_context(Parameters(GetRoomContextParams { room_id: None }))
            .unwrap();
        assert!(is_tool_error(&result));
    }

    #[test]
    fn send_message_appends_to_inbox_and_emits() {
        let (mcp, mut rx) = mcp();
        let missing = mcp
            .send_message_to_agent(Parameters(SendMessageParams {
                agent_id: "nope".into(),
                text: "hi".into(),
            }))
            .unwrap();
        assert!(is_tool_error(&missing));

        let agent = mcp
            .store
            .create_agent(NewAgent {
                name: "Botje".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        for text in ["first", "second"] {
            let result = mcp
                .send_message_to_agent(Parameters(SendMessageParams {
                    agent_id: agent.id.clone(),
                    text: text.into(),
                }))
                .unwrap();
            assert_eq!(structured(&result)["delivered"]["text"], text);
        }
        let key = format!("agent_inbox:{}", agent.id);
        let inbox: Vec<serde_json::Value> =
            serde_json::from_str(&mcp.store.get_setting(&key).unwrap().unwrap()).unwrap();
        assert_eq!(inbox.len(), 2);
        assert_eq!(inbox[0]["text"], "first");
        assert_eq!(inbox[1]["text"], "second");
        assert!(matches!(
            rx.try_recv(),
            Ok(DomainEvent::SettingChanged { key: k }) if k == key
        ));
    }
}
