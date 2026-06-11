//! Cross-session file-conflict detection (provider-neutral).
//!
//! A per-path registry of `(session, last_touch_ms)` entries. When two or more
//! distinct sessions touch the same path within the window (default 120s) a
//! [`SessionEvent::Conflict`] listing every involved session is produced.
//! "Block mode" (replying deny to the hook) is deferred — the signal transport
//! is one-way; see the M1 plan, Task 19.

use crate::engine::types::{SessionEvent, SessionId};
use std::collections::HashMap;

pub const DEFAULT_WINDOW_MS: i64 = 120_000;

pub struct ConflictDetector {
    window_ms: i64,
    /// path → (session, last touch); pruned against the window on every record.
    touches: HashMap<String, Vec<(SessionId, i64)>>,
}

impl Default for ConflictDetector {
    fn default() -> Self {
        Self::new(DEFAULT_WINDOW_MS)
    }
}

impl ConflictDetector {
    pub fn new(window_ms: i64) -> Self {
        Self {
            window_ms,
            touches: HashMap::new(),
        }
    }

    /// Record that `session` touched `path` at `now_ms`. Returns a
    /// [`SessionEvent::Conflict`] when 2+ distinct sessions touched the path
    /// within the window (a touch is inside iff `now_ms - touch_ms < window`).
    /// Sessions are listed in first-touch order.
    pub fn record(&mut self, path: &str, session: SessionId, now_ms: i64) -> Option<SessionEvent> {
        let touches = self.touches.entry(path.to_string()).or_default();
        touches.retain(|(_, ts)| now_ms - *ts < self.window_ms);
        match touches.iter_mut().find(|(s, _)| *s == session) {
            Some(touch) => touch.1 = now_ms,
            None => touches.push((session, now_ms)),
        }
        if touches.len() < 2 {
            return None;
        }
        Some(SessionEvent::Conflict {
            path: path.to_string(),
            sessions: touches.iter().map(|(s, _)| s.clone()).collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sid(id: &str) -> SessionId {
        SessionId {
            provider: "test".into(),
            id: id.into(),
        }
    }

    fn conflict_sessions(event: Option<SessionEvent>) -> Vec<String> {
        match event {
            Some(SessionEvent::Conflict { sessions, .. }) => {
                sessions.into_iter().map(|s| s.id).collect()
            }
            Some(other) => panic!("expected Conflict, got {other:?}"),
            None => Vec::new(),
        }
    }

    #[test]
    fn two_sessions_inside_window_conflict() {
        let mut detector = ConflictDetector::new(120_000);
        assert!(detector.record("/p/a.rs", sid("s1"), 1_000).is_none());
        let event = detector.record("/p/a.rs", sid("s2"), 100_000);
        assert_eq!(conflict_sessions(event), vec!["s1", "s2"]);
    }

    #[test]
    fn outside_window_no_conflict() {
        let mut detector = ConflictDetector::new(120_000);
        assert!(detector.record("/p/a.rs", sid("s1"), 0).is_none());
        // Exactly window_ms later = outside (inside iff delta < window).
        assert!(detector.record("/p/a.rs", sid("s2"), 120_000).is_none());
    }

    #[test]
    fn same_session_repeated_no_conflict() {
        let mut detector = ConflictDetector::new(120_000);
        assert!(detector.record("/p/a.rs", sid("s1"), 1_000).is_none());
        assert!(detector.record("/p/a.rs", sid("s1"), 2_000).is_none());
        assert!(detector.record("/p/a.rs", sid("s1"), 3_000).is_none());
    }

    #[test]
    fn different_paths_no_conflict() {
        let mut detector = ConflictDetector::new(120_000);
        assert!(detector.record("/p/a.rs", sid("s1"), 1_000).is_none());
        assert!(detector.record("/p/b.rs", sid("s2"), 2_000).is_none());
    }

    #[test]
    fn three_sessions_conflict_lists_all_in_first_touch_order() {
        let mut detector = ConflictDetector::new(120_000);
        detector.record("/p/a.rs", sid("s1"), 1_000);
        detector.record("/p/a.rs", sid("s2"), 2_000);
        let event = detector.record("/p/a.rs", sid("s3"), 3_000);
        assert_eq!(conflict_sessions(event), vec!["s1", "s2", "s3"]);
    }

    #[test]
    fn window_is_configurable() {
        let mut detector = ConflictDetector::new(5_000);
        assert!(detector.record("/p/a.rs", sid("s1"), 0).is_none());
        assert!(detector.record("/p/a.rs", sid("s2"), 6_000).is_none());
        // s2's touch (6_000) is still fresh at 9_000 → conflict with s3.
        let event = detector.record("/p/a.rs", sid("s3"), 9_000);
        assert_eq!(conflict_sessions(event), vec!["s2", "s3"]);
    }

    #[test]
    fn refreshed_touch_extends_session_presence() {
        let mut detector = ConflictDetector::new(10_000);
        detector.record("/p/a.rs", sid("s1"), 0);
        detector.record("/p/a.rs", sid("s1"), 8_000); // refresh
        let event = detector.record("/p/a.rs", sid("s2"), 15_000);
        assert_eq!(conflict_sessions(event), vec!["s1", "s2"]);
    }
}
