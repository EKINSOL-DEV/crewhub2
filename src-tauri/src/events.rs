use serde::{Deserialize, Serialize};

/// The single typed event stream the webview subscribes to.
/// Every store mutation emits exactly one variant.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(tag = "type", content = "data")]
pub enum DomainEvent {
    AgentCreated {
        agent_id: String,
    },
    AgentUpdated {
        agent_id: String,
    },
    AgentDeleted {
        agent_id: String,
    },
    ProjectChanged {
        project_id: String,
    },
    RoomChanged {
        room_id: String,
    },
    TaskChanged {
        task_id: String,
    },
    SettingChanged {
        key: String,
    },
    /// A session binding was created, updated or deleted (G3, EKI-40).
    SessionBindingChanged {
        session_id: String,
    },
    /// Meeting state/turn progress (M4 D-M4-11) — UI refetches the meeting + turns.
    MeetingChanged {
        meeting_id: String,
    },
    /// A run was created/updated/fired or a result landed — UI refetches.
    RunChanged {
        run_id: String,
    },
    /// A standup entry landed — UI refetches the standup + entries.
    StandupChanged {
        standup_id: String,
    },
}

/// Wrapper event carrying provider-neutral engine events to the webview.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
pub struct EngineEvent(pub crate::engine::types::SessionEvent);
