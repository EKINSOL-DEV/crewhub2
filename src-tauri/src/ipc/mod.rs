use crate::engine::provider::{ProviderCaps, ProviderRegistry, SessionProvider};
use crate::engine::rules::{PermissionRule, PermissionRules};
use crate::engine::types::{
    ArchivedSession, PermissionResponse, QuestionResponse, SearchHit, SessionId, SessionMeta,
    SpawnSpec, TranscriptPage, UserInput,
};
use crate::events::DomainEvent;
use crate::store::agents::{Agent, NewAgent};
use crate::store::projects::{NewProject, Project};
use crate::store::rooms::{NewRoom, Room};
use crate::store::tasks::{NewTask, Task};
use crate::store::Store;
use serde::Serialize;
use std::sync::Arc;
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

// ---- engine ----

#[tauri::command]
#[specta::specta]
pub async fn list_all_sessions(
    registry: State<'_, Arc<ProviderRegistry>>,
) -> Result<Vec<SessionMeta>> {
    Ok(registry.list_all_sessions().await)
}

/// `(provider id, caps)` pair — specta has no tuple-in-Vec ergonomics we want
/// to expose, so this tiny named struct is the wire shape instead.
#[derive(Serialize, specta::Type)]
pub struct ProviderCapsEntry {
    pub provider: String,
    pub caps: ProviderCaps,
}

#[tauri::command]
#[specta::specta]
pub fn provider_caps(registry: State<'_, Arc<ProviderRegistry>>) -> Result<Vec<ProviderCapsEntry>> {
    Ok(registry
        .all()
        .iter()
        .map(|p| ProviderCapsEntry {
            provider: p.id().to_string(),
            caps: p.caps(),
        })
        .collect())
}

fn provider<'a>(
    registry: &'a ProviderRegistry,
    id: &str,
) -> std::result::Result<&'a Arc<dyn SessionProvider>, String> {
    registry
        .get(id)
        .ok_or_else(|| format!("unknown provider: {id}"))
}

#[tauri::command]
#[specta::specta]
pub async fn spawn_session(
    registry: State<'_, Arc<ProviderRegistry>>,
    provider_id: String,
    spec: SpawnSpec,
) -> Result<SessionId> {
    provider(&registry, &provider_id)?
        .spawn(spec)
        .await
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn send_to_session(
    registry: State<'_, Arc<ProviderRegistry>>,
    id: SessionId,
    text: String,
) -> Result<()> {
    provider(&registry, &id.provider)?
        .send(&id, UserInput { text })
        .await
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn respond_to_permission(
    registry: State<'_, Arc<ProviderRegistry>>,
    id: SessionId,
    request_id: String,
    response: PermissionResponse,
) -> Result<()> {
    provider(&registry, &id.provider)?
        .respond_permission(&id, &request_id, response)
        .await
        .map_err(err)
}

/// Answer an `AskUserQuestion`-style question or plan approval surfaced as a
/// `SessionEvent::Question` (G1, EKI-58).
#[tauri::command]
#[specta::specta]
pub async fn answer_question(
    registry: State<'_, Arc<ProviderRegistry>>,
    id: SessionId,
    response: QuestionResponse,
) -> Result<()> {
    provider(&registry, &id.provider)?
        .answer_question(&id, response)
        .await
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn interrupt_session(
    registry: State<'_, Arc<ProviderRegistry>>,
    id: SessionId,
) -> Result<()> {
    provider(&registry, &id.provider)?
        .interrupt(&id)
        .await
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn kill_session(registry: State<'_, Arc<ProviderRegistry>>, id: SessionId) -> Result<()> {
    provider(&registry, &id.provider)?
        .kill(&id)
        .await
        .map_err(err)
}

// ---- permission rules (G4, EKI-20) ----
// Typed wrapper around the `perm.rules` setting: the settings row is the
// source of truth, every change is pushed into the providers and announced
// with a `SettingChanged` event.

fn load_rules(store: &Store) -> Result<PermissionRules> {
    Ok(store
        .get_setting(crate::engine::rules::SETTINGS_KEY)
        .map_err(err)?
        .map(|json| PermissionRules::from_json(&json))
        .unwrap_or_default())
}

fn save_rules<R: Runtime>(
    app: &AppHandle<R>,
    store: &Store,
    registry: &ProviderRegistry,
    rules: PermissionRules,
) -> Result<Vec<PermissionRule>> {
    store
        .set_setting(crate::engine::rules::SETTINGS_KEY, &rules.to_json())
        .map_err(err)?;
    registry.push_permission_rules(&rules);
    DomainEvent::SettingChanged {
        key: crate::engine::rules::SETTINGS_KEY.into(),
    }
    .emit(app)
    .map_err(|e| e.to_string())?;
    Ok(rules.rules)
}

#[tauri::command]
#[specta::specta]
pub fn list_permission_rules(store: State<Arc<Store>>) -> Result<Vec<PermissionRule>> {
    Ok(load_rules(&store)?.rules)
}

#[tauri::command]
#[specta::specta]
pub fn add_permission_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    registry: State<Arc<ProviderRegistry>>,
    rule: PermissionRule,
) -> Result<Vec<PermissionRule>> {
    if rule.tool_pattern.trim().is_empty() {
        return Err("permission rule needs a non-empty tool pattern".into());
    }
    let mut rules = load_rules(&store)?;
    rules.rules.push(rule);
    save_rules(&app, &store, &registry, rules)
}

#[tauri::command]
#[specta::specta]
pub fn revoke_permission_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    registry: State<Arc<ProviderRegistry>>,
    index: u32,
) -> Result<Vec<PermissionRule>> {
    let mut rules = load_rules(&store)?;
    if (index as usize) >= rules.rules.len() {
        return Err(format!(
            "no permission rule at index {index} (have {})",
            rules.rules.len()
        ));
    }
    rules.rules.remove(index as usize);
    save_rules(&app, &store, &registry, rules)
}

// ---- mcp ----

/// What the UI may know about the MCP server. The bearer token is
/// deliberately absent: it never crosses into the webview.
#[derive(Debug, Serialize, specta::Type)]
pub struct McpStatus {
    pub port: u16,
    pub url: String,
}

#[tauri::command]
#[specta::specta]
pub fn mcp_status(mcp: State<'_, crate::mcp::McpHandle>) -> Result<McpStatus> {
    let server = mcp.0.as_ref().ok_or("MCP server is not running")?;
    Ok(McpStatus {
        port: server.port(),
        url: server.url(),
    })
}

/// The provider that can register MCP for projects, by capability flag.
fn mcp_registrar(
    registry: &ProviderRegistry,
) -> std::result::Result<Arc<dyn SessionProvider>, String> {
    registry
        .mcp_registrar()
        .ok_or_else(|| "no provider supports MCP registration".to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn enable_mcp_for_project(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
    mcp: State<'_, crate::mcp::McpHandle>,
    project_id: String,
) -> Result<()> {
    let project = store
        .get_project(&project_id)
        .map_err(err)?
        .ok_or_else(|| format!("unknown project: {project_id}"))?;
    let server = mcp.0.as_ref().ok_or("MCP server is not running")?;
    mcp_registrar(&registry)?
        .register_mcp(
            std::path::Path::new(&project.folder_path),
            server.port(),
            server.token(),
        )
        .await
        .map_err(err)?;
    store
        .set_setting(&crate::mcp::enabled_setting_key(&project_id), "true")
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn disable_mcp_for_project(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
    project_id: String,
) -> Result<()> {
    let project = store
        .get_project(&project_id)
        .map_err(err)?
        .ok_or_else(|| format!("unknown project: {project_id}"))?;
    mcp_registrar(&registry)?
        .unregister_mcp(std::path::Path::new(&project.folder_path))
        .await
        .map_err(err)?;
    store
        .set_setting(&crate::mcp::enabled_setting_key(&project_id), "false")
        .map_err(err)
}

/// One page of a session's transcript, numbered like live `Item.seq`
/// (D-M2-3): chat opens with the newest page and pages older on scroll-up.
#[tauri::command]
#[specta::specta]
pub async fn get_session_transcript(
    registry: State<'_, Arc<ProviderRegistry>>,
    id: SessionId,
    offset: u32,
    limit: u32,
) -> Result<TranscriptPage> {
    provider(&registry, &id.provider)?
        .read_transcript(&id, offset as u64, limit)
        .await
        .map_err(err)
}

// ---- history (provider-routed since EKI-109) ----

#[tauri::command]
#[specta::specta]
pub async fn list_archived_sessions(
    registry: State<'_, Arc<ProviderRegistry>>,
    project_path: Option<String>,
) -> Result<Vec<ArchivedSession>> {
    Ok(registry.list_archived_all(project_path.as_deref()).await)
}

#[tauri::command]
#[specta::specta]
pub async fn search_transcripts(
    registry: State<'_, Arc<ProviderRegistry>>,
    query: String,
) -> Result<Vec<SearchHit>> {
    Ok(registry.search_all(&query).await)
}

// ---- agents ----

#[tauri::command]
#[specta::specta]
pub fn list_agents(store: State<Arc<Store>>) -> Result<Vec<Agent>> {
    store.list_agents().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_agent<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
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
    store: State<Arc<Store>>,
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
    store: State<Arc<Store>>,
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
pub fn list_projects(store: State<Arc<Store>>) -> Result<Vec<Project>> {
    store.list_projects().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_project<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
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
    store: State<Arc<Store>>,
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
    store: State<Arc<Store>>,
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
pub fn list_rooms(store: State<Arc<Store>>) -> Result<Vec<Room>> {
    store.list_rooms().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_room<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
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
pub fn update_room<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    room: Room,
) -> Result<Room> {
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
pub fn delete_room<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
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
pub fn list_tasks(store: State<Arc<Store>>) -> Result<Vec<Task>> {
    store.list_tasks().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_task<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
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
pub fn update_task<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    task: Task,
) -> Result<Task> {
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
pub fn delete_task<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
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
pub fn get_setting(store: State<Arc<Store>>, key: String) -> Result<Option<String>> {
    store.get_setting(&key).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn set_setting<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
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
        app.manage(Arc::new(Store::open_in_memory().unwrap()));
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

    /// Minimal provider: just enough for registry-routing commands.
    struct StubProvider;

    #[async_trait::async_trait]
    impl SessionProvider for StubProvider {
        fn id(&self) -> crate::engine::provider::ProviderId {
            "stub"
        }
        fn caps(&self) -> ProviderCaps {
            ProviderCaps {
                spawn: true,
                interrupt: true,
                ..Default::default()
            }
        }
        async fn list_sessions(&self) -> Vec<SessionMeta> {
            Vec::new()
        }
        async fn spawn(&self, _spec: SpawnSpec) -> anyhow::Result<SessionId> {
            Ok(SessionId {
                provider: "stub".into(),
                id: "s1".into(),
            })
        }
        async fn send(&self, _id: &SessionId, _input: UserInput) -> anyhow::Result<()> {
            Ok(())
        }
        async fn respond_permission(
            &self,
            _id: &SessionId,
            _rid: &str,
            _r: PermissionResponse,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn answer_question(
            &self,
            _id: &SessionId,
            _r: crate::engine::types::QuestionResponse,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn interrupt(&self, _id: &SessionId) -> anyhow::Result<()> {
            Ok(())
        }
        async fn kill(&self, _id: &SessionId) -> anyhow::Result<()> {
            Ok(())
        }
        fn subscribe(
            &self,
        ) -> tokio::sync::broadcast::Receiver<crate::engine::types::SessionEvent> {
            tokio::sync::broadcast::channel(1).1
        }
    }

    #[tokio::test]
    async fn provider_caps_lists_registered_providers_and_routes_by_id() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));

        let caps = provider_caps(app.state()).unwrap();
        assert_eq!(caps.len(), 1);
        assert_eq!(caps[0].provider, "stub");
        assert!(caps[0].caps.spawn);
        assert!(!caps[0].caps.resume);

        // routing: known provider succeeds, unknown is a readable error
        let sid = spawn_session(
            app.state(),
            "stub".into(),
            SpawnSpec {
                project_path: "/tmp".into(),
                prompt: None,
                model: None,
                permission_mode: crate::engine::types::PermissionMode::Default,
                resume_session: None,
                fork: false,
                append_system_prompt: None,
                agent_id: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(sid.id, "s1");
        interrupt_session(app.state(), sid.clone()).await.unwrap();
        let err = kill_session(
            app.state(),
            SessionId {
                provider: "codex".into(),
                id: "x".into(),
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("unknown provider"), "got: {err}");
    }

    #[test]
    fn mcp_status_without_running_server_is_a_readable_error() {
        let app = app();
        app.manage(crate::mcp::McpHandle(None));
        let err = mcp_status(app.state()).unwrap_err();
        assert!(err.contains("not running"), "got: {err}");
    }

    /// EKI-109: history commands route via the registry; providers without an
    /// archive (StubProvider keeps the trait defaults) contribute nothing.
    #[tokio::test]
    async fn history_commands_route_via_registry_and_tolerate_unsupported() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));
        assert!(list_archived_sessions(app.state(), Some("/p".into()))
            .await
            .unwrap()
            .is_empty());
        assert!(list_archived_sessions(app.state(), None)
            .await
            .unwrap()
            .is_empty());
        assert!(search_transcripts(app.state(), "fox".into())
            .await
            .unwrap()
            .is_empty());
    }

    /// G1: questions/plan approvals are answerable through the registry.
    #[tokio::test]
    async fn answer_question_routes_by_provider_id() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));
        let response = QuestionResponse {
            request_id: "q1".into(),
            answers: vec!["approve".into()],
        };
        answer_question(
            app.state(),
            SessionId {
                provider: "stub".into(),
                id: "s1".into(),
            },
            response.clone(),
        )
        .await
        .unwrap();
        let err = answer_question(
            app.state(),
            SessionId {
                provider: "codex".into(),
                id: "x".into(),
            },
            response,
        )
        .await
        .unwrap_err();
        assert!(err.contains("unknown provider"), "got: {err}");
    }

    /// G4: typed wrapper over the `perm.rules` setting — add/list/revoke with
    /// validation; the raw setting stays in sync (single source of truth).
    #[tokio::test]
    async fn permission_rule_commands_roundtrip_with_validation() {
        let app = app();
        let h = app.handle().clone();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));

        assert!(list_permission_rules(app.state()).unwrap().is_empty());

        let err = add_permission_rule(
            h.clone(),
            app.state(),
            app.state(),
            PermissionRule {
                agent_id: None,
                tool_pattern: "   ".into(),
            },
        )
        .unwrap_err();
        assert!(err.contains("non-empty"), "got: {err}");

        let rules = add_permission_rule(
            h.clone(),
            app.state(),
            app.state(),
            PermissionRule {
                agent_id: Some("bot-1".into()),
                tool_pattern: "mcp__crewhub__*".into(),
            },
        )
        .unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(list_permission_rules(app.state()).unwrap(), rules);

        // the raw setting mirrors the typed view
        let raw = get_setting(app.state(), crate::engine::rules::SETTINGS_KEY.into())
            .unwrap()
            .unwrap();
        assert!(raw.contains("mcp__crewhub__*"), "got: {raw}");

        let err = revoke_permission_rule(h.clone(), app.state(), app.state(), 5).unwrap_err();
        assert!(err.contains("no permission rule at index 5"), "got: {err}");

        let rules = revoke_permission_rule(h, app.state(), app.state(), 0).unwrap();
        assert!(rules.is_empty());
        assert!(list_permission_rules(app.state()).unwrap().is_empty());
    }

    /// G2: transcript pages route to the session's provider; a provider
    /// without `read_transcript` (StubProvider default) errors readably.
    #[tokio::test]
    async fn get_session_transcript_routes_and_surfaces_unsupported() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));
        let err = get_session_transcript(
            app.state(),
            SessionId {
                provider: "stub".into(),
                id: "s1".into(),
            },
            0,
            200,
        )
        .await
        .unwrap_err();
        assert!(err.contains("unsupported"), "got: {err}");
        let err = get_session_transcript(
            app.state(),
            SessionId {
                provider: "codex".into(),
                id: "x".into(),
            },
            0,
            200,
        )
        .await
        .unwrap_err();
        assert!(err.contains("unknown provider"), "got: {err}");
    }

    /// EKI-109: MCP registration routes by capability flag, never provider id.
    #[tokio::test]
    async fn mcp_registration_without_capable_provider_is_a_readable_error() {
        let app = app();
        let h = app.handle().clone();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider)); // caps().mcp_registration == false
        app.manage(Arc::new(registry));
        let p = create_project(
            h,
            app.state(),
            NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: "/tmp/p".into(),
                docs_path: None,
            },
        )
        .unwrap();
        let err = disable_mcp_for_project(app.state(), app.state(), p.id)
            .await
            .unwrap_err();
        assert!(err.contains("no provider supports"), "got: {err}");
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
