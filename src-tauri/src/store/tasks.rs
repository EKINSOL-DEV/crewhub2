use super::Store;
use serde::{Deserialize, Serialize};

/// Valid task statuses (mirrors the CHECK constraint in migration 001).
/// Single source of truth (the v1 lesson) — MCP re-exports these.
pub const TASK_STATUSES: &[&str] = &["todo", "in_progress", "review", "done", "blocked"];
/// Valid task priorities (mirrors the CHECK constraint in migration 001).
pub const TASK_PRIORITIES: &[&str] = &["low", "medium", "high", "urgent"];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub room_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assignee_agent_id: Option<String>,
    pub created_by: String,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub created_at: i64,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewTask {
    pub project_id: Option<String>,
    pub room_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub assignee_agent_id: Option<String>,
    pub created_by: Option<String>,
}

fn row_to_task(r: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        room_id: r.get("room_id")?,
        title: r.get("title")?,
        description: r.get("description")?,
        status: r.get("status")?,
        priority: r.get("priority")?,
        assignee_agent_id: r.get("assignee_agent_id")?,
        created_by: r.get("created_by")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn create_task(&self, new: NewTask) -> anyhow::Result<Task> {
        let now = Self::now_ms();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO tasks (id, project_id, room_id, title, description, priority, assignee_agent_id, created_by, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                rusqlite::params![
                    id,
                    new.project_id,
                    new.room_id,
                    new.title,
                    new.description,
                    new.priority.unwrap_or_else(|| "medium".into()),
                    new.assignee_agent_id,
                    new.created_by.unwrap_or_else(|| "human".into()),
                    now
                ],
            )?;
        }
        Ok(self.get_task(&id)?.expect("just inserted"))
    }

    pub fn get_task(&self, id: &str) -> anyhow::Result<Option<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM tasks WHERE id = ?1")?;
        match stmt.query_row([id], row_to_task) {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_tasks(&self) -> anyhow::Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM tasks ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], row_to_task)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_task(&self, mut task: Task) -> anyhow::Result<Task> {
        task.updated_at = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET project_id=?2, room_id=?3, title=?4, description=?5, status=?6, priority=?7,
             assignee_agent_id=?8, updated_at=?9 WHERE id=?1",
            rusqlite::params![
                task.id,
                task.project_id,
                task.room_id,
                task.title,
                task.description,
                task.status,
                task.priority,
                task.assignee_agent_id,
                task.updated_at
            ],
        )?;
        Ok(task)
    }

    pub fn delete_task(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM tasks WHERE id = ?1", [id])? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(title: &str) -> NewTask {
        NewTask {
            project_id: None,
            room_id: None,
            title: title.into(),
            description: None,
            priority: None,
            assignee_agent_id: None,
            created_by: None,
        }
    }

    #[test]
    fn create_get_roundtrip_with_defaults() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task(new("Do it")).unwrap();
        assert_eq!(t.status, "todo");
        assert_eq!(t.priority, "medium");
        assert_eq!(t.created_by, "human");
        assert_eq!(s.get_task(&t.id).unwrap(), Some(t));
    }

    #[test]
    fn update_status_persists() {
        let s = Store::open_in_memory().unwrap();
        let mut t = s.create_task(new("X")).unwrap();
        let before = t.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        t.status = "in_progress".into();
        let t2 = s.update_task(t).unwrap();
        assert_eq!(s.get_task(&t2.id).unwrap().unwrap().status, "in_progress");
        assert!(t2.updated_at > before);
    }

    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_task(new("X")).unwrap();
        assert!(s.delete_task(&t.id).unwrap());
        assert!(!s.delete_task(&t.id).unwrap());
    }

    #[test]
    fn invalid_status_rejected_by_check_constraint() {
        let s = Store::open_in_memory().unwrap();
        let mut t = s.create_task(new("X")).unwrap();
        t.status = "nonsense".into();
        assert!(s.update_task(t).is_err());
    }

    #[test]
    fn delete_agent_nulls_assignee() {
        let s = Store::open_in_memory().unwrap();
        let a = s
            .create_agent(crate::store::agents::NewAgent {
                name: "A".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        let mut t = s.create_task(new("X")).unwrap();
        t.assignee_agent_id = Some(a.id.clone());
        let t = s.update_task(t).unwrap();
        assert!(s.delete_agent(&a.id).unwrap());
        assert_eq!(s.get_task(&t.id).unwrap().unwrap().assignee_agent_id, None);
    }
}
