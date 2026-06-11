//! CrewHub-side metadata attached to engine sessions (table since M0).
//!
//! The engine stays CrewHub-agnostic: `SessionMeta` carries no agent/room.
//! The UI joins these bindings to sessions by the provider-local session id
//! (M2 plan §2) — display names, pinning and "adopt into the crew" live here.

use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SessionBinding {
    pub session_id: String,
    pub agent_id: Option<String>,
    pub room_id: Option<String>,
    pub display_name: Option<String>,
    pub pinned: bool,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub updated_at: i64,
}

/// Upsert input: the full desired state for one session (no partial patch —
/// the UI always knows the current binding it is editing).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct NewSessionBinding {
    pub session_id: String,
    pub agent_id: Option<String>,
    pub room_id: Option<String>,
    pub display_name: Option<String>,
    pub pinned: bool,
}

fn row_to_binding(r: &rusqlite::Row) -> rusqlite::Result<SessionBinding> {
    Ok(SessionBinding {
        session_id: r.get("session_id")?,
        agent_id: r.get("agent_id")?,
        room_id: r.get("room_id")?,
        display_name: r.get("display_name")?,
        pinned: r.get::<_, i64>("pinned")? != 0,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn upsert_session_binding(&self, new: NewSessionBinding) -> anyhow::Result<SessionBinding> {
        let now = Self::now_ms();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO session_bindings (session_id, agent_id, room_id, display_name, pinned, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(session_id) DO UPDATE SET
                   agent_id=?2, room_id=?3, display_name=?4, pinned=?5, updated_at=?6",
                rusqlite::params![
                    new.session_id,
                    new.agent_id,
                    new.room_id,
                    new.display_name,
                    new.pinned as i64,
                    now
                ],
            )?;
        }
        Ok(self
            .get_session_binding(&new.session_id)?
            .expect("just upserted"))
    }

    pub fn get_session_binding(&self, session_id: &str) -> anyhow::Result<Option<SessionBinding>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM session_bindings WHERE session_id = ?1")?;
        match stmt.query_row([session_id], row_to_binding) {
            Ok(b) => Ok(Some(b)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_session_bindings(&self) -> anyhow::Result<Vec<SessionBinding>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM session_bindings ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], row_to_binding)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn delete_session_binding(&self, session_id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute(
            "DELETE FROM session_bindings WHERE session_id = ?1",
            [session_id],
        )? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(session_id: &str) -> NewSessionBinding {
        NewSessionBinding {
            session_id: session_id.into(),
            agent_id: None,
            room_id: None,
            display_name: None,
            pinned: false,
        }
    }

    #[test]
    fn upsert_creates_then_updates_in_place() {
        let s = Store::open_in_memory().unwrap();
        let b = s.upsert_session_binding(new("sess-1")).unwrap();
        assert!(!b.pinned);
        assert_eq!(s.list_session_bindings().unwrap().len(), 1);

        let b2 = s
            .upsert_session_binding(NewSessionBinding {
                display_name: Some("Scout".into()),
                pinned: true,
                ..new("sess-1")
            })
            .unwrap();
        assert_eq!(b2.display_name.as_deref(), Some("Scout"));
        assert!(b2.pinned);
        assert!(b2.updated_at >= b.updated_at);
        // still one row — keyed by session id
        assert_eq!(s.list_session_bindings().unwrap().len(), 1);
        assert_eq!(s.get_session_binding("sess-1").unwrap(), Some(b2));
    }

    #[test]
    fn binding_to_unknown_agent_is_a_foreign_key_error() {
        let s = Store::open_in_memory().unwrap();
        let err = s
            .upsert_session_binding(NewSessionBinding {
                agent_id: Some("ghost".into()),
                ..new("sess-1")
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("FOREIGN KEY"),
            "expected FK error, got: {err}"
        );
    }

    #[test]
    fn deleting_the_agent_unbinds_but_keeps_the_row() {
        let s = Store::open_in_memory().unwrap();
        let agent = s
            .create_agent(crate::store::agents::NewAgent {
                name: "Bot".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        s.upsert_session_binding(NewSessionBinding {
            agent_id: Some(agent.id.clone()),
            display_name: Some("kept".into()),
            ..new("sess-1")
        })
        .unwrap();
        assert!(s.delete_agent(&agent.id).unwrap());
        let b = s.get_session_binding("sess-1").unwrap().unwrap();
        assert_eq!(b.agent_id, None); // ON DELETE SET NULL
        assert_eq!(b.display_name.as_deref(), Some("kept"));
    }

    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        s.upsert_session_binding(new("sess-1")).unwrap();
        assert!(s.delete_session_binding("sess-1").unwrap());
        assert!(!s.delete_session_binding("sess-1").unwrap());
        assert!(s.get_session_binding("sess-1").unwrap().is_none());
    }
}
