//! MCP server integration (T20–T23): bearer auth, MCP handshake over raw
//! streamable HTTP, tool calls mutating the store + emitting DomainEvents,
//! and `claude mcp add/remove` registration against the fake CLI.

use std::sync::Arc;

use crewhub2_lib::engine::claude::registration::{self, McpCliConfig};
use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::mcp::server::McpServer;
use crewhub2_lib::store::rooms::NewRoom;
use crewhub2_lib::store::Store;
use serde_json::{json, Value};
use tokio::sync::broadcast;

async fn boot() -> (McpServer, Arc<Store>, broadcast::Receiver<DomainEvent>) {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (tx, rx) = broadcast::channel(64);
    let server = McpServer::start(store.clone(), tx).await.unwrap();
    (server, store, rx)
}

async fn post(server: &McpServer, token: Option<&str>, body: &Value) -> reqwest::Response {
    let mut req = reqwest::Client::new()
        .post(server.url())
        .header("accept", "application/json, text/event-stream")
        .header("content-type", "application/json")
        .body(body.to_string());
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    req.send().await.unwrap()
}

async fn rpc(server: &McpServer, method: &str, params: Value) -> Value {
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    let resp = post(server, Some(server.token()), &body).await;
    assert_eq!(resp.status(), 200, "{method} should succeed");
    resp.json().await.unwrap()
}

async fn call_tool(server: &McpServer, name: &str, arguments: Value) -> Value {
    let reply = rpc(
        server,
        "tools/call",
        json!({ "name": name, "arguments": arguments }),
    )
    .await;
    reply["result"].clone()
}

fn create_room(store: &Store, name: &str) -> String {
    store
        .create_room(NewRoom {
            project_id: None,
            name: name.into(),
            icon: None,
            color: None,
            is_hq: None,
        })
        .unwrap()
        .id
}

#[tokio::test(flavor = "multi_thread")]
async fn rejects_missing_or_wrong_token_with_401() {
    let (server, _store, _rx) = boot().await;
    let init = json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": { "protocolVersion": "2025-06-18", "capabilities": {},
                    "clientInfo": { "name": "test", "version": "0" } }
    });

    let resp = post(&server, None, &init).await;
    assert_eq!(resp.status(), 401);

    let resp = post(&server, Some("wrong-token"), &init).await;
    assert_eq!(resp.status(), 401);

    let resp = post(&server, Some(server.token()), &init).await;
    assert_eq!(resp.status(), 200);
}

#[tokio::test(flavor = "multi_thread")]
async fn initialize_and_tools_list_expose_all_seven_tools() {
    let (server, _store, _rx) = boot().await;

    let reply = rpc(
        &server,
        "initialize",
        json!({ "protocolVersion": "2025-06-18", "capabilities": {},
                "clientInfo": { "name": "test", "version": "0" } }),
    )
    .await;
    assert_eq!(reply["result"]["serverInfo"]["name"], "crewhub");
    assert!(reply["result"]["capabilities"]["tools"].is_object());

    let reply = rpc(&server, "tools/list", json!({})).await;
    let mut names: Vec<&str> = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    names.sort_unstable();
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

#[tokio::test(flavor = "multi_thread")]
async fn list_crew_tool_call_returns_agents() {
    let (server, store, _rx) = boot().await;
    store
        .create_agent(crewhub2_lib::store::agents::NewAgent {
            name: "Botje".into(),
            icon: None,
            color: None,
            default_model: None,
            project_path: None,
            permission_mode: None,
            system_prompt: None,
        })
        .unwrap();

    let result = call_tool(&server, "list_crew", json!({})).await;
    assert_ne!(result["isError"], true, "unexpected tool error: {result}");
    let agents = result["structuredContent"]["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0]["name"], "Botje");
}

#[tokio::test(flavor = "multi_thread")]
async fn create_task_persists_row_and_emits_domain_event() {
    let (server, store, mut rx) = boot().await;
    let room_id = create_room(&store, "Lab");

    let result = call_tool(
        &server,
        "create_task",
        json!({ "title": "From MCP", "room_id": room_id, "priority": "high" }),
    )
    .await;
    assert_ne!(result["isError"], true, "unexpected tool error: {result}");

    let task = &result["structuredContent"]["task"];
    let task_id = task["id"].as_str().unwrap();
    assert_eq!(task["created_by"], "agent:mcp");

    let row = store.get_task(task_id).unwrap().expect("task row exists");
    assert_eq!(row.title, "From MCP");
    assert_eq!(row.room_id.as_deref(), Some(room_id.as_str()));
    assert_eq!(row.priority, "high");

    assert!(
        matches!(rx.try_recv(), Ok(DomainEvent::TaskChanged { task_id: id }) if id == task_id),
        "expected TaskChanged on the notify channel"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn update_task_status_with_invalid_status_is_tool_error() {
    let (server, store, mut rx) = boot().await;
    let room_id = create_room(&store, "Lab");
    let created = call_tool(
        &server,
        "create_task",
        json!({ "title": "X", "room_id": room_id }),
    )
    .await;
    let task_id = created["structuredContent"]["task"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let _ = rx.try_recv(); // drain create event

    let result = call_tool(
        &server,
        "update_task_status",
        json!({ "task_id": task_id, "status": "nonsense" }),
    )
    .await;
    assert_eq!(result["isError"], true, "expected tool error: {result}");
    assert_eq!(store.get_task(&task_id).unwrap().unwrap().status, "todo");
    assert!(rx.try_recv().is_err(), "invalid update must not emit");

    let result = call_tool(
        &server,
        "update_task_status",
        json!({ "task_id": task_id, "status": "in_progress" }),
    )
    .await;
    assert_ne!(result["isError"], true);
    assert_eq!(
        store.get_task(&task_id).unwrap().unwrap().status,
        "in_progress"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn get_room_context_returns_envelope() {
    let (server, store, _rx) = boot().await;
    let room_id = create_room(&store, "Lab");
    call_tool(
        &server,
        "create_task",
        json!({ "title": "Open one", "room_id": room_id }),
    )
    .await;

    let result = call_tool(&server, "get_room_context", json!({ "room_id": room_id })).await;
    assert_ne!(result["isError"], true, "unexpected tool error: {result}");
    let envelope = &result["structuredContent"];
    assert_eq!(envelope["room"]["id"], room_id.as_str());
    assert!(envelope["project"].is_null());
    assert_eq!(envelope["open_tasks"].as_array().unwrap().len(), 1);
}

// ---- registration (T23) against the fake CLI ----

fn fake_cli(dir: &std::path::Path, scenario: &str) -> McpCliConfig {
    let path = dir.join("scenario.jsonl");
    std::fs::write(&path, scenario).unwrap();
    McpCliConfig {
        cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
        extra_env: vec![("FAKE_CLAUDE_SCENARIO".into(), path.display().to_string())],
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn register_passes_exact_argv_to_cli() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = fake_cli(
        dir.path(),
        concat!(
            r#"{"expect_arg":"add"}"#,
            "\n",
            r#"{"expect_arg":"--transport"}"#,
            "\n",
            r#"{"expect_arg":"http://127.0.0.1:43210/mcp"}"#,
            "\n",
            r#"{"expect_arg":"Authorization: Bearer secret-token"}"#,
            "\n",
            r#"{"expect_arg":"crewhub"}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );
    registration::register(&cfg, dir.path(), 43210, "secret-token")
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn unregister_failure_surfaces_as_error() {
    let dir = tempfile::tempdir().unwrap();
    // remove argv has no --transport flag, so the fake CLI exits 8.
    let cfg = fake_cli(dir.path(), "{\"expect_arg\":\"--transport\"}\n");
    let err = registration::unregister(&cfg, dir.path())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("mcp remove"), "got: {err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn refresh_reregisters_even_when_remove_fails() {
    let dir = tempfile::tempdir().unwrap();
    // The fake CLI replays the same scenario for both invocations: the remove
    // call lacks "--transport" and fails (exit 8), the add call passes — so a
    // successful refresh proves remove failures are tolerated.
    let cfg = fake_cli(
        dir.path(),
        concat!(
            r#"{"expect_arg":"--transport"}"#,
            "\n",
            r#"{"expect_arg":"Authorization: Bearer t2"}"#,
            "\n",
            r#"{"exit":0}"#,
            "\n",
        ),
    );
    registration::refresh(&cfg, dir.path(), 50000, "t2")
        .await
        .unwrap();
}
