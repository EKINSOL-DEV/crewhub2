//! Prompt template CRUD (17.3, D-M4-8). Templates use the shared `{{name}}`
//! substitution syntax; `variables_json` declares names + optional defaults:
//! `[{"name":"topic","default":"..."}]`. Change notifications ride
//! `SettingChanged { key: "prompt_templates" }` (config-shaped data).

use super::Store;
use serde::{Deserialize, Serialize};

/// The `SettingChanged` key template mutations are announced under.
pub const PROMPT_TEMPLATES_SETTING_KEY: &str = "prompt_templates";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub template: String,
    pub variables_json: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewPromptTemplate {
    pub name: String,
    pub template: String,
    pub variables_json: Option<String>,
    pub project_id: Option<String>,
}

fn row_to_template(r: &rusqlite::Row) -> rusqlite::Result<PromptTemplate> {
    Ok(PromptTemplate {
        id: r.get("id")?,
        name: r.get("name")?,
        template: r.get("template")?,
        variables_json: r.get("variables_json")?,
        project_id: r.get("project_id")?,
    })
}

impl Store {
    pub fn create_prompt_template(&self, new: NewPromptTemplate) -> anyhow::Result<PromptTemplate> {
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO prompt_templates (id, name, template, variables_json, project_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    id,
                    new.name,
                    new.template,
                    new.variables_json,
                    new.project_id
                ],
            )?;
        }
        Ok(self.get_prompt_template(&id)?.expect("just inserted"))
    }

    pub fn get_prompt_template(&self, id: &str) -> anyhow::Result<Option<PromptTemplate>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM prompt_templates WHERE id=?1")?;
        match stmt.query_row([id], row_to_template) {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Global templates (NULL project) plus, when given, the project's own.
    pub fn list_prompt_templates(
        &self,
        project_id: Option<&str>,
    ) -> anyhow::Result<Vec<PromptTemplate>> {
        let conn = self.conn.lock().unwrap();
        match project_id {
            Some(p) => {
                let mut stmt = conn.prepare(
                    "SELECT * FROM prompt_templates WHERE project_id IS NULL OR project_id=?1
                     ORDER BY name",
                )?;
                let rows = stmt.query_map([p], row_to_template)?;
                Ok(rows.collect::<Result<_, _>>()?)
            }
            None => {
                let mut stmt = conn.prepare("SELECT * FROM prompt_templates ORDER BY name")?;
                let rows = stmt.query_map([], row_to_template)?;
                Ok(rows.collect::<Result<_, _>>()?)
            }
        }
    }

    pub fn update_prompt_template(&self, t: PromptTemplate) -> anyhow::Result<PromptTemplate> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE prompt_templates SET name=?2, template=?3, variables_json=?4, project_id=?5 WHERE id=?1",
            rusqlite::params![t.id, t.name, t.template, t.variables_json, t.project_id],
        )?;
        anyhow::ensure!(n == 1, "prompt template not found: {}", t.id);
        Ok(t)
    }

    pub fn delete_prompt_template(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM prompt_templates WHERE id=?1", [id])? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tpl(name: &str, project_id: Option<&str>) -> NewPromptTemplate {
        NewPromptTemplate {
            name: name.into(),
            template: "Review {{path}} for {{focus}}".into(),
            variables_json: Some(r#"[{"name":"path"},{"name":"focus","default":"bugs"}]"#.into()),
            project_id: project_id.map(str::to_string),
        }
    }

    #[test]
    fn crud_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let t = s.create_prompt_template(tpl("review", None)).unwrap();
        assert_eq!(s.get_prompt_template(&t.id).unwrap(), Some(t.clone()));
        let mut t2 = t.clone();
        t2.template = "{{x}}".into();
        s.update_prompt_template(t2).unwrap();
        assert_eq!(
            s.get_prompt_template(&t.id).unwrap().unwrap().template,
            "{{x}}"
        );
        assert!(s.delete_prompt_template(&t.id).unwrap());
        assert!(!s.delete_prompt_template(&t.id).unwrap());
    }

    #[test]
    fn list_scopes_global_plus_project() {
        let s = Store::open_in_memory().unwrap();
        let p = s
            .create_project(crate::store::projects::NewProject {
                name: "proj".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: "/tmp/proj".into(),
                docs_path: None,
            })
            .unwrap();
        s.create_prompt_template(tpl("global", None)).unwrap();
        s.create_prompt_template(tpl("scoped", Some(&p.id)))
            .unwrap();
        assert_eq!(s.list_prompt_templates(None).unwrap().len(), 2);
        let for_project = s.list_prompt_templates(Some(&p.id)).unwrap();
        assert_eq!(for_project.len(), 2, "global + project's own");
        assert_eq!(
            s.list_prompt_templates(Some("other")).unwrap().len(),
            1,
            "only global for an unknown project"
        );
    }
}
