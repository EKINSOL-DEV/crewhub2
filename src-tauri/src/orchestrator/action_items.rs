//! Action-item extraction from synthesis output (16.3, D-M4-6).
//!
//! The synthesis prompt instructs the model to END with one fenced ```json
//! block `{"action_items":[…]}`. This parser is deliberately tolerant: it
//! takes the LAST well-formed fenced JSON block, tolerates missing/extra
//! fields, and on ANY failure returns zero items — the meeting still
//! completes, `output_md` stays intact, and the UI offers manual add.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedActionItem {
    pub text: String,
    /// Participant NAME as the model wrote it (caller fuzzy-matches to agents).
    pub assignee: Option<String>,
    /// Normalized to low|medium|high; anything else becomes None.
    pub priority: Option<String>,
}

/// Split synthesis output into `(output_md, action_items)`.
///
/// `output_md` is the text with the consumed block removed (verbatim before
/// it, anything after preserved); when no block parses, the FULL text is the
/// output and items are empty — never an error.
pub fn parse(output: &str) -> (String, Vec<ParsedActionItem>) {
    let blocks = fenced_blocks(output);
    // last well-formed block wins
    for (start, end, body) in blocks.into_iter().rev() {
        if let Some(items) = parse_action_items_json(body) {
            let mut md = String::new();
            md.push_str(output[..start].trim_end());
            let tail = output[end..].trim();
            if !tail.is_empty() {
                md.push_str("\n\n");
                md.push_str(tail);
            }
            return (md, items);
        }
    }
    (output.trim().to_string(), Vec::new())
}

/// All fenced code blocks as `(fence_start_byte, after_fence_byte, body)`.
/// Shared with the standup reply parser (same tolerant family, D-M4-6/7).
pub(crate) fn fenced_blocks(text: &str) -> Vec<(usize, usize, &str)> {
    let mut blocks = Vec::new();
    let mut offset = 0;
    let mut open: Option<(usize, usize)> = None; // (fence start, body start)
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            match open.take() {
                None => {
                    // opening fence (info string allowed: ```json)
                    open = Some((offset, offset + line.len()));
                }
                Some((fence_start, body_start)) => {
                    let body = &text[body_start..offset];
                    blocks.push((fence_start, offset + line.len(), body));
                }
            }
        }
        offset += line.len();
    }
    blocks
}

fn parse_action_items_json(body: &str) -> Option<Vec<ParsedActionItem>> {
    let v: Value = serde_json::from_str(body.trim()).ok()?;
    let items = v.get("action_items")?.as_array()?;
    let mut out = Vec::new();
    for item in items {
        let Some(text) = item.get("text").and_then(Value::as_str) else {
            continue; // tolerate entries without text
        };
        if text.trim().is_empty() {
            continue;
        }
        let assignee = item
            .get("assignee")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("null"))
            .map(str::to_string);
        let priority = item
            .get("priority")
            .and_then(Value::as_str)
            .map(str::to_ascii_lowercase)
            .filter(|p| ["low", "medium", "high"].contains(&p.as_str()));
        out.push(ParsedActionItem {
            text: text.trim().to_string(),
            assignee,
            priority,
        });
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLEAN: &str = "## Summary\nWe decided things.\n\n## Decisions\n- ship\n\n```json\n{\"action_items\":[{\"text\":\"Ship it\",\"assignee\":\"alice\",\"priority\":\"high\"},{\"text\":\"Docs\",\"assignee\":null,\"priority\":null}]}\n```\n";

    #[test]
    fn clean_block_parses_and_is_stripped_from_output() {
        let (md, items) = parse(CLEAN);
        assert!(md.contains("## Summary"));
        assert!(!md.contains("action_items"), "block must be removed: {md}");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].text, "Ship it");
        assert_eq!(items[0].assignee.as_deref(), Some("alice"));
        assert_eq!(items[0].priority.as_deref(), Some("high"));
        assert_eq!(items[1].assignee, None);
        assert_eq!(items[1].priority, None);
    }

    #[test]
    fn last_block_wins_when_multiple() {
        let text = "```json\n{\"action_items\":[{\"text\":\"old\"}]}\n```\nmiddle\n```json\n{\"action_items\":[{\"text\":\"new\"}]}\n```";
        let (md, items) = parse(text);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].text, "new");
        assert!(md.contains("old"), "earlier blocks stay in output_md");
        assert!(md.contains("middle"));
    }

    #[test]
    fn missing_and_extra_fields_tolerated() {
        let text = "x\n```json\n{\"action_items\":[{\"text\":\"a\",\"surprise\":1},{\"assignee\":\"bob\"},{\"text\":\"b\",\"priority\":\"URGENT\"}]}\n```";
        let (_, items) = parse(text);
        // entry without text dropped; unknown priority normalized to None
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].text, "a");
        assert_eq!(items[1].priority, None);
    }

    #[test]
    fn broken_json_returns_zero_items_and_full_output() {
        let text = "## Summary\nfine\n```json\n{not json\n```";
        let (md, items) = parse(text);
        assert!(items.is_empty());
        assert!(md.contains("## Summary"));
        assert!(md.contains("{not json"), "output preserved verbatim");
    }

    #[test]
    fn no_block_at_all_is_fine() {
        let (md, items) = parse("just markdown, no fence");
        assert!(items.is_empty());
        assert_eq!(md, "just markdown, no fence");
    }

    #[test]
    fn non_action_item_blocks_are_ignored() {
        let text = "```json\n{\"other\":true}\n```\ntail";
        let (md, items) = parse(text);
        assert!(items.is_empty());
        assert_eq!(md, text.trim());
    }

    #[test]
    fn garbage_everywhere_never_panics() {
        for s in [
            "",
            "```",
            "``` ```",
            "```json",
            "\n\n```json\n[]\n```\n",
            "🤷",
        ] {
            let _ = parse(s);
        }
    }
}
