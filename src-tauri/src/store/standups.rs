//! Standups persistence (16.4, D-M4-7). Entries record what each agent said —
//! or the honest "(no response 🤷)" row when an agent failed to answer.

use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Standup {
    pub id: String,
    pub title: String,
    pub created_by: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct StandupEntry {
    pub id: String,
    pub standup_id: String,
    pub agent_id: String,
    pub yesterday: Option<String>,
    pub today: Option<String>,
    pub blockers: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub submitted_at: i64,
}

fn row_to_standup(r: &rusqlite::Row) -> rusqlite::Result<Standup> {
    Ok(Standup {
        id: r.get("id")?,
        title: r.get("title")?,
        created_by: r.get("created_by")?,
        created_at: r.get("created_at")?,
    })
}

fn row_to_entry(r: &rusqlite::Row) -> rusqlite::Result<StandupEntry> {
    Ok(StandupEntry {
        id: r.get("id")?,
        standup_id: r.get("standup_id")?,
        agent_id: r.get("agent_id")?,
        yesterday: r.get("yesterday")?,
        today: r.get("today")?,
        blockers: r.get("blockers")?,
        submitted_at: r.get("submitted_at")?,
    })
}

impl Store {
    pub fn create_standup(&self, title: &str, created_by: Option<&str>) -> anyhow::Result<Standup> {
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO standups (id, title, created_by, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, title, created_by, Self::now_ms()],
            )?;
        }
        Ok(self.get_standup(&id)?.expect("just inserted"))
    }

    pub fn get_standup(&self, id: &str) -> anyhow::Result<Option<Standup>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM standups WHERE id=?1")?;
        match stmt.query_row([id], row_to_standup) {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_standups(&self) -> anyhow::Result<Vec<Standup>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM standups ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], row_to_standup)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn add_standup_entry(
        &self,
        standup_id: &str,
        agent_id: &str,
        yesterday: Option<&str>,
        today: Option<&str>,
        blockers: Option<&str>,
    ) -> anyhow::Result<StandupEntry> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO standup_entries (id, standup_id, agent_id, yesterday, today, blockers, submitted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, standup_id, agent_id, yesterday, today, blockers, Self::now_ms()],
        )?;
        let mut stmt = conn.prepare("SELECT * FROM standup_entries WHERE id=?1")?;
        Ok(stmt.query_row([&id], row_to_entry)?)
    }

    pub fn list_standup_entries(&self, standup_id: &str) -> anyhow::Result<Vec<StandupEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT * FROM standup_entries WHERE standup_id=?1 ORDER BY submitted_at")?;
        let rows = stmt.query_map([standup_id], row_to_entry)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standup_with_entries_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let st = s.create_standup("Daily", Some("human")).unwrap();
        assert_eq!(st.title, "Daily");
        s.add_standup_entry(&st.id, "a1", Some("shipped"), Some("testing"), None)
            .unwrap();
        s.add_standup_entry(&st.id, "a2", None, None, Some("(no response 🤷)"))
            .unwrap();
        let entries = s.list_standup_entries(&st.id).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].yesterday.as_deref(), Some("shipped"));
        assert_eq!(entries[1].blockers.as_deref(), Some("(no response 🤷)"));
        assert_eq!(s.list_standups().unwrap().len(), 1);
        assert_eq!(s.get_standup(&st.id).unwrap(), Some(st));
    }
}
