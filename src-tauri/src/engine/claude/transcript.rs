//! Claude Code JSONL transcript parsing → provider-neutral [`TranscriptItem`]s.
//!
//! Contract (M1 plan §3): never panic on any input line; unknown line types map to
//! [`TranscriptItem::Unknown`]; line types known to carry no conversation content
//! are skipped (empty item vec). Fixtures in `fixtures/transcripts/` are the spec.

use crate::engine::types::TranscriptItem;
use serde_json::Value;

/// Session-level metadata carried on (almost) every line.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LineMeta {
    pub session_id: Option<String>,
    pub uuid: Option<String>,
    pub parent_uuid: Option<String>,
    pub is_sidechain: bool,
    pub agent_id: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub version: Option<String>,
    pub ts: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedLine {
    pub raw_type: String,
    pub meta: LineMeta,
    pub items: Vec<TranscriptItem>,
}

/// Line types that exist for Claude Code's own bookkeeping — no conversation content.
const SKIP_TYPES: &[&str] = &[
    "mode",
    "permission-mode",
    "ai-title",
    "last-prompt",
    "queue-operation",
    "attachment",
    "file-history-snapshot",
    "worktree-state",
];

const PREVIEW_LIMIT: usize = 500;

pub fn parse_line(line: &str) -> Option<ParsedLine> {
    let v: Value = serde_json::from_str(line.trim()).ok()?;
    let obj = v.as_object()?;
    let raw_type = obj.get("type")?.as_str()?.to_string();
    let meta = line_meta(obj);
    let ts = meta.ts.unwrap_or(0);

    let items = if SKIP_TYPES.contains(&raw_type.as_str()) {
        Vec::new()
    } else {
        match raw_type.as_str() {
            "user" => user_items(obj, ts),
            "assistant" => assistant_items(obj, ts),
            "system" => vec![TranscriptItem::SystemNote {
                text: obj
                    .get("subtype")
                    .and_then(Value::as_str)
                    .or_else(|| obj.get("content").and_then(Value::as_str))
                    .unwrap_or("system")
                    .to_string(),
                ts,
            }],
            _ => vec![TranscriptItem::Unknown {
                raw_type: raw_type.clone(),
                ts: meta.ts,
            }],
        }
    };

    Some(ParsedLine {
        raw_type,
        meta,
        items,
    })
}

fn line_meta(obj: &serde_json::Map<String, Value>) -> LineMeta {
    let s = |k: &str| obj.get(k).and_then(Value::as_str).map(str::to_string);
    LineMeta {
        session_id: s("sessionId"),
        uuid: s("uuid"),
        parent_uuid: s("parentUuid"),
        is_sidechain: obj
            .get("isSidechain")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        agent_id: s("agentId"),
        cwd: s("cwd"),
        git_branch: s("gitBranch"),
        version: s("version"),
        ts: s("timestamp").and_then(|t| parse_ts(&t)),
    }
}

fn parse_ts(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.timestamp_millis())
}

fn user_items(obj: &serde_json::Map<String, Value>, ts: i64) -> Vec<TranscriptItem> {
    let Some(message) = obj.get("message").and_then(Value::as_object) else {
        return Vec::new();
    };
    match message.get("content") {
        Some(Value::String(text)) => vec![TranscriptItem::UserText {
            text: text.clone(),
            ts,
        }],
        Some(Value::Array(blocks)) => blocks.iter().filter_map(|b| user_block(b, ts)).collect(),
        _ => Vec::new(),
    }
}

fn user_block(block: &Value, ts: i64) -> Option<TranscriptItem> {
    let obj = block.as_object()?;
    match obj.get("type").and_then(Value::as_str)? {
        "text" => Some(TranscriptItem::UserText {
            text: obj
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            ts,
        }),
        "tool_result" => Some(TranscriptItem::ToolResult {
            tool_use_id: obj
                .get("tool_use_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            output_preview: preview(obj.get("content")),
            is_error: obj
                .get("is_error")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            ts,
        }),
        "image" => Some(image_item(obj, ts)),
        other => Some(TranscriptItem::Unknown {
            raw_type: format!("user/{other}"),
            ts: Some(ts),
        }),
    }
}

fn assistant_items(obj: &serde_json::Map<String, Value>, ts: i64) -> Vec<TranscriptItem> {
    let Some(message) = obj.get("message").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut items: Vec<TranscriptItem> = message
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| assistant_block(b, ts))
                .collect()
        })
        .unwrap_or_default();
    if let Some(usage) = message.get("usage").and_then(Value::as_object) {
        let n = |k: &str| usage.get(k).and_then(Value::as_i64).unwrap_or(0);
        items.push(TranscriptItem::Usage {
            input_tokens: n("input_tokens"),
            output_tokens: n("output_tokens"),
            cache_read: n("cache_read_input_tokens"),
            ts,
        });
    }
    items
}

fn assistant_block(block: &Value, ts: i64) -> Option<TranscriptItem> {
    let obj = block.as_object()?;
    match obj.get("type").and_then(Value::as_str)? {
        "text" => Some(TranscriptItem::AssistantText {
            text: obj
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            ts,
        }),
        "thinking" => Some(TranscriptItem::Thinking {
            text: obj
                .get("thinking")
                .and_then(Value::as_str)
                .map(str::to_string),
            redacted: false,
            ts,
        }),
        "redacted_thinking" => Some(TranscriptItem::Thinking {
            text: None,
            redacted: true,
            ts,
        }),
        "tool_use" => Some(TranscriptItem::ToolUse {
            tool: obj
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            input_json: obj.get("input").map(|i| i.to_string()).unwrap_or_default(),
            tool_use_id: obj
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            ts,
        }),
        "tool_result" => Some(TranscriptItem::ToolResult {
            tool_use_id: obj
                .get("tool_use_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            output_preview: preview(obj.get("content")),
            is_error: obj
                .get("is_error")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            ts,
        }),
        "image" => Some(image_item(obj, ts)),
        other => Some(TranscriptItem::Unknown {
            raw_type: format!("assistant/{other}"),
            ts: Some(ts),
        }),
    }
}

fn image_item(obj: &serde_json::Map<String, Value>, ts: i64) -> TranscriptItem {
    let media_type = obj
        .get("source")
        .and_then(Value::as_object)
        .and_then(|s| s.get("media_type"))
        .and_then(Value::as_str)
        .unwrap_or("image/*")
        .to_string();
    TranscriptItem::Image { media_type, ts }
}

fn preview(content: Option<&Value>) -> String {
    let full = match content {
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
        None => String::new(),
    };
    let mut out: String = full.chars().take(PREVIEW_LIMIT).collect();
    if full.chars().count() > PREVIEW_LIMIT {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_user_text_line() {
        let line = r#"{"type":"user","sessionId":"s","uuid":"u1","timestamp":"2026-05-29T22:37:14.883Z","message":{"role":"user","content":"hello"}}"#;
        let p = parse_line(line).unwrap();
        assert_eq!(p.raw_type, "user");
        let expected_ts = chrono::DateTime::parse_from_rfc3339("2026-05-29T22:37:14.883Z")
            .unwrap()
            .timestamp_millis();
        assert_eq!(
            p.items,
            vec![TranscriptItem::UserText {
                text: "hello".into(),
                ts: expected_ts
            }]
        );
    }

    #[test]
    fn parses_assistant_blocks_and_usage() {
        let line = r#"{"type":"assistant","timestamp":"2026-05-29T22:37:14.883Z","message":{"content":[{"type":"thinking","thinking":"hmm","signature":"sig"},{"type":"text","text":"hi"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}],"usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":3}}}"#;
        let p = parse_line(line).unwrap();
        assert_eq!(p.items.len(), 4);
        assert!(
            matches!(&p.items[0], TranscriptItem::Thinking { text: Some(t), redacted: false, .. } if t == "hmm")
        );
        assert!(matches!(&p.items[2], TranscriptItem::ToolUse { tool, .. } if tool == "Bash"));
        assert!(matches!(
            &p.items[3],
            TranscriptItem::Usage {
                input_tokens: 10,
                output_tokens: 5,
                cache_read: 3,
                ..
            }
        ));
    }

    #[test]
    fn parses_tool_result_in_user_line_with_long_preview() {
        let big = "y".repeat(900);
        let line = format!(
            r#"{{"type":"user","message":{{"content":[{{"type":"tool_result","tool_use_id":"t1","content":"{big}","is_error":true}}]}}}}"#
        );
        let p = parse_line(&line).unwrap();
        match &p.items[0] {
            TranscriptItem::ToolResult {
                output_preview,
                is_error: true,
                ..
            } => {
                assert_eq!(output_preview.chars().count(), 501); // 500 + ellipsis
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn metadata_lines_are_skipped_not_unknown() {
        for t in super::SKIP_TYPES {
            let line = format!(r#"{{"type":"{t}","sessionId":"s"}}"#);
            let p = parse_line(&line).unwrap();
            assert!(p.items.is_empty(), "{t} should be skipped");
        }
    }

    #[test]
    fn unknown_type_is_preserved_not_panicking() {
        let p = parse_line(r#"{"type":"brand-new-thing","timestamp":"2026-05-29T22:37:14.883Z"}"#)
            .unwrap();
        assert!(
            matches!(&p.items[0], TranscriptItem::Unknown { raw_type, .. } if raw_type == "brand-new-thing")
        );
    }

    #[test]
    fn garbage_lines_return_none() {
        assert!(parse_line("not json at all").is_none());
        assert!(parse_line("").is_none());
        assert!(parse_line(r#"{"no_type": true}"#).is_none());
    }

    #[test]
    fn sidechain_meta_extracted() {
        let line = r#"{"type":"user","isSidechain":true,"agentId":"a1","sessionId":"parent","message":{"content":"x"}}"#;
        let p = parse_line(line).unwrap();
        assert!(p.meta.is_sidechain);
        assert_eq!(p.meta.agent_id.as_deref(), Some("a1"));
    }

    #[test]
    fn fixture_sweep_no_panics_no_unknowns() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/transcripts");
        let mut files = 0;
        let mut unknowns: Vec<String> = Vec::new();
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|e| e != "jsonl") {
                continue;
            }
            files += 1;
            let content = std::fs::read_to_string(&path).unwrap();
            for line in content.lines() {
                if let Some(parsed) = parse_line(line) {
                    for item in &parsed.items {
                        if let TranscriptItem::Unknown { raw_type, .. } = item {
                            unknowns.push(format!(
                                "{}: {raw_type}",
                                path.file_name().unwrap().to_string_lossy()
                            ));
                        }
                    }
                }
            }
        }
        assert!(
            files >= 5,
            "expected the 5 committed fixtures, found {files}"
        );
        assert!(
            unknowns.is_empty(),
            "unexpected Unknown items: {unknowns:?}"
        );
    }
}
