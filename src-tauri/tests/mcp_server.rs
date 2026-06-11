//! MCP server integration (T20): bearer auth and the MCP handshake over raw
//! streamable HTTP.

use std::sync::Arc;

use crewhub2_lib::mcp::server::McpServer;
use crewhub2_lib::store::Store;
use serde_json::{json, Value};

async fn boot() -> (McpServer, Arc<Store>) {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let server = McpServer::start(store.clone()).await.unwrap();
    (server, store)
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

#[tokio::test(flavor = "multi_thread")]
async fn rejects_missing_or_wrong_token_with_401() {
    let (server, _store) = boot().await;
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
async fn initialize_and_tools_list_expose_list_crew() {
    let (server, _store) = boot().await;

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
    let names: Vec<&str> = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["list_crew"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn list_crew_tool_call_returns_agents() {
    let (server, store) = boot().await;
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

    let reply = rpc(
        &server,
        "tools/call",
        json!({ "name": "list_crew", "arguments": {} }),
    )
    .await;
    let result = &reply["result"];
    assert_ne!(result["isError"], true, "unexpected tool error: {result}");
    let agents = result["structuredContent"]["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0]["name"], "Botje");
}
