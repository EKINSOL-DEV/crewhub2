//! Watches `~/.claude/projects` (root injectable) and tails transcript files.
//!
//! Read path for ALL Claude Code sessions — managed and terminal-spawned alike.
//! Emits provider-neutral [`SessionEvent`]s: `Discovered` on first sight,
//! `Item`+`Updated` for new lines, `Removed` when a session leaves the recency window.

use super::lineage::extract_header;
use super::transcript::{parse_line, ParsedLine};
use super::PROVIDER_ID;
use crate::engine::status::{derive, StatusInput};
use crate::engine::types::*;
use notify::{PollWatcher, RecursiveMode, Watcher as _};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub struct WatcherConfig {
    pub root: PathBuf,
    pub recency: Duration,
    /// Poll interval for the filesystem watcher. Polling is used for determinism
    /// in tests and reliability across platforms; default 500ms is imperceptible.
    pub poll_interval: Duration,
    /// How often to sweep for sessions that left the recency window.
    pub sweep_interval: Duration,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::new(),
            recency: Duration::from_secs(30 * 60),
            poll_interval: Duration::from_millis(500),
            sweep_interval: Duration::from_secs(30),
        }
    }
}

struct TailState {
    offset: u64,
    remainder: String,
}

struct SessionState {
    meta: SessionMeta,
    tail_items: Vec<TranscriptItem>,
    seq: u64,
    discovered: bool,
}

pub struct TranscriptWatcher {
    shutdown: tokio::sync::watch::Sender<bool>,
}

impl Drop for TranscriptWatcher {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
    }
}

impl TranscriptWatcher {
    /// Spawns the watcher loop; events flow into `tx`. Must be called within a tokio runtime.
    pub fn start(
        config: WatcherConfig,
        tx: broadcast::Sender<SessionEvent>,
    ) -> anyhow::Result<Self> {
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
        let (fs_tx, fs_rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = PollWatcher::new(
            fs_tx,
            notify::Config::default().with_poll_interval(config.poll_interval),
        )?;
        std::fs::create_dir_all(&config.root).ok();
        watcher.watch(&config.root, RecursiveMode::Recursive)?;

        tokio::task::spawn_blocking(move || {
            let _watcher = watcher; // keep alive
            let mut state = WatchState::new(config, tx);
            state.initial_scan();
            let mut last_sweep = std::time::Instant::now();
            let mut tick: u64 = 0;
            loop {
                // stop on explicit signal OR when the watcher handle was dropped
                if *shutdown_rx.borrow_and_update() || shutdown_rx.has_changed().is_err() {
                    break;
                }
                match fs_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ok(event)) => {
                        for path in event.paths {
                            state.process_path(&path);
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Deterministic fallback: notify backends can coalesce or miss
                        // rapid appends, so stat tracked files every tick and rescan
                        // for new files every ~1s. Cheap at transcript-dir scale.
                        tick += 1;
                        let tracked: Vec<std::path::PathBuf> =
                            state.tails.keys().cloned().collect();
                        for path in tracked {
                            state.process_path(&path);
                        }
                        if tick.is_multiple_of(10) {
                            for path in find_transcripts(&state.config.root) {
                                state.process_path(&path);
                            }
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }
                if last_sweep.elapsed() >= state.config.sweep_interval {
                    state.sweep_recency();
                    last_sweep = std::time::Instant::now();
                }
            }
        });

        Ok(Self {
            shutdown: shutdown_tx,
        })
    }

    pub fn stop(&self) {
        let _ = self.shutdown.send(true);
    }
}

struct WatchState {
    config: WatcherConfig,
    tx: broadcast::Sender<SessionEvent>,
    tails: HashMap<PathBuf, TailState>,
    sessions: HashMap<SessionId, SessionState>,
}

const TAIL_KEEP: usize = 20;

impl WatchState {
    fn new(config: WatcherConfig, tx: broadcast::Sender<SessionEvent>) -> Self {
        Self {
            config,
            tx,
            tails: HashMap::new(),
            sessions: HashMap::new(),
        }
    }

    fn initial_scan(&mut self) {
        for path in find_transcripts(&self.config.root) {
            self.process_path(&path);
        }
    }

    /// Identify which session a transcript file belongs to.
    /// `<project>/<sid>.jsonl` → main session; `<project>/<sid>/subagents/agent-<aid>.jsonl` → subagent.
    fn classify(&self, path: &Path) -> Option<(SessionId, Option<SessionId>)> {
        if path.extension()? != "jsonl" {
            return None;
        }
        let stem = path.file_stem()?.to_string_lossy().to_string();
        let parent_dir = path.parent()?;
        if parent_dir.file_name().is_some_and(|n| n == "subagents") {
            let parent_session = parent_dir
                .parent()?
                .file_name()?
                .to_string_lossy()
                .to_string();
            Some((
                SessionId {
                    provider: PROVIDER_ID.into(),
                    id: stem,
                },
                Some(SessionId {
                    provider: PROVIDER_ID.into(),
                    id: parent_session,
                }),
            ))
        } else {
            Some((
                SessionId {
                    provider: PROVIDER_ID.into(),
                    id: stem,
                },
                None,
            ))
        }
    }

    fn process_path(&mut self, path: &Path) {
        let Some((session_id, parent)) = self.classify(path) else {
            return;
        };
        let Ok(file_len) = std::fs::metadata(path).map(|m| m.len()) else {
            self.remove_session(&session_id);
            return;
        };
        let tail = self.tails.entry(path.to_path_buf()).or_insert(TailState {
            offset: 0,
            remainder: String::new(),
        });
        if file_len < tail.offset {
            // truncated/rotated: start over
            tail.offset = 0;
            tail.remainder.clear();
        }
        if file_len == tail.offset {
            return;
        }
        let Ok(chunk) = read_from(path, tail.offset, file_len) else {
            return;
        };
        tail.offset = file_len;
        let data = format!("{}{}", tail.remainder, chunk);
        let mut lines: Vec<&str> = data.split('\n').collect();
        tail.remainder = if data.ends_with('\n') {
            String::new()
        } else {
            lines.pop().unwrap_or("").to_string()
        };
        if data.ends_with('\n') {
            // split leaves a trailing empty element
            if lines.last() == Some(&"") {
                lines.pop();
            }
        }

        let parsed: Vec<ParsedLine> = lines.iter().filter_map(|l| parse_line(l)).collect();
        if parsed.is_empty() {
            return;
        }
        self.apply_lines(session_id, parent, path, parsed);
    }

    fn apply_lines(
        &mut self,
        id: SessionId,
        parent: Option<SessionId>,
        path: &Path,
        parsed: Vec<ParsedLine>,
    ) {
        let header = extract_header(parsed.iter().map(|p| p.meta.clone()));
        let now = crate::store::Store::now_ms();
        let entry = self
            .sessions
            .entry(id.clone())
            .or_insert_with(|| SessionState {
                meta: SessionMeta {
                    id: id.clone(),
                    origin: SessionOrigin::External,
                    project_path: String::new(),
                    model: None,
                    status: SessionStatus::Idle,
                    activity_detail: None,
                    parent: parent.clone(),
                    usage: UsageTotals::default(),
                    git_branch: None,
                    last_activity_ms: now,
                },
                tail_items: Vec::new(),
                seq: 0,
                discovered: false,
            });

        if entry.meta.project_path.is_empty() {
            entry.meta.project_path = header.cwd.unwrap_or_else(|| path.display().to_string());
        }
        if entry.meta.git_branch.is_none() {
            entry.meta.git_branch = header.git_branch;
        }

        let mut last_ts = entry.meta.last_activity_ms;
        let mut new_items = Vec::new();
        for line in &parsed {
            if let Some(ts) = line.meta.ts {
                last_ts = last_ts.max(ts);
            }
            for item in &line.items {
                if let TranscriptItem::Usage {
                    input_tokens,
                    output_tokens,
                    cache_read,
                    ..
                } = item
                {
                    entry.meta.usage.input_tokens += input_tokens;
                    entry.meta.usage.output_tokens += output_tokens;
                    entry.meta.usage.cache_read_tokens += cache_read;
                }
                new_items.push(item.clone());
            }
        }
        entry.meta.last_activity_ms = last_ts;
        entry.tail_items.extend(new_items.iter().cloned());
        let drop_n = entry.tail_items.len().saturating_sub(TAIL_KEEP);
        entry.tail_items.drain(..drop_n);

        let (status, detail) = derive(&StatusInput {
            tail: &entry.tail_items,
            now_ms: now,
            last_activity_ms: entry.meta.last_activity_ms,
            pending_permission: false,
            process_alive: None,
            recency_ms: self.config.recency.as_millis() as i64,
        });
        entry.meta.status = status;
        entry.meta.activity_detail = detail;

        let first_time = !entry.discovered;
        entry.discovered = true;
        let meta = entry.meta.clone();
        let base_seq = entry.seq;
        entry.seq += new_items.len() as u64;

        if first_time {
            let _ = self
                .tx
                .send(SessionEvent::Discovered { meta: meta.clone() });
            // Initial discovery: meta only; history is loaded on demand (M1 T7 / chat).
            return;
        }
        for (i, item) in new_items.into_iter().enumerate() {
            let _ = self.tx.send(SessionEvent::Item {
                id: id.clone(),
                item,
                seq: base_seq + i as u64,
            });
        }
        let _ = self.tx.send(SessionEvent::Updated { meta });
    }

    fn remove_session(&mut self, id: &SessionId) {
        if self.sessions.remove(id).is_some() {
            let _ = self.tx.send(SessionEvent::Removed { id: id.clone() });
        }
    }

    fn sweep_recency(&mut self) {
        let now = crate::store::Store::now_ms();
        let recency = self.config.recency.as_millis() as i64;
        let stale: Vec<SessionId> = self
            .sessions
            .iter()
            .filter(|(_, s)| now - s.meta.last_activity_ms > recency)
            .map(|(id, _)| id.clone())
            .collect();
        for id in stale {
            self.remove_session(&id);
        }
    }
}

fn read_from(path: &Path, from: u64, to: u64) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path)?;
    f.seek(SeekFrom::Start(from))?;
    let mut buf = vec![0u8; (to - from) as usize];
    f.read_exact(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn find_transcripts(root: &Path) -> Vec<PathBuf> {
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
            let p = entry.path();
            if p.extension().is_some_and(|e| e == "jsonl") {
                out.push(p);
            } else if p.is_dir() {
                let sub = p.join("subagents");
                if let Ok(subs) = std::fs::read_dir(&sub) {
                    out.extend(
                        subs.flatten()
                            .map(|e| e.path())
                            .filter(|p| p.extension().is_some_and(|e| e == "jsonl")),
                    );
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn user_line(text: &str, ts: &str) -> String {
        format!(
            r#"{{"type":"user","sessionId":"s1","timestamp":"{ts}","cwd":"/tmp/proj","message":{{"content":"{text}"}}}}"#
        )
    }

    async fn next_event(rx: &mut broadcast::Receiver<SessionEvent>) -> SessionEvent {
        tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timeout")
            .expect("recv")
    }

    fn test_config(root: &Path) -> WatcherConfig {
        WatcherConfig {
            root: root.to_path_buf(),
            recency: Duration::from_secs(3600),
            poll_interval: Duration::from_millis(50),
            sweep_interval: Duration::from_secs(3600),
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn discovers_then_streams_new_items_with_partial_writes() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj-a");
        std::fs::create_dir_all(&project).unwrap();
        let file = project.join("abc-123.jsonl");
        let now = chrono::Utc::now().to_rfc3339();
        std::fs::write(&file, user_line("first", &now) + "\n").unwrap();

        let (tx, mut rx) = broadcast::channel(64);
        let watcher = TranscriptWatcher::start(test_config(dir.path()), tx).unwrap();

        match next_event(&mut rx).await {
            SessionEvent::Discovered { meta } => {
                assert_eq!(meta.id.id, "abc-123");
                assert_eq!(meta.id.provider, "claude-code");
                assert_eq!(meta.project_path, "/tmp/proj");
            }
            other => panic!("expected Discovered, got {other:?}"),
        }

        // Append a SPLIT line: first half without newline, then the rest.
        let line2 = user_line("second", &now) + "\n";
        let (a, b) = line2.split_at(20);
        {
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&file)
                .unwrap();
            f.write_all(a.as_bytes()).unwrap();
            f.flush().unwrap();
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
        {
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&file)
                .unwrap();
            f.write_all(b.as_bytes()).unwrap();
        }

        let mut got_item = false;
        let mut got_update = false;
        for _ in 0..4 {
            match next_event(&mut rx).await {
                SessionEvent::Item { item, .. } => {
                    assert!(
                        matches!(item, TranscriptItem::UserText { ref text, .. } if text == "second")
                    );
                    got_item = true;
                }
                SessionEvent::Updated { .. } => {
                    got_update = true;
                }
                _ => {}
            }
            if got_item && got_update {
                break;
            }
        }
        assert!(got_item && got_update);
        watcher.stop();
    }

    /// D-M2-3 stitch contract: live `Item.seq` from the watcher and
    /// `read_transcript_page` numbering are the SAME absolute index —
    /// the chat panel merges live events and history pages with zero dedup.
    #[tokio::test(flavor = "multi_thread")]
    async fn live_item_seqs_match_read_transcript_page_numbering() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/transcripts/thinking-images-cc2.1.jsonl");
        let content = std::fs::read_to_string(&fixture).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        let items_of = |line: &str| parse_line(line).map_or(0, |p| p.items.len() as u64);
        let expected_total: u64 = lines.iter().map(|l| items_of(l)).sum();
        let suppressed: u64 = items_of(lines[0]);
        assert!(expected_total > suppressed, "fixture too small");

        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj-x");
        std::fs::create_dir_all(&project).unwrap();
        let file = project.join("fix-1.jsonl");
        // First line exists before the watcher starts: its items are the
        // suppressed history (discovery emits meta only, but seq counts them).
        std::fs::write(&file, format!("{}\n", lines[0])).unwrap();

        let (tx, mut rx) = broadcast::channel(8192);
        let watcher = TranscriptWatcher::start(test_config(dir.path()), tx).unwrap();
        loop {
            if let SessionEvent::Discovered { meta } = next_event(&mut rx).await {
                if meta.id.id == "fix-1" {
                    break;
                }
            }
        }

        {
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&file)
                .unwrap();
            for l in &lines[1..] {
                f.write_all(l.as_bytes()).unwrap();
                f.write_all(b"\n").unwrap();
            }
        }

        let mut live: Vec<(u64, TranscriptItem)> = Vec::new();
        while (live.len() as u64) < expected_total - suppressed {
            if let SessionEvent::Item { id, item, seq } = next_event(&mut rx).await {
                if id.id == "fix-1" {
                    live.push((seq, item));
                }
            }
        }
        watcher.stop();

        let page =
            super::super::history::read_transcript_page(dir.path(), "fix-1", 0, u32::MAX).unwrap();
        assert_eq!(page.total, expected_total);
        assert_eq!(
            live.first().unwrap().0,
            suppressed,
            "live items start right after the suppressed history"
        );
        for (seq, item) in &live {
            let from_page = page
                .items
                .iter()
                .find(|si| si.seq == *seq)
                .unwrap_or_else(|| panic!("page missing seq {seq}"));
            assert_eq!(&from_page.item, item, "item at seq {seq} diverged");
        }
        // this fixture carries file-history snapshots — checkpoints are part
        // of the shared numbering (EKI-64)
        assert!(
            page.items
                .iter()
                .any(|si| matches!(si.item, TranscriptItem::Checkpoint { .. })),
            "expected checkpoint items in fixture page"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn subagent_files_get_parent_lineage() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj-b");
        let subs = project.join("main-1/subagents");
        std::fs::create_dir_all(&subs).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        std::fs::write(
            project.join("main-1.jsonl"),
            user_line("parent msg", &now) + "\n",
        )
        .unwrap();
        std::fs::write(
            subs.join("agent-z9.jsonl"),
            user_line("child msg", &now) + "\n",
        )
        .unwrap();

        let (tx, mut rx) = broadcast::channel(64);
        let watcher = TranscriptWatcher::start(test_config(dir.path()), tx).unwrap();

        let mut seen_child_parent = None;
        for _ in 0..4 {
            if let SessionEvent::Discovered { meta } = next_event(&mut rx).await {
                if meta.id.id == "agent-z9" {
                    seen_child_parent = meta.parent.clone();
                    break;
                }
            }
        }
        assert_eq!(seen_child_parent.map(|p| p.id), Some("main-1".to_string()));
        watcher.stop();
    }
}
