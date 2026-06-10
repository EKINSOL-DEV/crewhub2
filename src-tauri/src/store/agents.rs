use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub avatar: Option<String>,
    pub default_model: Option<String>,
    pub project_path: Option<String>,
    pub permission_mode: String,
    pub system_prompt: Option<String>,
    pub persona_json: Option<String>,
    pub is_pinned: bool,
    pub auto_spawn: bool,
    pub bio: Option<String>,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub created_at: i64,
    #[specta(type = specta_typescript::Number)] // unix-ms fits in f64
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewAgent {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub default_model: Option<String>,
    pub project_path: Option<String>,
    pub permission_mode: Option<String>,
    pub system_prompt: Option<String>,
}

fn row_to_agent(r: &rusqlite::Row) -> rusqlite::Result<Agent> {
    Ok(Agent {
        id: r.get("id")?,
        name: r.get("name")?,
        icon: r.get("icon")?,
        color: r.get("color")?,
        avatar: r.get("avatar")?,
        default_model: r.get("default_model")?,
        project_path: r.get("project_path")?,
        permission_mode: r.get("permission_mode")?,
        system_prompt: r.get("system_prompt")?,
        persona_json: r.get("persona_json")?,
        is_pinned: r.get::<_, i64>("is_pinned")? != 0,
        auto_spawn: r.get::<_, i64>("auto_spawn")? != 0,
        bio: r.get("bio")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn create_agent(&self, new: NewAgent) -> anyhow::Result<Agent> {
        let now = Self::now_ms();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO agents (id, name, icon, color, default_model, project_path, permission_mode, system_prompt, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                rusqlite::params![
                    id,
                    new.name,
                    new.icon,
                    new.color,
                    new.default_model,
                    new.project_path,
                    new.permission_mode.unwrap_or_else(|| "default".into()),
                    new.system_prompt,
                    now
                ],
            )?;
        }
        Ok(self.get_agent(&id)?.expect("just inserted"))
    }

    pub fn get_agent(&self, id: &str) -> anyhow::Result<Option<Agent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM agents WHERE id = ?1")?;
        match stmt.query_row([id], row_to_agent) {
            Ok(a) => Ok(Some(a)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_agents(&self) -> anyhow::Result<Vec<Agent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM agents ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_agent)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_agent(&self, mut agent: Agent) -> anyhow::Result<Agent> {
        agent.updated_at = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE agents SET name=?2, icon=?3, color=?4, avatar=?5, default_model=?6, project_path=?7,
             permission_mode=?8, system_prompt=?9, persona_json=?10, is_pinned=?11, auto_spawn=?12,
             bio=?13, updated_at=?14 WHERE id=?1",
            rusqlite::params![
                agent.id,
                agent.name,
                agent.icon,
                agent.color,
                agent.avatar,
                agent.default_model,
                agent.project_path,
                agent.permission_mode,
                agent.system_prompt,
                agent.persona_json,
                agent.is_pinned as i64,
                agent.auto_spawn as i64,
                agent.bio,
                agent.updated_at
            ],
        )?;
        Ok(agent)
    }

    pub fn delete_agent(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM agents WHERE id = ?1", [id])? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(name: &str) -> NewAgent {
        NewAgent {
            name: name.into(),
            icon: None,
            color: None,
            default_model: None,
            project_path: None,
            permission_mode: None,
            system_prompt: None,
        }
    }

    #[test]
    fn create_get_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let a = s.create_agent(new("Botje")).unwrap();
        assert_eq!(a.permission_mode, "default");
        assert_eq!(s.get_agent(&a.id).unwrap(), Some(a));
    }

    #[test]
    fn list_orders_by_name() {
        let s = Store::open_in_memory().unwrap();
        for n in ["Zed", "Ann"] {
            s.create_agent(new(n)).unwrap();
        }
        let names: Vec<_> = s
            .list_agents()
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(names, vec!["Ann", "Zed"]);
    }

    #[test]
    fn update_bumps_updated_at_and_persists() {
        let s = Store::open_in_memory().unwrap();
        let mut a = s.create_agent(new("X")).unwrap();
        let before = a.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        a.name = "Y".into();
        let a2 = s.update_agent(a).unwrap();
        assert_eq!(a2.name, "Y");
        assert!(a2.updated_at > before);
        assert_eq!(s.get_agent(&a2.id).unwrap().unwrap().name, "Y");
    }

    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        let a = s.create_agent(new("X")).unwrap();
        assert!(s.delete_agent(&a.id).unwrap());
        assert!(!s.delete_agent(&a.id).unwrap());
    }
}
