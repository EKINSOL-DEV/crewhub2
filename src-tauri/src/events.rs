use serde::{Deserialize, Serialize};

/// The single typed event stream the webview subscribes to.
/// Every store mutation emits exactly one variant.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(tag = "type", content = "data")]
pub enum DomainEvent {
    AgentCreated { agent_id: String },
    AgentUpdated { agent_id: String },
    AgentDeleted { agent_id: String },
    ProjectChanged { project_id: String },
    RoomChanged { room_id: String },
    TaskChanged { task_id: String },
    SettingChanged { key: String },
}
