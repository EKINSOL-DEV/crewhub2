//! Room assignment rules (M3 T2, D-M3-10 / G2).
//!
//! CRUD over the `room_rules` table plus the pure [`assign_room`] evaluator.
//! The evaluator runs Rust-side on `SessionEvent::Discovered`/`Updated` (see
//! [`auto_assign_session`]): it writes `session_bindings.room_id` ONLY when no
//! binding row exists for that session — any manual bind/unbind from the UI
//! creates the row, so manual override sticks by construction (no flag column).

use super::Store;
use crate::engine::types::{SessionMeta, SessionOrigin};
use serde::{Deserialize, Serialize};

/// Closed rule types (mirrors the CHECK constraint in migration 001).
pub const ROOM_RULE_TYPES: &[&str] = &["keyword", "model", "path_pattern", "origin"];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct RoomRule {
    pub id: String,
    pub room_id: String,
    /// keyword | model | path_pattern | origin
    pub rule_type: String,
    pub rule_value: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewRoomRule {
    pub room_id: String,
    pub rule_type: String,
    pub rule_value: String,
    pub priority: Option<i32>,
}

fn row_to_rule(r: &rusqlite::Row) -> rusqlite::Result<RoomRule> {
    Ok(RoomRule {
        id: r.get("id")?,
        room_id: r.get("room_id")?,
        rule_type: r.get("rule_type")?,
        rule_value: r.get("rule_value")?,
        priority: r.get("priority")?,
    })
}

fn validate_rule_type(rule_type: &str) -> anyhow::Result<()> {
    if !ROOM_RULE_TYPES.contains(&rule_type) {
        anyhow::bail!(
            "invalid rule_type: {rule_type:?} (valid: {})",
            ROOM_RULE_TYPES.join(", ")
        );
    }
    Ok(())
}

impl Store {
    pub fn create_room_rule(&self, new: NewRoomRule) -> anyhow::Result<RoomRule> {
        validate_rule_type(&new.rule_type)?;
        let rule = RoomRule {
            id: uuid::Uuid::new_v4().to_string(),
            room_id: new.room_id,
            rule_type: new.rule_type,
            rule_value: new.rule_value,
            priority: new.priority.unwrap_or(0),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO room_rules (id, room_id, rule_type, rule_value, priority)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                rule.id,
                rule.room_id,
                rule.rule_type,
                rule.rule_value,
                rule.priority
            ],
        )?;
        Ok(rule)
    }

    /// Rules for one room (or all rooms), priority descending; within equal
    /// priority, insertion order — so a LATER element is a NEWER rule, the
    /// order [`assign_room`]'s tiebreak relies on.
    pub fn list_room_rules(&self, room_id: Option<&str>) -> anyhow::Result<Vec<RoomRule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM room_rules WHERE (?1 IS NULL OR room_id = ?1)
             ORDER BY priority DESC, rowid ASC",
        )?;
        let rows = stmt.query_map([room_id], row_to_rule)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_room_rule(&self, rule: RoomRule) -> anyhow::Result<RoomRule> {
        validate_rule_type(&rule.rule_type)?;
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE room_rules SET room_id=?2, rule_type=?3, rule_value=?4, priority=?5 WHERE id=?1",
            rusqlite::params![
                rule.id,
                rule.room_id,
                rule.rule_type,
                rule.rule_value,
                rule.priority
            ],
        )?;
        if n == 0 {
            anyhow::bail!("room rule not found: {}", rule.id);
        }
        Ok(rule)
    }

    pub fn delete_room_rule(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM room_rules WHERE id = ?1", [id])? > 0)
    }
}

/// Minimal glob for `path_pattern` rules: `*` matches any run of characters
/// (including `/`), `?` matches exactly one. Case-sensitive, no character
/// classes — the rule editor previews exactly this dialect.
pub fn glob_match(pattern: &str, text: &str) -> bool {
    fn inner(p: &[u8], t: &[u8]) -> bool {
        match (p.first(), t.first()) {
            (None, None) => true,
            (Some(b'*'), _) => inner(&p[1..], t) || (!t.is_empty() && inner(p, &t[1..])),
            (Some(b'?'), Some(_)) => inner(&p[1..], &t[1..]),
            (Some(c), Some(d)) if c == d => inner(&p[1..], &t[1..]),
            _ => false,
        }
    }
    inner(pattern.as_bytes(), text.as_bytes())
}

fn rule_matches(rule: &RoomRule, meta: &SessionMeta, summary: Option<&str>) -> bool {
    match rule.rule_type.as_str() {
        "keyword" => {
            let needle = rule.rule_value.to_lowercase();
            if needle.is_empty() {
                return false;
            }
            let dir_name = std::path::Path::new(&meta.project_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            summary
                .map(str::to_lowercase)
                .is_some_and(|s| s.contains(&needle))
                || dir_name.contains(&needle)
        }
        "model" => meta
            .model
            .as_deref()
            .is_some_and(|m| m.to_lowercase().contains(&rule.rule_value.to_lowercase())),
        "path_pattern" => glob_match(&rule.rule_value, &meta.project_path),
        "origin" => {
            let origin = match meta.origin {
                SessionOrigin::Managed => "managed",
                SessionOrigin::External => "external",
            };
            rule.rule_value.eq_ignore_ascii_case(origin)
        }
        _ => false,
    }
}

/// Pure evaluator (D-M3-10): highest `priority` wins; ties break on the
/// newest rule. `rules` must be ordered as [`Store::list_room_rules`] returns
/// them (priority desc, then oldest→newest), so the LAST match within the
/// winning priority is the newest.
pub fn assign_room(
    rules: &[RoomRule],
    meta: &SessionMeta,
    summary: Option<&str>,
) -> Option<String> {
    let mut best: Option<&RoomRule> = None;
    for rule in rules {
        if !rule_matches(rule, meta, summary) {
            continue;
        }
        match best {
            // strictly-greater priority replaces; equal priority replaces too
            // (later element = newer rule, newest wins the tie)
            Some(b) if b.priority > rule.priority => {}
            _ => best = Some(rule),
        }
    }
    best.map(|r| r.room_id.clone())
}

/// Engine-hook entry point: evaluate the rules for a session UNLESS a binding
/// row already exists (manual override sticks by existence, D-M3-10). Returns
/// the new binding when one was written so the caller can emit
/// `SessionBindingChanged`.
pub fn auto_assign_session(
    store: &Store,
    meta: &SessionMeta,
    summary: Option<&str>,
) -> anyhow::Result<Option<super::session_bindings::SessionBinding>> {
    if store.get_session_binding(&meta.id.id)?.is_some() {
        return Ok(None);
    }
    let rules = store.list_room_rules(None)?;
    if rules.is_empty() {
        return Ok(None);
    }
    let Some(room_id) = assign_room(&rules, meta, summary) else {
        return Ok(None);
    };
    let binding = store.upsert_session_binding(super::session_bindings::NewSessionBinding {
        session_id: meta.id.id.clone(),
        agent_id: None,
        room_id: Some(room_id),
        display_name: None,
        pinned: false,
    })?;
    Ok(Some(binding))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::types::{SessionId, SessionStatus, UsageTotals};
    use crate::store::rooms::NewRoom;

    fn meta(project_path: &str, model: Option<&str>, origin: SessionOrigin) -> SessionMeta {
        SessionMeta {
            id: SessionId {
                provider: "claude-code".into(),
                id: "sess-1".into(),
            },
            origin,
            project_path: project_path.into(),
            model: model.map(Into::into),
            status: SessionStatus::Idle,
            activity_detail: None,
            parent: None,
            usage: UsageTotals::default(),
            git_branch: None,
            last_activity_ms: 0,
        }
    }

    fn rule(room: &str, ty: &str, value: &str, priority: i32) -> RoomRule {
        RoomRule {
            id: format!("r-{room}-{ty}-{value}-{priority}"),
            room_id: room.into(),
            rule_type: ty.into(),
            rule_value: value.into(),
            priority,
        }
    }

    fn store_with_room(name: &str) -> (Store, String) {
        let s = Store::open_in_memory().unwrap();
        let room = s
            .create_room(NewRoom {
                project_id: None,
                name: name.into(),
                icon: None,
                color: None,
                is_hq: None,
            })
            .unwrap();
        (s, room.id)
    }

    // ---- CRUD ----

    #[test]
    fn crud_roundtrip_with_validation() {
        let (s, room_id) = store_with_room("Lab");
        let err = s
            .create_room_rule(NewRoomRule {
                room_id: room_id.clone(),
                rule_type: "vibes".into(),
                rule_value: "x".into(),
                priority: None,
            })
            .unwrap_err();
        assert!(err.to_string().contains("invalid rule_type"), "got: {err}");

        let mut r = s
            .create_room_rule(NewRoomRule {
                room_id: room_id.clone(),
                rule_type: "keyword".into(),
                rule_value: "fox".into(),
                priority: Some(5),
            })
            .unwrap();
        assert_eq!(s.list_room_rules(Some(&room_id)).unwrap(), vec![r.clone()]);
        assert!(s.list_room_rules(Some("other")).unwrap().is_empty());

        r.rule_value = "badger".into();
        let r = s.update_room_rule(r).unwrap();
        assert_eq!(s.list_room_rules(None).unwrap()[0].rule_value, "badger");

        let mut ghost = r.clone();
        ghost.id = "ghost".into();
        let err = s.update_room_rule(ghost).unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");

        assert!(s.delete_room_rule(&r.id).unwrap());
        assert!(!s.delete_room_rule(&r.id).unwrap());
    }

    #[test]
    fn rules_require_existing_room_and_cascade_on_room_delete() {
        let (s, room_id) = store_with_room("Lab");
        let err = s
            .create_room_rule(NewRoomRule {
                room_id: "ghost".into(),
                rule_type: "keyword".into(),
                rule_value: "x".into(),
                priority: None,
            })
            .unwrap_err();
        assert!(err.to_string().contains("FOREIGN KEY"), "got: {err}");

        s.create_room_rule(NewRoomRule {
            room_id: room_id.clone(),
            rule_type: "keyword".into(),
            rule_value: "x".into(),
            priority: None,
        })
        .unwrap();
        assert!(s.delete_room(&room_id).unwrap());
        assert!(s.list_room_rules(None).unwrap().is_empty());
    }

    #[test]
    fn list_orders_priority_desc_then_insertion() {
        let (s, room_id) = store_with_room("Lab");
        for (value, priority) in [("low", 0), ("old-high", 9), ("new-high", 9)] {
            s.create_room_rule(NewRoomRule {
                room_id: room_id.clone(),
                rule_type: "keyword".into(),
                rule_value: value.into(),
                priority: Some(priority),
            })
            .unwrap();
        }
        let values: Vec<_> = s
            .list_room_rules(None)
            .unwrap()
            .into_iter()
            .map(|r| r.rule_value)
            .collect();
        assert_eq!(values, vec!["old-high", "new-high", "low"]);
    }

    // ---- evaluator ----

    #[test]
    fn keyword_matches_summary_and_project_dir_name_case_insensitive() {
        let m = meta("/Users/x/code/CrewHub", None, SessionOrigin::External);
        let r = [rule("a", "keyword", "crewhub", 0)];
        assert_eq!(assign_room(&r, &m, None), Some("a".into()));

        let m2 = meta("/Users/x/code/other", None, SessionOrigin::External);
        assert_eq!(assign_room(&r, &m2, None), None);
        assert_eq!(
            assign_room(&r, &m2, Some("Fixing the CrewHub board")),
            Some("a".into())
        );
        // empty keyword never matches everything
        let empty = [rule("a", "keyword", "", 0)];
        assert_eq!(assign_room(&empty, &m, Some("anything")), None);
    }

    #[test]
    fn model_rule_is_substring_on_meta_model() {
        let r = [rule("a", "model", "haiku", 0)];
        let m = meta(
            "/p",
            Some("claude-haiku-4-5-20251001"),
            SessionOrigin::Managed,
        );
        assert_eq!(assign_room(&r, &m, None), Some("a".into()));
        let m2 = meta("/p", Some("claude-sonnet-4-5"), SessionOrigin::Managed);
        assert_eq!(assign_room(&r, &m2, None), None);
        let m3 = meta("/p", None, SessionOrigin::Managed);
        assert_eq!(assign_room(&r, &m3, None), None);
    }

    #[test]
    fn path_pattern_rule_globs_project_path() {
        let r = [rule("a", "path_pattern", "/Users/*/code/crewhub*", 0)];
        let m = meta("/Users/nicky/code/crewhub2", None, SessionOrigin::External);
        assert_eq!(assign_room(&r, &m, None), Some("a".into()));
        let m2 = meta("/srv/crewhub2", None, SessionOrigin::External);
        assert_eq!(assign_room(&r, &m2, None), None);
    }

    #[test]
    fn origin_rule_matches_managed_external() {
        let managed = [rule("a", "origin", "managed", 0)];
        let m = meta("/p", None, SessionOrigin::Managed);
        let e = meta("/p", None, SessionOrigin::External);
        assert_eq!(assign_room(&managed, &m, None), Some("a".into()));
        assert_eq!(assign_room(&managed, &e, None), None);
        let external = [rule("b", "origin", "External", 0)];
        assert_eq!(assign_room(&external, &e, None), Some("b".into()));
    }

    #[test]
    fn highest_priority_wins_ties_break_newest() {
        let m = meta("/p/crew", Some("haiku"), SessionOrigin::Managed);
        // ordered as list_room_rules returns: priority desc, oldest->newest
        let rules = [
            rule("high", "model", "haiku", 9),
            rule("tie-old", "origin", "managed", 5),
            rule("tie-new", "keyword", "crew", 5),
            rule("low", "keyword", "crew", 1),
        ];
        assert_eq!(assign_room(&rules, &m, None), Some("high".into()));
        // drop the high-priority rule: the 5-tie resolves to the newest
        assert_eq!(assign_room(&rules[1..], &m, None), Some("tie-new".into()));
        // no match at all
        let none = meta("/other", None, SessionOrigin::External);
        assert_eq!(assign_room(&rules, &none, None), None);
    }

    #[test]
    fn glob_match_dialect() {
        assert!(glob_match("*", "anything"));
        assert!(glob_match("/a/*/c", "/a/b/c"));
        assert!(glob_match("/a/*", "/a/b/c/d")); // * crosses '/'
        assert!(glob_match("?at", "cat"));
        assert!(!glob_match("?at", "at"));
        assert!(!glob_match("/a/b", "/a/b/c"));
        assert!(glob_match("", ""));
    }

    // ---- auto-assign hook ----

    #[test]
    fn auto_assign_writes_binding_once_and_respects_manual_rows() {
        let (s, room_id) = store_with_room("Lab");
        s.create_room_rule(NewRoomRule {
            room_id: room_id.clone(),
            rule_type: "origin".into(),
            rule_value: "external".into(),
            priority: None,
        })
        .unwrap();
        let m = meta("/p", None, SessionOrigin::External);

        let binding = auto_assign_session(&s, &m, None).unwrap().unwrap();
        assert_eq!(binding.session_id, "sess-1");
        assert_eq!(binding.room_id.as_deref(), Some(room_id.as_str()));

        // second sight: the row exists now -> untouched, no re-assignment
        assert!(auto_assign_session(&s, &m, None).unwrap().is_none());

        // manual override sticks: even an all-null row blocks auto-assign
        let m2 = SessionMeta {
            id: SessionId {
                provider: "claude-code".into(),
                id: "sess-2".into(),
            },
            ..m.clone()
        };
        s.upsert_session_binding(crate::store::session_bindings::NewSessionBinding {
            session_id: "sess-2".into(),
            agent_id: None,
            room_id: None,
            display_name: None,
            pinned: false,
        })
        .unwrap();
        assert!(auto_assign_session(&s, &m2, None).unwrap().is_none());
        assert_eq!(
            s.get_session_binding("sess-2").unwrap().unwrap().room_id,
            None,
            "manual (null) binding must never be overwritten"
        );
    }

    #[test]
    fn auto_assign_without_rules_or_match_is_a_noop() {
        let (s, room_id) = store_with_room("Lab");
        let m = meta("/p", None, SessionOrigin::External);
        // no rules at all
        assert!(auto_assign_session(&s, &m, None).unwrap().is_none());
        // rules exist but none match
        s.create_room_rule(NewRoomRule {
            room_id,
            rule_type: "origin".into(),
            rule_value: "managed".into(),
            priority: None,
        })
        .unwrap();
        assert!(auto_assign_session(&s, &m, None).unwrap().is_none());
        assert!(s.get_session_binding("sess-1").unwrap().is_none());
    }
}
