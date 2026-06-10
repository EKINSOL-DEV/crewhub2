//! Provider-neutral session status derivation.
//!
//! Pure function over a transcript tail + runtime hints, so every provider and
//! the watcher share one definition of Working / Waiting / Idle / Ended.

use crate::engine::types::{SessionStatus, TranscriptItem};

pub struct StatusInput<'a> {
    /// Most recent items, oldest first.
    pub tail: &'a [TranscriptItem],
    pub now_ms: i64,
    pub last_activity_ms: i64,
    pub pending_permission: bool,
    /// `None` for external sessions (no process handle).
    pub process_alive: Option<bool>,
    pub recency_ms: i64,
}

/// Quiet time after which a trailing assistant message means "waiting for the human".
const SETTLE_MS: i64 = 3_000;

pub fn derive(input: &StatusInput) -> (SessionStatus, Option<String>) {
    if input.pending_permission {
        return (
            SessionStatus::WaitingForPermission,
            Some("Waiting for permission".into()),
        );
    }
    if input.process_alive == Some(false) {
        return (SessionStatus::Ended, None);
    }
    let age = input.now_ms - input.last_activity_ms;
    if age > input.recency_ms {
        return (SessionStatus::Idle, None);
    }

    // Walk the tail backwards past non-conversational items (usage, system notes).
    for item in input.tail.iter().rev() {
        match item {
            TranscriptItem::Usage { .. }
            | TranscriptItem::SystemNote { .. }
            | TranscriptItem::Unknown { .. } => continue,
            TranscriptItem::ToolUse {
                tool, input_json, ..
            } => {
                return (
                    SessionStatus::Working,
                    Some(activity_detail(tool, input_json)),
                )
            }
            TranscriptItem::ToolResult { .. } => {
                return (
                    SessionStatus::Working,
                    Some("Processing tool result…".into()),
                )
            }
            TranscriptItem::Thinking { .. } => {
                return (SessionStatus::Working, Some("Thinking…".into()))
            }
            TranscriptItem::AssistantText { .. } => {
                return if age >= SETTLE_MS {
                    (SessionStatus::WaitingForInput, None)
                } else {
                    (SessionStatus::Working, Some("Responding…".into()))
                };
            }
            TranscriptItem::UserText { .. } => {
                return (SessionStatus::Working, Some("Reading your message…".into()))
            }
            TranscriptItem::Image { .. } => continue,
        }
    }
    (SessionStatus::Idle, None)
}

/// Human-readable "what is it doing" string from the last tool call (v1-grade detail).
pub fn activity_detail(tool: &str, input_json: &str) -> String {
    let input: serde_json::Value = serde_json::from_str(input_json).unwrap_or_default();
    let field = |k: &str| {
        input
            .get(k)
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
    };
    let file = field("file_path").or_else(|| field("path")).map(short_path);
    match tool {
        "Edit" | "MultiEdit" => format!("Editing {}", file.unwrap_or_default()),
        "Write" => format!("Writing {}", file.unwrap_or_default()),
        "Read" => format!("Reading {}", file.unwrap_or_default()),
        "Bash" => {
            let cmd = field("command").unwrap_or_default();
            let mut c: String = cmd.chars().take(48).collect();
            if cmd.chars().count() > 48 {
                c.push('…');
            }
            format!("Running: {c}")
        }
        "Grep" | "Glob" => "Searching the codebase…".into(),
        "WebSearch" | "WebFetch" => "Browsing the web…".into(),
        "Task" | "Agent" => "Delegating to a subagent…".into(),
        other => format!("Using {other}"),
    }
}

fn short_path(p: String) -> String {
    let parts: Vec<&str> = p.rsplitn(3, '/').collect();
    match parts.len() {
        3 => format!("{}/{}", parts[1], parts[0]),
        _ => p,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::types::SessionStatus::*;

    fn tool_use(tool: &str, input: &str) -> TranscriptItem {
        TranscriptItem::ToolUse {
            tool: tool.into(),
            input_json: input.into(),
            tool_use_id: "t".into(),
            ts: 0,
        }
    }

    fn base<'a>(tail: &'a [TranscriptItem]) -> StatusInput<'a> {
        StatusInput {
            tail,
            now_ms: 10_000,
            last_activity_ms: 9_500,
            pending_permission: false,
            process_alive: None,
            recency_ms: 30 * 60 * 1000,
        }
    }

    #[test]
    fn permission_wins_over_everything() {
        let tail = [tool_use("Bash", "{}")];
        let mut i = base(&tail);
        i.pending_permission = true;
        assert_eq!(derive(&i).0, WaitingForPermission);
    }

    #[test]
    fn dead_process_is_ended() {
        let tail = [];
        let mut i = base(&tail);
        i.process_alive = Some(false);
        assert_eq!(derive(&i).0, Ended);
    }

    #[test]
    fn stale_session_is_idle() {
        let tail = [tool_use("Bash", "{}")];
        let mut i = base(&tail);
        i.last_activity_ms = 0;
        i.now_ms = i.recency_ms + 1;
        assert_eq!(derive(&i).0, Idle);
    }

    #[test]
    fn trailing_tool_use_is_working_with_detail() {
        let tail = [tool_use("Edit", r#"{"file_path":"/a/b/src/foo.rs"}"#)];
        let (s, d) = derive(&base(&tail));
        assert_eq!(s, Working);
        assert_eq!(d.as_deref(), Some("Editing src/foo.rs"));
    }

    #[test]
    fn trailing_assistant_text_settles_into_waiting_for_input() {
        let tail = [TranscriptItem::AssistantText {
            text: "done".into(),
            ts: 0,
        }];
        let mut i = base(&tail);
        i.last_activity_ms = i.now_ms - SETTLE_MS;
        assert_eq!(derive(&i).0, WaitingForInput);
        i.last_activity_ms = i.now_ms - 100; // just replied
        assert_eq!(derive(&i).0, Working);
    }

    #[test]
    fn trailing_user_text_means_working() {
        let tail = [TranscriptItem::UserText {
            text: "hey".into(),
            ts: 0,
        }];
        assert_eq!(derive(&base(&tail)).0, Working);
    }

    #[test]
    fn usage_and_system_items_are_skipped_when_walking_back() {
        let tail = [
            tool_use("Bash", r#"{"command":"cargo test"}"#),
            TranscriptItem::Usage {
                input_tokens: 1,
                output_tokens: 1,
                cache_read: 0,
                ts: 0,
            },
            TranscriptItem::SystemNote {
                text: "hook".into(),
                ts: 0,
            },
        ];
        let (s, d) = derive(&base(&tail));
        assert_eq!(s, Working);
        assert_eq!(d.as_deref(), Some("Running: cargo test"));
    }

    #[test]
    fn empty_tail_is_idle() {
        assert_eq!(derive(&base(&[])).0, Idle);
    }

    #[test]
    fn bash_detail_truncates() {
        let long = "x".repeat(80);
        let d = activity_detail("Bash", &format!(r#"{{"command":"{long}"}}"#));
        assert!(d.ends_with('…') && d.chars().count() <= 58);
    }
}
