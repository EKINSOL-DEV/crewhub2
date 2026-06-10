use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Room {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub sort_order: i64,
    pub is_hq: bool,
    pub style_json: Option<String>,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub created_at: i64,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewRoom {
    pub project_id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_hq: Option<bool>,
}

fn row_to_room(r: &rusqlite::Row) -> rusqlite::Result<Room> {
    Ok(Room {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        name: r.get("name")?,
        icon: r.get("icon")?,
        color: r.get("color")?,
        sort_order: r.get("sort_order")?,
        is_hq: r.get::<_, i64>("is_hq")? != 0,
        style_json: r.get("style_json")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn create_room(&self, new: NewRoom) -> anyhow::Result<Room> {
        let now = Self::now_ms();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO rooms (id, project_id, name, icon, color, is_hq, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                rusqlite::params![id, new.project_id, new.name, new.icon, new.color, new.is_hq.unwrap_or(false) as i64, now],
            )?;
        }
        Ok(self.get_room(&id)?.expect("just inserted"))
    }

    pub fn get_room(&self, id: &str) -> anyhow::Result<Option<Room>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM rooms WHERE id = ?1")?;
        match stmt.query_row([id], row_to_room) {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_rooms(&self) -> anyhow::Result<Vec<Room>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT * FROM rooms ORDER BY sort_order, name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_room)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_room(&self, mut room: Room) -> anyhow::Result<Room> {
        room.updated_at = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE rooms SET project_id=?2, name=?3, icon=?4, color=?5, sort_order=?6, is_hq=?7,
             style_json=?8, updated_at=?9 WHERE id=?1",
            rusqlite::params![
                room.id,
                room.project_id,
                room.name,
                room.icon,
                room.color,
                room.sort_order,
                room.is_hq as i64,
                room.style_json,
                room.updated_at
            ],
        )?;
        Ok(room)
    }

    pub fn delete_room(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM rooms WHERE id = ?1", [id])? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::projects::tests as projects_tests;

    fn new(name: &str, project_id: Option<String>) -> NewRoom {
        NewRoom {
            project_id,
            name: name.into(),
            icon: None,
            color: None,
            is_hq: None,
        }
    }

    #[test]
    fn create_get_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_room(new("Lab", None)).unwrap();
        assert!(!r.is_hq);
        assert_eq!(s.get_room(&r.id).unwrap(), Some(r));
    }

    #[test]
    fn list_orders_by_sort_then_name() {
        let s = Store::open_in_memory().unwrap();
        for n in ["Zaal", "Atrium"] {
            s.create_room(new(n, None)).unwrap();
        }
        let names: Vec<_> = s
            .list_rooms()
            .unwrap()
            .into_iter()
            .map(|r| r.name)
            .collect();
        assert_eq!(names, vec!["Atrium", "Zaal"]);
    }

    #[test]
    fn update_bumps_updated_at_and_persists() {
        let s = Store::open_in_memory().unwrap();
        let mut r = s.create_room(new("X", None)).unwrap();
        let before = r.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        r.sort_order = 5;
        let r2 = s.update_room(r).unwrap();
        assert_eq!(r2.sort_order, 5);
        assert!(r2.updated_at > before);
    }

    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_room(new("X", None)).unwrap();
        assert!(s.delete_room(&r.id).unwrap());
        assert!(!s.delete_room(&r.id).unwrap());
    }

    #[test]
    fn delete_project_cascades_rooms() {
        let s = Store::open_in_memory().unwrap();
        let p = s.create_project(projects_tests::new("P")).unwrap();
        let r = s.create_room(new("InP", Some(p.id.clone()))).unwrap();
        assert!(s.delete_project(&p.id).unwrap());
        assert_eq!(s.get_room(&r.id).unwrap(), None);
    }
}
