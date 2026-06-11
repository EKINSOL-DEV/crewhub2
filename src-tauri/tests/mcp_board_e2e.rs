//! Agent-driven board MCP e2e (M3 T13, EKI-97, plan §3.3c): the fake-claude
//! `mcp-board` scenario runs headless against a real HTTP MCP server and
//! drives the board the way a live agent would — `create_task` with
//! `acting_as`, then `update_task_status` on the id it got back. The store
//! must end up with the task row, the attributed timeline rows and the
//! `TaskChanged` DomainEvents the rendering fold (D-M3-2) consumes.

use std::sync::Arc;

use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::mcp::server::McpServer;
use crewhub2_lib::store::agents::NewAgent;
use crewhub2_lib::store::rooms::NewRoom;
use crewhub2_lib::store::Store;
use tokio::sync::broadcast;

#[tokio::test(flavor = "multi_thread")]
async fn mcp_board_scenario_creates_and_moves_a_task_attributed() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (tx, mut rx) = broadcast::channel(64);
    let server = McpServer::start(store.clone(), tx).await.unwrap();

    let room = store
        .create_room(NewRoom {
            project_id: None,
            name: "Lab".into(),
            icon: None,
            color: None,
            is_hq: None,
        })
        .unwrap();
    let bot = store
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

    // The mcp-board scenario: a headless "run" that files a card and moves it
    // to review mid-stream. ${ROOM_ID}/${AGENT_ID} substitute from env; the
    // created task's id is captured (`save`) and reused for the move.
    let dir = tempfile::tempdir().unwrap();
    let scenario = dir.path().join("mcp-board.jsonl");
    std::fs::write(
        &scenario,
        concat!(
            r#"{"emit":{"type":"system","subtype":"init","session_id":"fake-mcp-board"}}"#,
            "\n",
            r#"{"mcp_call":{"name":"create_task","arguments":{"title":"From the crew 🛠️","room_id":"${ROOM_ID}","priority":"high","acting_as":"${AGENT_ID}"},"save":{"TASK_ID":"/structuredContent/task/id"}}}"#,
            "\n",
            r#"{"sleep_ms":10}"#,
            "\n",
            r#"{"mcp_call":{"name":"update_task_status","arguments":{"task_id":"${TASK_ID}","status":"review","acting_as":"${AGENT_ID}"}}}"#,
            "\n",
            r#"{"emit":{"type":"result","subtype":"success","session_id":"fake-mcp-board"}}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    )
    .unwrap();

    let output = tokio::process::Command::new(env!("CARGO_BIN_EXE_fake-claude"))
        .env("FAKE_CLAUDE_SCENARIO", &scenario)
        .env("CREWHUB_MCP_URL", server.url())
        .env("CREWHUB_MCP_TOKEN", server.token())
        .env("ROOM_ID", &room.id)
        .env("AGENT_ID", &bot.id)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .expect("fake-claude should spawn");
    assert!(
        output.status.success(),
        "fake-claude failed: {}\n{}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    // Task row: created over HTTP, attributed, and moved to review.
    let actor = format!("agent:{}", bot.id);
    let tasks = store.list_tasks().unwrap();
    assert_eq!(tasks.len(), 1, "exactly one task filed by the run");
    let task = &tasks[0];
    assert_eq!(task.title, "From the crew 🛠️");
    assert_eq!(task.room_id.as_deref(), Some(room.id.as_str()));
    assert_eq!(task.priority, "high");
    assert_eq!(task.created_by, actor);
    assert_eq!(task.status, "review");

    // Timeline: created + status_changed, both honestly attributed (D-M3-4).
    let events = store.list_task_events(&task.id).unwrap();
    let summary: Vec<(&str, &str)> = events
        .iter()
        .map(|e| (e.event_type.as_str(), e.actor.as_str()))
        .collect();
    assert_eq!(
        summary,
        vec![
            ("created", actor.as_str()),
            ("status_changed", actor.as_str())
        ]
    );

    // DomainEvents: one TaskChanged per mutation — the board fold's live feed.
    let mut changed = 0;
    while let Ok(ev) = rx.try_recv() {
        if matches!(&ev, DomainEvent::TaskChanged { task_id } if *task_id == task.id) {
            changed += 1;
        }
    }
    assert_eq!(changed, 2, "create + move each emit TaskChanged");
}
