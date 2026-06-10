use crate::events::DomainEvent;
use crate::store::agents::{Agent, NewAgent};
use crate::store::projects::{NewProject, Project};
use crate::store::rooms::{NewRoom, Room};
use crate::store::tasks::{NewTask, Task};
use crate::store::Store;
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tauri_specta::Event;

type Result<T> = std::result::Result<T, String>;

fn err(e: anyhow::Error) -> String {
    e.to_string()
}

#[derive(Serialize, specta::Type)]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
}

#[tauri::command]
#[specta::specta]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    use tauri::Manager;
    AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: app
            .path()
            .app_data_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
    }
}

// ---- agents ----

#[tauri::command]
#[specta::specta]
pub fn list_agents(store: State<Store>) -> Result<Vec<Agent>> {
    store.list_agents().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_agent<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    input: NewAgent,
) -> Result<Agent> {
    let agent = store.create_agent(input).map_err(err)?;
    DomainEvent::AgentCreated {
        agent_id: agent.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(agent)
}

#[tauri::command]
#[specta::specta]
pub fn update_agent<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    agent: Agent,
) -> Result<Agent> {
    let agent = store.update_agent(agent).map_err(err)?;
    DomainEvent::AgentUpdated {
        agent_id: agent.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(agent)
}

#[tauri::command]
#[specta::specta]
pub fn delete_agent<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    id: String,
) -> Result<bool> {
    let deleted = store.delete_agent(&id).map_err(err)?;
    if deleted {
        DomainEvent::AgentDeleted { agent_id: id }
            .emit(&app)
            .map_err(|e| e.to_string())?;
    }
    Ok(deleted)
}

// ---- projects ----

#[tauri::command]
#[specta::specta]
pub fn list_projects(store: State<Store>) -> Result<Vec<Project>> {
    store.list_projects().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_project<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    input: NewProject,
) -> Result<Project> {
    let p = store.create_project(input).map_err(err)?;
    DomainEvent::ProjectChanged {
        project_id: p.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
#[specta::specta]
pub fn update_project<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    project: Project,
) -> Result<Project> {
    let p = store.update_project(project).map_err(err)?;
    DomainEvent::ProjectChanged {
        project_id: p.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
#[specta::specta]
pub fn delete_project<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    id: String,
) -> Result<bool> {
    let deleted = store.delete_project(&id).map_err(err)?;
    if deleted {
        DomainEvent::ProjectChanged { project_id: id }
            .emit(&app)
            .map_err(|e| e.to_string())?;
    }
    Ok(deleted)
}

// ---- rooms ----

#[tauri::command]
#[specta::specta]
pub fn list_rooms(store: State<Store>) -> Result<Vec<Room>> {
    store.list_rooms().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_room<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    input: NewRoom,
) -> Result<Room> {
    let r = store.create_room(input).map_err(err)?;
    DomainEvent::RoomChanged {
        room_id: r.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(r)
}

#[tauri::command]
#[specta::specta]
pub fn update_room<R: Runtime>(app: AppHandle<R>, store: State<Store>, room: Room) -> Result<Room> {
    let r = store.update_room(room).map_err(err)?;
    DomainEvent::RoomChanged {
        room_id: r.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(r)
}

#[tauri::command]
#[specta::specta]
pub fn delete_room<R: Runtime>(app: AppHandle<R>, store: State<Store>, id: String) -> Result<bool> {
    let deleted = store.delete_room(&id).map_err(err)?;
    if deleted {
        DomainEvent::RoomChanged { room_id: id }
            .emit(&app)
            .map_err(|e| e.to_string())?;
    }
    Ok(deleted)
}

// ---- tasks ----

#[tauri::command]
#[specta::specta]
pub fn list_tasks(store: State<Store>) -> Result<Vec<Task>> {
    store.list_tasks().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_task<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    input: NewTask,
) -> Result<Task> {
    let t = store.create_task(input).map_err(err)?;
    DomainEvent::TaskChanged {
        task_id: t.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(t)
}

#[tauri::command]
#[specta::specta]
pub fn update_task<R: Runtime>(app: AppHandle<R>, store: State<Store>, task: Task) -> Result<Task> {
    let t = store.update_task(task).map_err(err)?;
    DomainEvent::TaskChanged {
        task_id: t.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(t)
}

#[tauri::command]
#[specta::specta]
pub fn delete_task<R: Runtime>(app: AppHandle<R>, store: State<Store>, id: String) -> Result<bool> {
    let deleted = store.delete_task(&id).map_err(err)?;
    if deleted {
        DomainEvent::TaskChanged { task_id: id }
            .emit(&app)
            .map_err(|e| e.to_string())?;
    }
    Ok(deleted)
}

// ---- settings ----

#[tauri::command]
#[specta::specta]
pub fn get_setting(store: State<Store>, key: String) -> Result<Option<String>> {
    store.get_setting(&key).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn set_setting<R: Runtime>(
    app: AppHandle<R>,
    store: State<Store>,
    key: String,
    value: String,
) -> Result<()> {
    store.set_setting(&key, &value).map_err(err)?;
    DomainEvent::SettingChanged { key }
        .emit(&app)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::MockRuntime;
    use tauri::Manager;

    fn app() -> tauri::App<MockRuntime> {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        app.manage(Store::open_in_memory().unwrap());
        tauri_specta::Builder::<MockRuntime>::new()
            .events(tauri_specta::collect_events![crate::events::DomainEvent])
            .mount_events(&app);
        app
    }

    fn new_agent(name: &str) -> NewAgent {
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
    fn app_info_returns_version() {
        let app = app();
        let info = app_info(app.handle().clone());
        assert!(!info.version.is_empty());
    }

    #[test]
    fn agent_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        let mut a = create_agent(h.clone(), app.state(), new_agent("Bot")).unwrap();
        assert_eq!(list_agents(app.state()).unwrap().len(), 1);
        a.name = "Bot2".into();
        let a = update_agent(h.clone(), app.state(), a).unwrap();
        assert_eq!(a.name, "Bot2");
        assert!(delete_agent(h.clone(), app.state(), a.id.clone()).unwrap());
        assert!(!delete_agent(h, app.state(), a.id).unwrap());
        assert!(list_agents(app.state()).unwrap().is_empty());
    }

    #[test]
    fn project_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        let input = NewProject {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
            folder_path: "/tmp/p".into(),
            docs_path: None,
        };
        let mut p = create_project(h.clone(), app.state(), input).unwrap();
        assert_eq!(list_projects(app.state()).unwrap().len(), 1);
        p.status = "archived".into();
        let p = update_project(h.clone(), app.state(), p).unwrap();
        assert_eq!(p.status, "archived");
        assert!(delete_project(h, app.state(), p.id).unwrap());
    }

    #[test]
    fn room_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        let input = NewRoom {
            project_id: None,
            name: "Lab".into(),
            icon: None,
            color: None,
            is_hq: Some(true),
        };
        let mut r = create_room(h.clone(), app.state(), input).unwrap();
        assert!(r.is_hq);
        assert_eq!(list_rooms(app.state()).unwrap().len(), 1);
        r.sort_order = 3;
        let r = update_room(h.clone(), app.state(), r).unwrap();
        assert_eq!(r.sort_order, 3);
        assert!(delete_room(h, app.state(), r.id).unwrap());
    }

    #[test]
    fn task_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        let input = NewTask {
            project_id: None,
            room_id: None,
            title: "Do".into(),
            description: None,
            priority: None,
            assignee_agent_id: None,
            created_by: Some("agent:test".into()),
        };
        let mut t = create_task(h.clone(), app.state(), input).unwrap();
        assert_eq!(t.created_by, "agent:test");
        assert_eq!(list_tasks(app.state()).unwrap().len(), 1);
        t.status = "in_progress".into();
        let t = update_task(h.clone(), app.state(), t).unwrap();
        assert_eq!(t.status, "in_progress");
        assert!(delete_task(h, app.state(), t.id).unwrap());
    }

    #[test]
    fn update_task_with_invalid_status_maps_error_to_string() {
        let app = app();
        let h = app.handle().clone();
        let input = NewTask {
            project_id: None,
            room_id: None,
            title: "Do".into(),
            description: None,
            priority: None,
            assignee_agent_id: None,
            created_by: None,
        };
        let mut t = create_task(h.clone(), app.state(), input).unwrap();
        t.status = "nonsense".into();
        let err = update_task(h, app.state(), t).unwrap_err();
        assert!(
            err.contains("CHECK"),
            "expected CHECK constraint error, got: {err}"
        );
    }

    #[test]
    fn settings_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        assert_eq!(get_setting(app.state(), "theme".into()).unwrap(), None);
        set_setting(h, app.state(), "theme".into(), "nord".into()).unwrap();
        assert_eq!(
            get_setting(app.state(), "theme".into()).unwrap(),
            Some("nord".into())
        );
    }
}
