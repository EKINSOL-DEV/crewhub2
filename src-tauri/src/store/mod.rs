pub mod agents;
pub mod projects;
pub mod rooms;
pub mod session_bindings;
pub mod settings;
pub mod tasks;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::path::Path;
use std::sync::Mutex;

pub struct Store {
    /// Public for integration tests and provider-internal SQL; app code goes through typed methods.
    pub conn: Mutex<Connection>,
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../../migrations/001_init.sql")),
        M::up(include_str!("../../migrations/002_history_fts.sql")),
    ])
}

impl Store {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations().to_latest(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn open_in_memory() -> anyhow::Result<Self> {
        let mut conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations().to_latest(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn now_ms() -> i64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        migrations().validate().unwrap();
    }

    #[test]
    fn opens_and_migrates_in_memory() {
        let s = Store::open_in_memory().unwrap();
        let n: i64 = s
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n >= 17, "expected >= 17 tables, got {n}");
    }

    #[test]
    fn bundled_sqlite_has_fts5() {
        let s = Store::open_in_memory().unwrap();
        let n: i64 = s
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM pragma_compile_options WHERE compile_options LIKE '%FTS5%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n >= 1, "bundled sqlite must have FTS5 enabled");
    }

    #[test]
    fn opens_on_disk_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(&dir.path().join("nested/crewhub.db")).unwrap();
        drop(s);
        assert!(dir.path().join("nested/crewhub.db").exists());
    }
}
