//! MCP server integration (T20–T21): bearer auth, MCP handshake over raw
//! streamable HTTP, and tool calls mutating the store + emitting DomainEvents.

use std::sync::Arc;

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
async fn initialize_and_tools_list_expose_task_tools() {
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
            "list_crew",
            "list_tasks",
            "post_status_update",
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
