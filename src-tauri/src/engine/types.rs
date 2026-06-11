use serde::{Deserialize, Serialize};
use specta_typescript::Number;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
pub struct SessionId {
    pub provider: String,
    pub id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum SessionOrigin {
    Managed,
    External,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum SessionStatus {
    Working,
    WaitingForInput,
    WaitingForPermission,
    Idle,
    Ended,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct UsageTotals {
    #[specta(type = Number)]
    pub input_tokens: i64,
    #[specta(type = Number)]
    pub output_tokens: i64,
    #[specta(type = Number)]
    pub cache_read_tokens: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SessionMeta {
    pub id: SessionId,
    pub origin: SessionOrigin,
    pub project_path: String,
    pub model: Option<String>,
    pub status: SessionStatus,
    pub activity_detail: Option<String>,
    pub parent: Option<SessionId>,
    pub usage: UsageTotals,
    pub git_branch: Option<String>,
    #[specta(type = Number)]
    pub last_activity_ms: i64,
}

/// Provider-neutral transcript item. Provider-specific raw lines are MAPPED into this,
/// never exposed. `Unknown` preserves the raw type so the UI can render an
/// "unsupported item" placeholder and we never crash on format drift.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "data")]
pub enum TranscriptItem {
    UserText {
        text: String,
        #[specta(type = Number)]
        ts: i64,
    },
    AssistantText {
        text: String,
        #[specta(type = Number)]
        ts: i64,
    },
    Thinking {
        text: Option<String>,
        redacted: bool,
        #[specta(type = Number)]
        ts: i64,
    },
    ToolUse {
        tool: String,
        input_json: String,
        tool_use_id: String,
        #[specta(type = Number)]
        ts: i64,
    },
    ToolResult {
        tool_use_id: String,
        output_preview: String,
        is_error: bool,
        #[specta(type = Number)]
        ts: i64,
    },
    Image {
        media_type: String,
        #[specta(type = Number)]
        ts: i64,
    },
    SystemNote {
        text: String,
        #[specta(type = Number)]
        ts: i64,
    },
    Usage {
        #[specta(type = Number)]
        input_tokens: i64,
        #[specta(type = Number)]
        output_tokens: i64,
        #[specta(type = Number)]
        cache_read: i64,
        #[specta(type = Number)]
        ts: i64,
    },
    /// A provider-made restore point (e.g. a file-history snapshot) the user
    /// can rewind to by forking from here (EKI-64).
    Checkpoint {
        id: String,
        #[specta(type = Number)]
        ts: i64,
    },
    Unknown {
        raw_type: String,
        #[specta(type = Number)]
        ts: Option<i64>,
    },
}

/// A transcript item paired with its absolute position in the session's
/// transcript — the SAME numbering as live [`SessionEvent::Item`] `seq`
/// (M2 plan D-M2-3: one parser, one numbering).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SeqItem {
    #[specta(type = Number)]
    pub seq: u64,
    pub item: TranscriptItem,
}

/// One page of an on-disk transcript: items `[offset, offset+limit)`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct TranscriptPage {
    pub items: Vec<SeqItem>,
    /// Items currently in the transcript file.
    #[specta(type = Number)]
    pub total: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool: String,
    pub input_json: String,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "data")]
pub enum PermissionResponse {
    AllowOnce,
    AllowAlways,
    Deny { message: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct QuestionRequest {
    pub request_id: String,
    /// "question" | "plan"
    pub kind: String,
    pub text: String,
    pub options: Vec<String>,
    pub multi_select: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct QuestionResponse {
    pub request_id: String,
    pub answers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct HookSignal {
    /// Provider-neutral event name: session-start | pre-tool | post-tool | stop | subagent-stop | notification
    pub event: String,
    pub tool: Option<String>,
    pub path: Option<String>,
    pub payload_json: Option<String>,
    #[specta(type = Number)]
    pub ts: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum PermissionMode {
    Default,
    AcceptEdits,
    Plan,
    BypassPermissions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SpawnSpec {
    pub project_path: String,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub permission_mode: PermissionMode,
    /// Resume this session id; with `fork: true` the original stays untouched.
    pub resume_session: Option<String>,
    pub fork: bool,
    pub append_system_prompt: Option<String>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct UserInput {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "data")]
pub enum SessionEvent {
    Discovered {
        meta: SessionMeta,
    },
    Updated {
        meta: SessionMeta,
    },
    Removed {
        id: SessionId,
    },
    Item {
        id: SessionId,
        item: TranscriptItem,
        #[specta(type = Number)]
        seq: u64,
    },
    PermissionRequest {
        id: SessionId,
        request: PermissionRequest,
    },
    Question {
        id: SessionId,
        question: QuestionRequest,
    },
    Signal {
        id: SessionId,
        signal: HookSignal,
    },
    Conflict {
        path: String,
        sessions: Vec<SessionId>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ArchivedSession {
    pub id: SessionId,
    pub project_path: String,
    pub summary: String,
    #[specta(type = Number)]
    pub last_modified_ms: i64,
}

/// A composer hint: a slash command or skill the provider recognizes for a
/// given project (G8, EKI-52).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct SlashCommand {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SearchHit {
    pub session_id: SessionId,
    #[specta(type = Number)]
    pub ts: i64,
    pub role: String,
    pub snippet: String,
}
