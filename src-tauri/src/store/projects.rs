use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub folder_path: String,
    pub docs_path: Option<String>,
    pub status: String,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub created_at: i64,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewProject {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub folder_path: String,
    pub docs_path: Option<String>,
}

fn row_to_project(r: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get("id")?,
        name: r.get("name")?,
        description: r.get("description")?,
        icon: r.get("icon")?,
        color: r.get("color")?,
        folder_path: r.get("folder_path")?,
        docs_path: r.get("docs_path")?,
        status: r.get("status")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn create_project(&self, new: NewProject) -> anyhow::Result<Project> {
        let now = Self::now_ms();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, description, icon, color, folder_path, docs_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                rusqlite::params![id, new.name, new.description, new.icon, new.color, new.folder_path, new.docs_path, now],
            )?;
        }
        Ok(self.get_project(&id)?.expect("just inserted"))
    }

    pub fn get_project(&self, id: &str) -> anyhow::Result<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM projects WHERE id = ?1")?;
        match stmt.query_row([id], row_to_project) {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_projects(&self) -> anyhow::Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_project)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_project(&self, mut project: Project) -> anyhow::Result<Project> {
        project.updated_at = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE projects SET name=?2, description=?3, icon=?4, color=?5, folder_path=?6, docs_path=?7,
             status=?8, updated_at=?9 WHERE id=?1",
            rusqlite::params![
                project.id,
                project.name,
                project.description,
                project.icon,
                project.color,
                project.folder_path,
                project.docs_path,
                project.status,
                project.updated_at
            ],
        )?;
        Ok(project)
    }

    pub fn delete_project(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM projects WHERE id = ?1", [id])? > 0)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn new(name: &str) -> NewProject {
        NewProject {
            name: name.into(),
            description: None,
            icon: None,
            color: None,
            folder_path: format!("/tmp/{name}"),
            docs_path: None,
        }
    }

    #[test]
    fn create_get_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let p = s.create_project(new("Alpha")).unwrap();
        assert_eq!(p.status, "active");
        assert_eq!(s.get_project(&p.id).unwrap(), Some(p));
    }

    #[test]
    fn list_orders_by_name() {
        let s = Store::open_in_memory().unwrap();
        for n in ["Zeta", "Alpha"] {
            s.create_project(new(n)).unwrap();
        }
        let names: Vec<_> = s
            .list_projects()
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, vec!["Alpha", "Zeta"]);
    }

    #[test]
    fn update_bumps_updated_at_and_persists() {
        let s = Store::open_in_memory().unwrap();
        let mut p = s.create_project(new("X")).unwrap();
        let before = p.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        p.status = "archived".into();
        let p2 = s.update_project(p).unwrap();
        assert_eq!(p2.status, "archived");
        assert!(p2.updated_at > before);
    }

    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        let p = s.create_project(new("X")).unwrap();
        assert!(s.delete_project(&p.id).unwrap());
        assert!(!s.delete_project(&p.id).unwrap());
    }
}
