//! Stream-json control protocol (verified against CC 2.1.172 — see
//! `docs/engine/claude-control-protocol.md` and `fixtures/control/`).

use crate::engine::types::{PermissionRequest, PermissionResponse, QuestionRequest};
use serde_json::{json, Value};

/// Events the process manager cares about; conversation content itself is read
/// from the transcript file by the watcher (single source of truth, no dupes).
#[derive(Debug, Clone, PartialEq)]
pub enum CliEvent {
    Init {
        session_id: String,
    },
    Permission(PermissionRequest),
    /// End of a turn; the process stays alive for more stdin in stream-json mode.
    TurnResult {
        is_error: bool,
        summary: String,
    },
    Other,
}

pub fn parse_cli_line(line: &str) -> Option<CliEvent> {
    let v: Value = serde_json::from_str(line.trim()).ok()?;
    match v.get("type")?.as_str()? {
        "system" if v.get("subtype").and_then(Value::as_str) == Some("init") => {
            Some(CliEvent::Init {
                session_id: v.get("session_id")?.as_str()?.to_string(),
            })
        }
        "control_request" => {
            let request = v.get("request")?;
            if request.get("subtype").and_then(Value::as_str) != Some("can_use_tool") {
                return Some(CliEvent::Other);
            }
            Some(CliEvent::Permission(PermissionRequest {
                request_id: v.get("request_id")?.as_str()?.to_string(),
                tool: request
                    .get("tool_name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                input_json: request
                    .get("input")
                    .map(|i| i.to_string())
                    .unwrap_or_default(),
                suggestions: request
                    .get("permission_suggestions")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().map(|s| s.to_string()).collect())
                    .unwrap_or_default(),
            }))
        }
        "result" => Some(CliEvent::TurnResult {
            is_error: v.get("is_error").and_then(Value::as_bool).unwrap_or(false),
            summary: v
                .get("result")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .chars()
                .take(200)
                .collect(),
        }),
        _ => Some(CliEvent::Other),
    }
}

/// Map an interactive-tool permission request (AskUserQuestion / ExitPlanMode)
/// into a provider-neutral question.
pub fn question_from_permission(req: &PermissionRequest) -> QuestionRequest {
    let input: Value = serde_json::from_str(&req.input_json).unwrap_or_default();
    if req.tool == "ExitPlanMode" {
        return QuestionRequest {
            request_id: req.request_id.clone(),
            kind: "plan".into(),
            text: input
                .get("plan")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            options: vec!["approve".into(), "reject".into()],
            multi_select: false,
        };
    }
    let q0 = input
        .get("questions")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or_default();
    QuestionRequest {
        request_id: req.request_id.clone(),
        kind: "question".into(),
        text: q0
            .get("question")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        options: q0
            .get("options")
            .and_then(Value::as_array)
            .map(|opts| {
                opts.iter()
                    .filter_map(|o| o.get("label").and_then(Value::as_str).map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        multi_select: q0
            .get("multiSelect")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

pub fn initialize_line(request_id: &str) -> String {
    json!({"type":"control_request","request_id":request_id,"request":{"subtype":"initialize","hooks":{}}})
        .to_string()
}

pub fn user_message_line(text: &str) -> String {
    json!({"type":"user","message":{"role":"user","content":[{"type":"text","text":text}]}})
        .to_string()
}

pub fn permission_response_line(
    request_id: &str,
    resp: &PermissionResponse,
    original_input_json: &str,
) -> String {
    let inner = match resp {
        PermissionResponse::AllowOnce | PermissionResponse::AllowAlways => {
            let input: Value = serde_json::from_str(original_input_json).unwrap_or(json!({}));
            json!({"behavior":"allow","updatedInput": input})
        }
        PermissionResponse::Deny { message } => {
            json!({"behavior":"deny","message": message.clone().unwrap_or_else(|| "Denied by user".into())})
        }
    };
    json!({"type":"control_response","response":{"subtype":"success","request_id":request_id,"response":inner}})
        .to_string()
}

pub fn interrupt_line(request_id: &str) -> String {
    json!({"type":"control_request","request_id":request_id,"request":{"subtype":"interrupt"}})
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Replays the recorded live round-trip; the fixture is the spec.
    #[test]
    fn fixture_roundtrip_parses_into_expected_events() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/control/can-use-tool-roundtrip.jsonl");
        let content = std::fs::read_to_string(path).unwrap();
        let mut got_init = false;
        let mut got_permission = false;
        let mut got_result = false;
        for line in content.lines() {
            let wrapper: Value = serde_json::from_str(line).unwrap();
            if wrapper.get("dir").and_then(Value::as_str) != Some("in") {
                continue;
            }
            match parse_cli_line(&wrapper.get("msg").unwrap().to_string()) {
                Some(CliEvent::Init { session_id }) => {
                    assert!(!session_id.is_empty());
                    got_init = true;
                }
                Some(CliEvent::Permission(p)) => {
                    assert_eq!(p.tool, "Write");
                    assert!(p.input_json.contains("spike.txt"));
                    assert!(!p.request_id.is_empty());
                    got_permission = true;
                }
                Some(CliEvent::TurnResult { is_error, .. }) => {
                    assert!(!is_error);
                    got_result = true;
                }
                _ => {}
            }
        }
        assert!(got_init && got_permission && got_result);
    }

    #[test]
    fn permission_response_allow_echoes_original_input() {
        let line = permission_response_line(
            "r1",
            &PermissionResponse::AllowOnce,
            r#"{"file_path":"/x"}"#,
        );
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["response"]["request_id"], "r1");
        assert_eq!(v["response"]["response"]["behavior"], "allow");
        assert_eq!(v["response"]["response"]["updatedInput"]["file_path"], "/x");
    }

    #[test]
    fn permission_response_deny_carries_message() {
        let line = permission_response_line(
            "r2",
            &PermissionResponse::Deny {
                message: Some("nope".into()),
            },
            "{}",
        );
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["response"]["response"]["behavior"], "deny");
        assert_eq!(v["response"]["response"]["message"], "nope");
    }
}
