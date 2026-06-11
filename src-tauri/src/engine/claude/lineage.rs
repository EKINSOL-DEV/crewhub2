//! Session header extraction + subagent lineage + agent-team detection.
//!
//! Claude Code 2.1 stores subagent transcripts at
//! `<project>/<parent-session-id>/subagents/agent-<agentId>.jsonl`; subagent lines
//! also carry `isSidechain: true` and `agentId`. Lineage therefore comes from the
//! directory layout, confirmed by line metadata.
//!
//! Teams (M4 T7, ADR 0002 — format pinned by `fixtures/teams/`):
//! teammates ride the SAME subagent layout, distinguished by a sibling
//! `agent-<id>.meta.json` WITHOUT a `toolUseId` (Task-tool subagents have one)
//! plus `<teammate-message …>` wrappers in the child transcript. The lead is
//! identified via `~/.claude/teams/<name>/config.json` (`leadSessionId`) —
//! which is TRANSIENT (deleted on team end), so every probe here is
//! parse-tolerant: absence or unknown shapes mean "no team", never an error.

use super::transcript::{parse_line, LineMeta};
use crate::engine::types::TranscriptItem;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct SessionHeader {
    pub session_id: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub version: Option<String>,
    pub is_sidechain: bool,
    pub agent_id: Option<String>,
}

/// Extract the session header from the first lines that carry metadata.
pub fn extract_header(lines: impl Iterator<Item = LineMeta>) -> SessionHeader {
    let mut h = SessionHeader::default();
    for meta in lines {
        if h.session_id.is_none() {
            h.session_id = meta.session_id;
        }
        if h.cwd.is_none() {
            h.cwd = meta.cwd;
        }
        if h.git_branch.is_none() {
            h.git_branch = meta.git_branch;
        }
        if h.version.is_none() {
            h.version = meta.version;
        }
        h.is_sidechain |= meta.is_sidechain;
        if h.agent_id.is_none() {
            h.agent_id = meta.agent_id;
        }
        if h.session_id.is_some() && h.cwd.is_some() && h.version.is_some() {
            break;
        }
    }
    h
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionFiles {
    pub main: PathBuf,
    pub subagents: Vec<PathBuf>,
}

/// Locate a session's main transcript and its subagent transcripts.
pub fn discover_session_files(project_dir: &Path, session_id: &str) -> Option<SessionFiles> {
    let main = project_dir.join(format!("{session_id}.jsonl"));
    if !main.is_file() {
        return None;
    }
    let mut subagents = Vec::new();
    let sub_dir = project_dir.join(session_id).join("subagents");
    if let Ok(entries) = std::fs::read_dir(&sub_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let is_agent_file = p.extension().is_some_and(|e| e == "jsonl")
                && p.file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with("agent-"));
            if is_agent_file {
                subagents.push(p);
            }
        }
    }
    subagents.sort();
    Some(SessionFiles { main, subagents })
}

/// The marker CC 2.1 wraps team mailbox traffic in (ADR 0002).
pub const TEAMMATE_MESSAGE_MARKER: &str = "<teammate-message";

/// Readable display name for a subagent, derived from its first user message
/// (v1 lesson: never show raw `parent=`/id labels). Teammate transcripts wrap
/// the first message in `<teammate-message … summary="…">` — prefer the
/// summary attribute, else strip the wrapper (2.1.173 canary fix).
pub fn humanize_agent_name(transcript: &str) -> String {
    for line in transcript.lines() {
        if let Some(parsed) = parse_line(line) {
            for item in parsed.items {
                if let TranscriptItem::UserText { text, .. } = item {
                    let text = unwrap_teammate_message(&text);
                    let words: Vec<&str> = text.split_whitespace().take(6).collect();
                    if words.is_empty() {
                        continue;
                    }
                    let mut name = words.join(" ");
                    if name.chars().count() > 48 {
                        name = name.chars().take(47).collect::<String>() + "…";
                    } else if text.split_whitespace().count() > 6 {
                        name.push('…');
                    }
                    return name;
                }
            }
        }
    }
    "subagent".to_string()
}

/// Strip the `<teammate-message …>` wrapper: prefer its `summary="…"`
/// attribute, else the inner body, else the original text.
fn unwrap_teammate_message(text: &str) -> String {
    let Some(start) = text.find(TEAMMATE_MESSAGE_MARKER) else {
        return text.to_string();
    };
    let tag = &text[start..];
    if let Some(sum_start) = tag.find("summary=\"") {
        let rest = &tag[sum_start + 9..];
        if let Some(end) = rest.find('"') {
            let summary = rest[..end].trim();
            if !summary.is_empty() {
                return summary.to_string();
            }
        }
    }
    // fall back to the body between the opening tag and the closing tag
    if let Some(tag_end) = tag.find('>') {
        let body = &tag[tag_end + 1..];
        let body = match body.find("</teammate-message>") {
            Some(close) => &body[..close],
            None => body,
        };
        let body = body.trim();
        if !body.is_empty() {
            return body.to_string();
        }
    }
    text.to_string()
}

/// Sidecar metadata CC 2.1 writes next to every subagent transcript
/// (`agent-<id>.meta.json`). Parse-tolerant: any unreadable shape is `None`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SubagentMeta {
    pub agent_type: Option<String>,
    /// Present for Task-tool subagents, ABSENT for teammates (ADR 0002).
    pub tool_use_id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Read the sibling `agent-<id>.meta.json` for a subagent transcript path.
pub fn read_subagent_meta(transcript_path: &Path) -> Option<SubagentMeta> {
    let stem = transcript_path.file_stem()?.to_string_lossy().to_string();
    let meta_path = transcript_path.with_file_name(format!("{stem}.meta.json"));
    let raw = std::fs::read_to_string(meta_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let obj = v.as_object()?;
    let s = |k: &str| obj.get(k).and_then(|x| x.as_str()).map(str::to_string);
    Some(SubagentMeta {
        agent_type: s("agentType"),
        tool_use_id: s("toolUseId"),
        name: s("name"),
        description: s("description"),
    })
}

/// Teammate detection for a subagent transcript (ADR 0002 key (a)):
/// sibling meta.json WITHOUT `toolUseId` + the `<teammate-message` marker in
/// the transcript content ⇒ teammate; role = the teammate name (`agentType`).
/// Returns the role only — the caller resolves the team id from the lead.
pub fn detect_teammate_role(transcript_path: &Path, transcript: &str) -> Option<String> {
    let meta = read_subagent_meta(transcript_path)?;
    if meta.tool_use_id.is_some() {
        return None; // Task-tool subagent, not a teammate
    }
    if !transcript.contains(TEAMMATE_MESSAGE_MARKER) {
        return None;
    }
    Some(
        meta.agent_type
            .or(meta.name)
            .unwrap_or_else(|| "teammate".into()),
    )
}

/// Lead detection (ADR 0002 key (b)): scan `<teams_dir>/*/config.json` for a
/// matching `leadSessionId`. Best-effort and transient (live teams only);
/// unknown shapes are skipped, never an error.
pub fn team_for_lead(teams_dir: &Path, session_id: &str) -> Option<String> {
    let entries = std::fs::read_dir(teams_dir).ok()?;
    for entry in entries.flatten() {
        let config = entry.path().join("config.json");
        let Ok(raw) = std::fs::read_to_string(&config) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        if v.get("leadSessionId").and_then(|x| x.as_str()) == Some(session_id) {
            let name = v
                .get("name")
                .and_then(|x| x.as_str())
                .map(str::to_string)
                .or_else(|| entry.file_name().to_str().map(str::to_string));
            if let Some(name) = name {
                return Some(name);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/transcripts")
            .join(name);
        std::fs::read_to_string(p).unwrap()
    }

    #[test]
    fn header_from_small_fixture() {
        let content = fixture("small-session-cc2.1.jsonl");
        let metas = content
            .lines()
            .filter_map(|l| parse_line(l).map(|p| p.meta));
        let h = extract_header(metas);
        assert!(h.session_id.is_some());
        assert!(h.version.is_some());
        assert!(!h.is_sidechain);
    }

    #[test]
    fn subagent_child_fixture_is_sidechain_with_agent_id() {
        let content = fixture("subagent-child-cc2.1.jsonl");
        let metas = content
            .lines()
            .filter_map(|l| parse_line(l).map(|p| p.meta));
        let h = extract_header(metas);
        assert!(h.is_sidechain);
        assert!(h.agent_id.is_some());
    }

    #[test]
    fn discovers_main_and_subagent_files() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path();
        std::fs::write(project.join("abc.jsonl"), "").unwrap();
        let subs = project.join("abc/subagents");
        std::fs::create_dir_all(&subs).unwrap();
        std::fs::write(subs.join("agent-x1.jsonl"), "").unwrap();
        std::fs::write(subs.join("agent-x2.jsonl"), "").unwrap();
        std::fs::write(subs.join("notes.txt"), "").unwrap();

        let files = discover_session_files(project, "abc").unwrap();
        assert_eq!(files.main, project.join("abc.jsonl"));
        assert_eq!(files.subagents.len(), 2);
        assert!(discover_session_files(project, "missing").is_none());
    }

    fn teams_fixture(name: &str) -> String {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/teams")
            .join(name);
        std::fs::read_to_string(p).unwrap()
    }

    /// ADR 0002 key (a), pinned by the spike fixtures: a teammate child has a
    /// sidecar meta WITHOUT toolUseId and `<teammate-message` wrappers.
    #[test]
    fn teammate_detected_from_spike_fixtures() {
        let dir = tempfile::tempdir().unwrap();
        let transcript_path = dir.path().join("agent-a545.jsonl");
        std::fs::write(
            &transcript_path,
            teams_fixture("teammate-child-cc2.1.jsonl"),
        )
        .unwrap();
        std::fs::write(
            dir.path().join("agent-a545.meta.json"),
            teams_fixture("teammate-meta-cc2.1.json"),
        )
        .unwrap();
        let transcript = std::fs::read_to_string(&transcript_path).unwrap();
        assert_eq!(
            detect_teammate_role(&transcript_path, &transcript),
            Some("echoer".to_string())
        );
    }

    /// A Task-tool subagent (toolUseId present) is NOT a teammate, even when
    /// its transcript mentions the marker.
    #[test]
    fn task_subagent_is_not_a_teammate() {
        let dir = tempfile::tempdir().unwrap();
        let transcript_path = dir.path().join("agent-task1.jsonl");
        std::fs::write(
            &transcript_path,
            teams_fixture("teammate-child-cc2.1.jsonl"),
        )
        .unwrap();
        std::fs::write(
            dir.path().join("agent-task1.meta.json"),
            teams_fixture("task-subagent-meta-cc2.1.json"),
        )
        .unwrap();
        let transcript = std::fs::read_to_string(&transcript_path).unwrap();
        assert_eq!(detect_teammate_role(&transcript_path, &transcript), None);
        // and a regular subagent without the marker is also not a teammate
        let plain = dir.path().join("agent-plain.jsonl");
        std::fs::write(
            &plain,
            "{\"type\":\"user\",\"message\":{\"content\":\"hi\"}}",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("agent-plain.meta.json"),
            teams_fixture("teammate-meta-cc2.1.json"),
        )
        .unwrap();
        assert_eq!(detect_teammate_role(&plain, "no marker here"), None);
    }

    /// ADR 0002 key (b): the lead resolves through the (transient) team
    /// config by `leadSessionId`; unknown shapes never panic.
    #[test]
    fn lead_resolves_via_team_config_fixture() {
        let dir = tempfile::tempdir().unwrap();
        let team = dir.path().join("fixture-team");
        std::fs::create_dir_all(&team).unwrap();
        std::fs::write(
            team.join("config.json"),
            teams_fixture("team-config-cc2.1.json"),
        )
        .unwrap();
        // the fixture pins leadSessionId = the spike's lead session
        assert_eq!(
            team_for_lead(dir.path(), "79eb425c-363b-4f2f-b46c-148ab7c66c3c"),
            Some("fixture-team".to_string())
        );
        assert_eq!(team_for_lead(dir.path(), "someone-else"), None);
        // unknown-shape configs are skipped, never a panic
        let weird = dir.path().join("weird");
        std::fs::create_dir_all(&weird).unwrap();
        std::fs::write(weird.join("config.json"), "{not json").unwrap();
        std::fs::write(dir.path().join("not-a-dir"), "x").unwrap();
        assert_eq!(team_for_lead(dir.path(), "nobody"), None);
        // missing teams dir entirely
        assert_eq!(team_for_lead(&dir.path().join("absent"), "x"), None);
    }

    #[test]
    fn subagent_meta_parses_tolerantly() {
        let dir = tempfile::tempdir().unwrap();
        let t = dir.path().join("agent-x.jsonl");
        std::fs::write(&t, "").unwrap();
        // no sidecar at all
        assert_eq!(read_subagent_meta(&t), None);
        // garbage sidecar
        std::fs::write(dir.path().join("agent-x.meta.json"), "🤷").unwrap();
        assert_eq!(read_subagent_meta(&t), None);
        // alien-but-json sidecar: fields default to None
        std::fs::write(dir.path().join("agent-x.meta.json"), "{\"weird\":1}").unwrap();
        assert_eq!(read_subagent_meta(&t), Some(SubagentMeta::default()));
    }

    /// 2.1.173 canary fix: teammate-message wrappers must not leak into the
    /// humanized subagent name.
    #[test]
    fn humanize_prefers_teammate_summary_over_raw_wrapper() {
        let line = r#"{"type":"user","message":{"content":"<teammate-message teammate_id=\"team-lead\" summary=\"Echo pong back\">\nYou are the echoer.\n</teammate-message>"}}"#;
        assert_eq!(humanize_agent_name(line), "Echo pong back");
        // wrapper without a summary: the body is used
        let line = r#"{"type":"user","message":{"content":"<teammate-message teammate_id=\"lead\">do the thing now</teammate-message>"}}"#;
        assert_eq!(humanize_agent_name(line), "do the thing now");
    }

    /// The REAL spike fixture flows end-to-end through humanize.
    #[test]
    fn humanize_on_real_teammate_fixture_uses_summary() {
        let transcript = teams_fixture("teammate-child-cc2.1.jsonl");
        let name = humanize_agent_name(&transcript);
        assert!(
            !name.contains("<teammate-message"),
            "wrapper leaked: {name}"
        );
        assert!(!name.is_empty());
    }

    #[test]
    fn humanizes_agent_name_from_first_user_text() {
        let line = r#"{"type":"user","message":{"content":"Explore the backend of the CrewHub repo and report"}}"#;
        assert_eq!(
            humanize_agent_name(line),
            "Explore the backend of the CrewHub…"
        );
        assert_eq!(humanize_agent_name(""), "subagent");
    }
}
