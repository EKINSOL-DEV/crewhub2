//! CrewHub MCP tools. T20 ships `list_crew`; the task tools (T21) and the
//! context & messaging tools (T22) extend this router.

use std::sync::Arc;

use rmcp::model::{CallToolResult, Implementation, ServerCapabilities, ServerInfo};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use serde_json::json;

use crate::store::Store;

/// The MCP service: one instance is constructed per request (stateless mode),
/// all sharing the same store.
pub struct CrewHubMcp {
    store: Arc<Store>,
}

#[tool_router]
impl CrewHubMcp {
    pub fn new(store: Arc<Store>) -> Self {
        Self { store }
    }

    #[tool(description = "List all CrewHub crew members (agents).")]
    fn list_crew(&self) -> Result<CallToolResult, ErrorData> {
        let agents = self.store.list_agents().map_err(internal)?;
        Ok(CallToolResult::structured(json!({ "agents": agents })))
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

fn internal(e: impl std::fmt::Display) -> ErrorData {
    ErrorData::internal_error(e.to_string(), None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::agents::NewAgent;

    fn mcp() -> CrewHubMcp {
        CrewHubMcp::new(Arc::new(Store::open_in_memory().unwrap()))
    }

    fn structured(result: &CallToolResult) -> &serde_json::Value {
        assert_ne!(result.is_error, Some(true), "unexpected tool error");
        result.structured_content.as_ref().expect("structured")
    }

    #[test]
    fn router_exposes_list_crew() {
        let names: Vec<_> = CrewHubMcp::tool_router()
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        assert_eq!(names, vec!["list_crew"]);
    }

    #[test]
    fn list_crew_returns_agents() {
        let mcp = mcp();
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
}
