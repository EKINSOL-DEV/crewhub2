//! SessionStart context envelope (T18): room/project/open-tasks summary that
//! gets injected into a session as `additionalContext` — only when the
//! session's cwd maps to a registered project.

use crate::store::agents::Agent;
use crate::store::Store;

/// Build the envelope for a session starting in `cwd`. Returns `None` when the
/// cwd does not belong to a registered project (no context injection then).
/// When the session is bound to an `agent`, the envelope tells it who it is
/// and instructs it to pass `acting_as` on CrewHub MCP tool calls (D-M3-4 —
/// self-reported, server-validated attribution).
pub fn build_envelope(store: &Store, cwd: &str, agent: Option<&Agent>) -> Option<String> {
    let projects = store.list_projects().ok()?;
    let project = projects
        .into_iter()
        .find(|p| cwd == p.folder_path || cwd.starts_with(&format!("{}/", p.folder_path)))?;

    let rooms = store.list_rooms().unwrap_or_default();
    let room = rooms
        .iter()
        .find(|r| r.project_id.as_deref() == Some(project.id.as_str()));

    let tasks = store.list_tasks().unwrap_or_default();
    let mut open: Vec<_> = tasks
        .iter()
        .filter(|t| t.project_id.as_deref() == Some(project.id.as_str()))
        .filter(|t| t.status != "done")
        .take(10)
        .collect();
    open.sort_by_key(|t| (t.status.clone(), t.priority.clone()));

    let mut out = String::new();
    out.push_str("# CrewHub context\n\n");
    out.push_str(&format!("Project: **{}**", project.name));
    if let Some(d) = &project.description {
        if !d.is_empty() {
            out.push_str(&format!(" — {d}"));
        }
    }
    out.push('\n');
    if let Some(room) = room {
        out.push_str(&format!("Room: {}\n", room.name));
    }
    if open.is_empty() {
        out.push_str("\nNo open tasks on the board.\n");
    } else {
        out.push_str("\nOpen tasks (via CrewHub MCP tools you can update these):\n");
        for t in open {
            out.push_str(&format!(
                "- [{}] {} (priority: {})\n",
                t.status, t.title, t.priority
            ));
        }
    }
    if let Some(agent) = agent {
        out.push_str(&format!(
            "\nYou are **{}** (agent id `{}`). Pass acting_as=\"{}\" on every \
             CrewHub MCP tool call so the board attributes your actions to you.\n",
            agent.name, agent.id, agent.id
        ));
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::projects::NewProject;
    use crate::store::rooms::NewRoom;
    use crate::store::tasks::NewTask;

    fn seeded() -> (Store, String) {
        let s = Store::open_in_memory().unwrap();
        let p = s
            .create_project(NewProject {
                name: "Alpha".into(),
                description: Some("test project".into()),
                icon: None,
                color: None,
                folder_path: "/work/alpha".into(),
                docs_path: None,
            })
            .unwrap();
        let r = s
            .create_room(NewRoom {
                project_id: Some(p.id.clone()),
                name: "Lab".into(),
                icon: None,
                color: None,
                is_hq: None,
            })
            .unwrap();
        s.create_task(NewTask {
            project_id: Some(p.id.clone()),
            room_id: Some(r.id),
            title: "Fix the flux capacitor".into(),
            description: None,
            priority: Some("high".into()),
            assignee_agent_id: None,
            created_by: None,
        })
        .unwrap();
        (s, p.id)
    }

    #[test]
    fn envelope_for_registered_project_lists_room_and_tasks() {
        let (s, _) = seeded();
        let env = build_envelope(&s, "/work/alpha/src", None).unwrap();
        assert!(env.contains("Project: **Alpha**"));
        assert!(env.contains("Room: Lab"));
        assert!(env.contains("Fix the flux capacitor"));
    }

    #[test]
    fn no_envelope_outside_registered_projects() {
        let (s, _) = seeded();
        assert!(build_envelope(&s, "/somewhere/else", None).is_none());
        // prefix trap: /work/alphabet must NOT match /work/alpha
        assert!(build_envelope(&s, "/work/alphabet", None).is_none());
    }

    /// D-M3-4 (M3 T5): a bound agent is told who it is and to pass
    /// `acting_as` on CrewHub MCP tool calls.
    #[test]
    fn bound_agent_gets_acting_as_instruction() {
        let (s, _) = seeded();
        let agent = s
            .create_agent(crate::store::agents::NewAgent {
                name: "Botje".into(),
                icon: None,
                color: None,
                default_model: None,
                project_path: None,
                permission_mode: None,
                system_prompt: None,
            })
            .unwrap();
        let env = build_envelope(&s, "/work/alpha", Some(&agent)).unwrap();
        assert!(env.contains("You are **Botje**"));
        assert!(env.contains(&format!("acting_as=\"{}\"", agent.id)));
    }

    #[test]
    fn done_tasks_are_excluded() {
        let (s, pid) = seeded();
        let mut t = s.list_tasks().unwrap().pop().unwrap();
        assert_eq!(t.project_id.as_deref(), Some(pid.as_str()));
        t.status = "done".into();
        s.update_task(t).unwrap();
        let env = build_envelope(&s, "/work/alpha", None).unwrap();
        assert!(env.contains("No open tasks"));
    }
}
