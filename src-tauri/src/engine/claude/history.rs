//! Archived-session listing + lazy FTS5 search over transcripts on disk.
//!
//! Transcripts stay where Claude Code wrote them; only a text index lives in
//! the CrewHub DB, built incrementally per session (byte-offset tracked).

use super::lineage::extract_header;
use super::transcript::parse_line;
use super::PROVIDER_ID;
use crate::engine::types::{ArchivedSession, SearchHit, SessionId};
use crate::store::Store;
use std::path::{Path, PathBuf};

/// List past sessions (main transcripts only) with lightweight summaries,
/// optionally filtered to a project root (exact path or any path under it).
/// Cheap by design: header lines + first user text + file mtime; no full parse.
pub fn list_archived_sessions(root: &Path, project_filter: Option<&str>) -> Vec<ArchivedSession> {
    let mut out = Vec::new();
    let Ok(projects) = std::fs::read_dir(root) else {
        return out;
    };
    for project in projects.flatten() {
        let pdir = project.path();
        if !pdir.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&pdir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|e| e != "jsonl") {
                continue;
            }
            if let Some(s) = summarize(&path) {
                if project_filter.is_none_or(|f| matches_project(&s.project_path, f)) {
                    out.push(s);
                }
            }
        }
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.last_modified_ms));
    out
}

/// `session_path` matches `filter` when equal or anywhere under it
/// (worktrees under the project root match — M2 plan T11 predicate).
fn matches_project(session_path: &str, filter: &str) -> bool {
    let filter = filter.trim_end_matches('/');
    session_path == filter
        || session_path
            .strip_prefix(filter)
            .is_some_and(|rest| rest.starts_with('/'))
}

fn summarize(path: &Path) -> Option<ArchivedSession> {
    let id = path.file_stem()?.to_string_lossy().to_string();
    let modified = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let mut header_metas = Vec::new();
    let mut first_user_text: Option<String> = None;
    let content = read_head(path, 64 * 1024).ok()?;
    for line in content.lines().take(50) {
        if let Some(parsed) = parse_line(line) {
            header_metas.push(parsed.meta.clone());
            if first_user_text.is_none() {
                for item in parsed.items {
                    if let crate::engine::types::TranscriptItem::UserText { text, .. } = item {
                        first_user_text = Some(text.chars().take(120).collect());
                        break;
                    }
                }
            }
        }
    }
    let header = extract_header(header_metas.into_iter());
    Some(ArchivedSession {
        id: SessionId {
            provider: PROVIDER_ID.into(),
            id,
        },
        project_path: header.cwd.unwrap_or_default(),
        summary: first_user_text.unwrap_or_default(),
        last_modified_ms: modified,
    })
}

fn read_head(path: &Path, max: usize) -> std::io::Result<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut buf = vec![0u8; max];
    let n = f.read(&mut buf)?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Incrementally index a transcript into the FTS table (resumes from stored byte offset).
pub fn index_session(store: &Store, session_id: &str, path: &Path) -> anyhow::Result<()> {
    let file_len = std::fs::metadata(path)?.len() as i64;
    let conn = store.conn.lock().unwrap();
    let offset: i64 = conn
        .query_row(
            "SELECT indexed_offset FROM fts_index_state WHERE session_id=?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if offset >= file_len {
        return Ok(());
    }
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path)?;
    f.seek(SeekFrom::Start(offset as u64))?;
    let mut chunk = String::new();
    f.read_to_string(&mut chunk)?;
    // only index complete lines; remainder is re-read next time
    let complete_until = chunk.rfind('\n').map(|i| i + 1).unwrap_or(0);
    let indexed_offset = offset + complete_until as i64;

    let mut insert = conn.prepare(
        "INSERT INTO transcript_fts (session_id, ts, role, text) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for line in chunk[..complete_until].lines() {
        let Some(parsed) = parse_line(line) else {
            continue;
        };
        for item in parsed.items {
            use crate::engine::types::TranscriptItem::*;
            let (role, text, ts) = match item {
                UserText { text, ts } => ("user", text, ts),
                AssistantText { text, ts } => ("assistant", text, ts),
                _ => continue,
            };
            insert.execute(rusqlite::params![session_id, ts, role, text])?;
        }
    }
    conn.execute(
        "INSERT INTO fts_index_state (session_id, indexed_offset, indexed_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET indexed_offset=?2, indexed_at=?3",
        rusqlite::params![session_id, indexed_offset, Store::now_ms()],
    )?;
    Ok(())
}

/// Lazily index every transcript under `root`, then run the FTS query.
pub fn search(store: &Store, root: &Path, query: &str) -> anyhow::Result<Vec<SearchHit>> {
    for session in list_archived_sessions(root, None) {
        let path = transcript_path(root, &session)?;
        if let Some(p) = path {
            let _ = index_session(store, &session.id.id, &p);
        }
    }
    let conn = store.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT session_id, ts, role, snippet(transcript_fts, 3, '[', ']', '…', 12)
         FROM transcript_fts WHERE transcript_fts MATCH ?1 ORDER BY rank LIMIT 50",
    )?;
    let rows = stmt.query_map([query], |r| {
        Ok(SearchHit {
            session_id: SessionId {
                provider: PROVIDER_ID.into(),
                id: r.get(0)?,
            },
            ts: r.get(1)?,
            role: r.get(2)?,
            snippet: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn transcript_path(root: &Path, session: &ArchivedSession) -> anyhow::Result<Option<PathBuf>> {
    let Ok(projects) = std::fs::read_dir(root) else {
        return Ok(None);
    };
    for project in projects.flatten() {
        let candidate = project.path().join(format!("{}.jsonl", session.id.id));
        if candidate.is_file() {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_session(root: &Path, project: &str, id: &str, texts: &[&str]) -> PathBuf {
        let dir = root.join(project);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{id}.jsonl"));
        let mut body = String::new();
        for t in texts {
            body.push_str(&format!(
                r#"{{"type":"user","sessionId":"{id}","timestamp":"2026-06-10T10:00:00.000Z","cwd":"/p/{project}","message":{{"content":"{t}"}}}}"#
            ));
            body.push('\n');
        }
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn lists_archived_sessions_with_summary() {
        let dir = tempfile::tempdir().unwrap();
        write_session(dir.path(), "proj-a", "s1", &["build the parser please"]);
        write_session(dir.path(), "proj-b", "s2", &["fix the login bug"]);
        let list = list_archived_sessions(dir.path(), None);
        assert_eq!(list.len(), 2);
        let s1 = list.iter().find(|s| s.id.id == "s1").unwrap();
        assert_eq!(s1.summary, "build the parser please");
        assert_eq!(s1.project_path, "/p/proj-a");
    }

    #[test]
    fn project_filter_matches_exact_and_subpaths_only() {
        let dir = tempfile::tempdir().unwrap();
        write_session(dir.path(), "proj-a", "s1", &["one"]); // cwd /p/proj-a
        write_session(dir.path(), "proj-a-sibling", "s2", &["two"]); // cwd /p/proj-a-sibling
        let list = list_archived_sessions(dir.path(), Some("/p/proj-a"));
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id.id, "s1");
        // trailing slash tolerated; worktree-style subpaths match
        assert!(matches_project("/p/proj-a/worktrees/w1", "/p/proj-a/"));
        assert!(!matches_project("/p/proj-a-sibling", "/p/proj-a"));
        assert!(list_archived_sessions(dir.path(), Some("/elsewhere")).is_empty());
    }

    #[test]
    fn search_indexes_lazily_and_finds_hits_incrementally() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open_in_memory().unwrap();
        let path = write_session(
            dir.path(),
            "proj-a",
            "s1",
            &["the quick brown fox", "nothing here"],
        );

        let hits = search(&store, dir.path(), "fox").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].session_id.id, "s1");
        assert_eq!(hits[0].role, "user");
        assert!(hits[0].snippet.contains("[fox]"));

        // append a new line -> incremental re-index picks it up, no duplicates of old lines
        let mut body = std::fs::read_to_string(&path).unwrap();
        body.push_str(r#"{"type":"user","sessionId":"s1","timestamp":"2026-06-10T10:01:00.000Z","message":{"content":"another fox appears"}}"#);
        body.push('\n');
        std::fs::write(&path, body).unwrap();

        let hits = search(&store, dir.path(), "fox").unwrap();
        assert_eq!(hits.len(), 2);
    }

    #[test]
    fn search_with_no_matches_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open_in_memory().unwrap();
        write_session(dir.path(), "proj-a", "s1", &["hello world"]);
        assert!(search(&store, dir.path(), "zebra").unwrap().is_empty());
    }
}
