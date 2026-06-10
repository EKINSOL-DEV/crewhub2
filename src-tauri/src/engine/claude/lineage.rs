//! Session header extraction + subagent lineage.
//!
//! Claude Code 2.1 stores subagent transcripts at
//! `<project>/<parent-session-id>/subagents/agent-<agentId>.jsonl`; subagent lines
//! also carry `isSidechain: true` and `agentId`. Lineage therefore comes from the
//! directory layout, confirmed by line metadata.

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

/// Readable display name for a subagent, derived from its first user message
/// (v1 lesson: never show raw `parent=`/id labels).
pub fn humanize_agent_name(transcript: &str) -> String {
    for line in transcript.lines() {
        if let Some(parsed) = parse_line(line) {
            for item in parsed.items {
                if let TranscriptItem::UserText { text, .. } = item {
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
