use crate::engine::provider::{ProviderCaps, ProviderRegistry, SessionProvider};
use crate::engine::rules::{PermissionRule, PermissionRules};
use crate::engine::types::{
    ArchivedSession, PermissionResponse, QuestionResponse, SearchHit, SessionId, SessionMeta,
    SlashCommand, SpawnSpec, TranscriptPage, UserInput,
};
use crate::events::DomainEvent;
use crate::security::paths::{Access, PathPolicy};
use crate::store::agents::{Agent, NewAgent};
use crate::store::projects::{NewProject, Project};
use crate::store::room_rules::{NewRoomRule, RoomRule};
use crate::store::rooms::{NewRoom, Room};
use crate::store::session_bindings::{NewSessionBinding, SessionBinding};
use crate::store::task_events::{TaskEvent, ACTOR_HUMAN};
use crate::store::tasks::{NewTask, Task};
use crate::store::Store;
use crate::workspace::handoff::HandoffTarget;
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

// ---- workspace: handoff, slash commands, persona (G5/G8/G9) ----

/// House rule (security/mod.rs): every command taking a filesystem path
/// validates it against the registered project roots before touching disk.
fn project_policy(store: &Store) -> Result<PathPolicy> {
    let mut policy = PathPolicy::default();
    for project in store.list_projects().map_err(err)? {
        policy.allow(&project.folder_path, Access::ReadWrite);
    }
    Ok(policy)
}

fn validate_project_path(store: &Store, path: &str, access: Access) -> Result<std::path::PathBuf> {
    project_policy(store)?
        .validate(std::path::Path::new(path), access)
        .map_err(|e| e.to_string())
}

/// Open the project in an external tool (EKI-80, D-M2-8): fixed argv mapped
/// from a closed enum, executed Rust-side — the webview gets no shell.
#[tauri::command]
#[specta::specta]
pub fn handoff(
    store: State<Arc<Store>>,
    project_path: String,
    target: HandoffTarget,
) -> Result<()> {
    let canon = validate_project_path(&store, &project_path, Access::Read)?;
    crate::workspace::handoff::execute(target, &canon).map_err(err)
}

/// Handoff targets installed on this machine.
#[tauri::command]
#[specta::specta]
pub fn handoff_targets() -> Result<Vec<HandoffTarget>> {
    Ok(crate::workspace::handoff::detect_targets(
        &crate::workspace::handoff::default_app_dirs(),
    ))
}

/// Native folder picker (T3, D-M3-7): `tauri-plugin-dialog` invoked
/// RUST-SIDE only — the webview holds no `dialog:*` permission. Returns the
/// canonicalized folder, or `null` when the user cancels.
#[tauri::command]
#[specta::specta]
pub async fn pick_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>> {
    crate::workspace::pick::pick_folder(&app).await.map_err(err)
}

// ---- docs panel reads (T3, D-M3-7/G5) ----
// The docs root is the project's `docs_path`, falling back to `folder_path`;
// every path resolves through PathPolicy inside `workspace::docs`.

fn docs_root(store: &Store, project_id: &str) -> Result<std::path::PathBuf> {
    let project = store
        .get_project(project_id)
        .map_err(err)?
        .ok_or_else(|| format!("unknown project: {project_id}"))?;
    Ok(std::path::PathBuf::from(
        project.docs_path.unwrap_or(project.folder_path),
    ))
}

#[tauri::command]
#[specta::specta]
pub fn list_doc_tree(
    store: State<Arc<Store>>,
    project_id: String,
) -> Result<Vec<crate::workspace::docs::DocEntry>> {
    crate::workspace::docs::list_doc_tree(&docs_root(&store, &project_id)?).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn read_doc_file(
    store: State<Arc<Store>>,
    project_id: String,
    rel_path: String,
) -> Result<String> {
    crate::workspace::docs::read_doc_file(&docs_root(&store, &project_id)?, &rel_path).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn read_doc_image(
    store: State<Arc<Store>>,
    project_id: String,
    rel_path: String,
) -> Result<crate::workspace::docs::DocImage> {
    crate::workspace::docs::read_doc_image(&docs_root(&store, &project_id)?, &rel_path).map_err(err)
}

// ---- git awareness (T4, D-M3-5/G6) ----
// Read-only, fixed-argv `git` CLI; `project_path` is path-policy-validated
// and only ever used as the process CWD. Errors prefixed `GitUnavailable:`
// mean "no git info here" — panels hide the strip instead of erroring.

#[tauri::command]
#[specta::specta]
pub async fn git_status(
    store: State<'_, Arc<Store>>,
    project_path: String,
) -> Result<crate::git::GitStatus> {
    let canon = validate_project_path(&store, &project_path, Access::Read)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::git_status(&canon))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn git_diff(
    store: State<'_, Arc<Store>>,
    project_path: String,
    base: Option<String>,
) -> Result<crate::git::GitDiff> {
    let canon = validate_project_path(&store, &project_path, Access::Read)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::git_diff(&canon, base.as_deref()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn git_default_base(
    store: State<'_, Arc<Store>>,
    project_path: String,
) -> Result<Option<String>> {
    let canon = validate_project_path(&store, &project_path, Access::Read)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::git_default_base(&canon))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Composer hints: slash commands/skills any provider recognizes for the
/// project (G8). Read-only, path-policy-checked.
#[tauri::command]
#[specta::specta]
pub async fn list_slash_commands(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
    project_path: String,
) -> Result<Vec<SlashCommand>> {
    let canon = validate_project_path(&store, &project_path, Access::Read)?;
    let mut out = Vec::new();
    for p in registry.all() {
        if let Ok(cmds) = p.list_slash_commands(&canon).await {
            out.extend(cmds);
        }
    }
    Ok(out)
}

/// Route to the first provider implementing the persona-file capability;
/// `unsupported` defaults are skipped, real errors surface.
async fn route_persona<F, Fut>(registry: &ProviderRegistry, call: F) -> Result<()>
where
    F: Fn(Arc<dyn SessionProvider>) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    for p in registry.all() {
        match call(p.clone()).await {
            Ok(()) => return Ok(()),
            Err(e) if e.to_string().contains("unsupported") => continue,
            Err(e) => return Err(err(e)),
        }
    }
    Err("no provider supports persona materialization".into())
}

/// Write/update the fenced persona block in the project's context file
/// (G9, EKI-32). Idempotent; uninstall is byte-identical (provider tests).
#[tauri::command]
#[specta::specta]
pub async fn materialize_persona(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
    project_id: String,
    content: String,
) -> Result<()> {
    let project = store
        .get_project(&project_id)
        .map_err(err)?
        .ok_or_else(|| format!("unknown project: {project_id}"))?;
    let canon = validate_project_path(&store, &project.folder_path, Access::ReadWrite)?;
    route_persona(&registry, |p| {
        let canon = canon.clone();
        let content = content.clone();
        async move { p.materialize_persona(&canon, &content).await }
    })
    .await
}

/// Remove the fenced persona block, restoring user content byte-identical.
#[tauri::command]
#[specta::specta]
pub async fn remove_materialized_persona(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
    project_id: String,
) -> Result<()> {
    let project = store
        .get_project(&project_id)
        .map_err(err)?
        .ok_or_else(|| format!("unknown project: {project_id}"))?;
    let canon = validate_project_path(&store, &project.folder_path, Access::ReadWrite)?;
    route_persona(&registry, |p| {
        let canon = canon.clone();
        async move { p.remove_persona(&canon).await }
    })
    .await
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

/// T3 (D-M3-7): registering a project is what grants the runtime
/// `PathPolicy` a new allowed root, so the folders must be real directories
/// (the picker hands us canonicalized paths; typed paths get the same check).
fn validate_project_folders(folder_path: &str, docs_path: Option<&str>) -> Result<()> {
    if !std::path::Path::new(folder_path).is_dir() {
        return Err(format!(
            "project folder does not exist or is not a directory: {folder_path}"
        ));
    }
    if let Some(docs) = docs_path {
        if !std::path::Path::new(docs).is_dir() {
            return Err(format!(
                "docs folder does not exist or is not a directory: {docs}"
            ));
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn create_project<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewProject,
) -> Result<Project> {
    validate_project_folders(&input.folder_path, input.docs_path.as_deref())?;
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
    validate_project_folders(&project.folder_path, project.docs_path.as_deref())?;
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

/// Single-task refetch for `TaskChanged` reconciliation (D-M3-2, G3):
/// `null` means the task was deleted — the store drops it.
#[tauri::command]
#[specta::specta]
pub fn get_task(store: State<Arc<Store>>, id: String) -> Result<Option<Task>> {
    store.get_task(&id).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_task<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewTask,
) -> Result<Task> {
    let t = store.create_task_as(input, ACTOR_HUMAN).map_err(err)?;
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
    let t = store.update_task_as(task, ACTOR_HUMAN).map_err(err)?;
    DomainEvent::TaskChanged {
        task_id: t.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(t)
}

// ---- task events (T1, D-M3-3/G1) ----

/// A task's timeline, oldest first: the drawer timeline, run linkage and
/// notification source all read from here.
#[tauri::command]
#[specta::specta]
pub fn list_task_events(store: State<Arc<Store>>, task_id: String) -> Result<Vec<TaskEvent>> {
    store.list_task_events(&task_id).map_err(err)
}

/// Run-with-agent linkage (T12 writes through here): records a `run_started`
/// timeline event. A card's linked session = newest `run_started` without a
/// matching `run_finished`.
#[tauri::command]
#[specta::specta]
pub fn record_task_run_started<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    task_id: String,
    session_id: SessionId,
    agent_id: Option<String>,
) -> Result<TaskEvent> {
    let event = store
        .record_task_run_started(
            &task_id,
            &session_id.provider,
            &session_id.id,
            agent_id.as_deref(),
        )
        .map_err(err)?;
    DomainEvent::TaskChanged { task_id }
        .emit(&app)
        .map_err(|e| e.to_string())?;
    Ok(event)
}

/// The matching close of [`record_task_run_started`].
#[tauri::command]
#[specta::specta]
pub fn record_task_run_finished<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    task_id: String,
    session_id: SessionId,
    outcome: String,
) -> Result<TaskEvent> {
    let event = store
        .record_task_run_finished(&task_id, &session_id.id, &outcome)
        .map_err(err)?;
    DomainEvent::TaskChanged { task_id }
        .emit(&app)
        .map_err(|e| e.to_string())?;
    Ok(event)
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

// ---- room rules (T2, D-M3-10/G2) ----
// Mutations emit `RoomChanged { room_id }` — the rules editor refetches per
// room; no dedicated DomainEvent variant (M3 freezes the event surface).

#[tauri::command]
#[specta::specta]
pub fn list_room_rules(store: State<Arc<Store>>, room_id: Option<String>) -> Result<Vec<RoomRule>> {
    store.list_room_rules(room_id.as_deref()).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_room_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewRoomRule,
) -> Result<RoomRule> {
    let rule = store.create_room_rule(input).map_err(err)?;
    DomainEvent::RoomChanged {
        room_id: rule.room_id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(rule)
}

#[tauri::command]
#[specta::specta]
pub fn update_room_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    rule: RoomRule,
) -> Result<RoomRule> {
    let rule = store.update_room_rule(rule).map_err(err)?;
    DomainEvent::RoomChanged {
        room_id: rule.room_id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(rule)
}

#[tauri::command]
#[specta::specta]
pub fn delete_room_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
    // fetch first so the RoomChanged event can name the room
    let room_id = store
        .list_room_rules(None)
        .map_err(err)?
        .into_iter()
        .find(|r| r.id == id)
        .map(|r| r.room_id);
    let deleted = store.delete_room_rule(&id).map_err(err)?;
    if deleted {
        if let Some(room_id) = room_id {
            DomainEvent::RoomChanged { room_id }
                .emit(&app)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(deleted)
}

// ---- session bindings (G3, EKI-36/40) ----

#[tauri::command]
#[specta::specta]
pub fn list_session_bindings(store: State<Arc<Store>>) -> Result<Vec<SessionBinding>> {
    store.list_session_bindings().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn upsert_session_binding<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewSessionBinding,
) -> Result<SessionBinding> {
    let b = store.upsert_session_binding(input).map_err(err)?;
    DomainEvent::SessionBindingChanged {
        session_id: b.session_id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(b)
}

#[tauri::command]
#[specta::specta]
pub fn delete_session_binding<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    session_id: String,
) -> Result<bool> {
    let deleted = store.delete_session_binding(&session_id).map_err(err)?;
    if deleted {
        DomainEvent::SessionBindingChanged { session_id }
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

/// Open (or focus) the dedicated settings window (EKI-20, plan T10). The
/// window has its own least-privilege capability file
/// (`capabilities/settings.json`, core:default only); the webview renders the
/// settings panel when launched with `?window=settings`. Cross-window state
/// stays consistent via `SettingChanged` events (plan Appendix B): both
/// windows write through the same IPC and reconcile on the event.
#[tauri::command]
#[specta::specta]
pub fn open_settings_window<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    use tauri::Manager;
    if let Some(existing) = app.get_webview_window("settings") {
        return existing.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("CrewHub Settings")
    .inner_size(760.0, 560.0)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
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
        let dir = tempfile::tempdir().unwrap();
        let input = NewProject {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
            folder_path: dir.path().display().to_string(),
            docs_path: None,
        };
        let mut p = create_project(h.clone(), app.state(), input).unwrap();
        assert_eq!(list_projects(app.state()).unwrap().len(), 1);
        p.status = "archived".into();
        let p = update_project(h.clone(), app.state(), p).unwrap();
        assert_eq!(p.status, "archived");
        assert!(delete_project(h, app.state(), p.id).unwrap());
    }

    /// T3 (D-M3-7): project registration is the PathPolicy grant, so the
    /// folders must exist — and a freshly registered root is allowed
    /// immediately (the policy is rebuilt from the store per call).
    #[test]
    fn project_registration_validates_folders_and_extends_path_policy() {
        let app = app();
        let h = app.handle().clone();
        let dir = tempfile::tempdir().unwrap();

        let missing = NewProject {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
            folder_path: dir.path().join("ghost").display().to_string(),
            docs_path: None,
        };
        let err = create_project(h.clone(), app.state(), missing).unwrap_err();
        assert!(err.contains("does not exist"), "got: {err}");

        let bad_docs = NewProject {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
            folder_path: dir.path().display().to_string(),
            docs_path: Some(dir.path().join("nope").display().to_string()),
        };
        let err = create_project(h.clone(), app.state(), bad_docs).unwrap_err();
        assert!(err.contains("docs folder"), "got: {err}");

        // before registration the path is outside all roots…
        assert!(validate_project_path(
            &app.state::<Arc<Store>>(),
            dir.path().to_str().unwrap(),
            Access::Read
        )
        .is_err());
        let p = create_project(
            h,
            app.state(),
            NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: dir.path().display().to_string(),
                docs_path: None,
            },
        )
        .unwrap();
        // …and allowed right after: registration is the grant (M0 behavior).
        assert!(validate_project_path(
            &app.state::<Arc<Store>>(),
            dir.path().to_str().unwrap(),
            Access::ReadWrite
        )
        .is_ok());

        // archived-status update keeps validating (folder still exists)
        let mut p2 = p.clone();
        p2.folder_path = dir.path().join("ghost").display().to_string();
        let err = update_project(app.handle().clone(), app.state(), p2).unwrap_err();
        assert!(err.contains("does not exist"), "got: {err}");
    }

    /// T3 (G5): docs commands route through the project's docs root and the
    /// path policy; details are unit-tested in `workspace::docs`.
    #[test]
    fn doc_commands_read_through_docs_root_fallback() {
        let app = app();
        let h = app.handle().clone();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("README.md"), "# docs").unwrap();
        let docs = tempfile::tempdir().unwrap();
        std::fs::write(docs.path().join("guide.md"), "guide").unwrap();
        std::fs::write(docs.path().join("pic.png"), b"png").unwrap();

        let err = list_doc_tree(app.state(), "ghost".into()).unwrap_err();
        assert!(err.contains("unknown project"), "got: {err}");

        // no docs_path -> folder_path fallback
        let p = create_project(
            h.clone(),
            app.state(),
            NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: dir.path().display().to_string(),
                docs_path: None,
            },
        )
        .unwrap();
        let tree = list_doc_tree(app.state(), p.id.clone()).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(
            read_doc_file(app.state(), p.id.clone(), "README.md".into()).unwrap(),
            "# docs"
        );

        // docs_path set -> reads switch roots; escapes are rejected
        let mut p2 = p.clone();
        p2.docs_path = Some(docs.path().display().to_string());
        let p2 = update_project(h, app.state(), p2).unwrap();
        assert_eq!(
            read_doc_file(app.state(), p2.id.clone(), "guide.md".into()).unwrap(),
            "guide"
        );
        let img = read_doc_image(app.state(), p2.id.clone(), "pic.png".into()).unwrap();
        assert_eq!(img.media_type, "image/png");
        let err = read_doc_file(app.state(), p2.id.clone(), "../escape.md".into()).unwrap_err();
        assert!(err.contains("outside"), "got: {err}");
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

    /// T2 (G2): room-rule CRUD round-trips with rule_type validation; the
    /// evaluator itself is unit-tested in `store::room_rules`.
    #[test]
    fn room_rule_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        let room = create_room(
            h.clone(),
            app.state(),
            NewRoom {
                project_id: None,
                name: "Lab".into(),
                icon: None,
                color: None,
                is_hq: None,
            },
        )
        .unwrap();

        let err = create_room_rule(
            h.clone(),
            app.state(),
            NewRoomRule {
                room_id: room.id.clone(),
                rule_type: "vibes".into(),
                rule_value: "x".into(),
                priority: None,
            },
        )
        .unwrap_err();
        assert!(err.contains("invalid rule_type"), "got: {err}");

        let mut rule = create_room_rule(
            h.clone(),
            app.state(),
            NewRoomRule {
                room_id: room.id.clone(),
                rule_type: "keyword".into(),
                rule_value: "fox".into(),
                priority: Some(3),
            },
        )
        .unwrap();
        assert_eq!(
            list_room_rules(app.state(), Some(room.id.clone())).unwrap(),
            vec![rule.clone()]
        );
        rule.priority = 7;
        let rule = update_room_rule(h.clone(), app.state(), rule).unwrap();
        assert_eq!(list_room_rules(app.state(), None).unwrap()[0].priority, 7);
        assert!(delete_room_rule(h.clone(), app.state(), rule.id.clone()).unwrap());
        assert!(!delete_room_rule(h, app.state(), rule.id).unwrap());
        assert!(list_room_rules(app.state(), None).unwrap().is_empty());
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

    /// T1 (G1/G3): human IPC edits write the timeline through the `_as`
    /// wrappers, `get_task` exposes single-task refetch, and the run-linkage
    /// pair records through the same closed vocabulary.
    #[test]
    fn task_event_commands_write_and_list_the_timeline() {
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
        assert_eq!(
            get_task(app.state(), t.id.clone()).unwrap(),
            Some(t.clone())
        );
        assert_eq!(get_task(app.state(), "ghost".into()).unwrap(), None);

        t.status = "in_progress".into();
        let t = update_task(h.clone(), app.state(), t).unwrap();

        let sid = SessionId {
            provider: "claude-code".into(),
            id: "sess-1".into(),
        };
        record_task_run_started(
            h.clone(),
            app.state(),
            t.id.clone(),
            sid.clone(),
            Some("agent-1".into()),
        )
        .unwrap();
        record_task_run_finished(h.clone(), app.state(), t.id.clone(), sid, "review".into())
            .unwrap();

        let events = list_task_events(app.state(), t.id.clone()).unwrap();
        let types: Vec<_> = events.iter().map(|e| e.event_type.as_str()).collect();
        assert_eq!(
            types,
            vec!["created", "status_changed", "run_started", "run_finished"]
        );
        assert!(events.iter().all(|e| e.actor == "human"));

        // deleting the task cascades its timeline (G9)
        assert!(delete_task(h, app.state(), t.id.clone()).unwrap());
        assert!(list_task_events(app.state(), t.id).unwrap().is_empty());
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
        let dir = tempfile::tempdir().unwrap();
        let p = create_project(
            h,
            app.state(),
            NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: dir.path().display().to_string(),
                docs_path: None,
            },
        )
        .unwrap();
        let err = disable_mcp_for_project(app.state(), app.state(), p.id)
            .await
            .unwrap_err();
        assert!(err.contains("no provider supports"), "got: {err}");
    }

    fn register_project_at(app: &tauri::App<MockRuntime>, path: &str) {
        create_project(
            app.handle().clone(),
            app.state(),
            NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: path.into(),
                docs_path: None,
            },
        )
        .unwrap();
    }

    /// G5 (D-M2-8): handoff only accepts paths inside registered projects —
    /// `..` traversal and unregistered paths are rejected before any exec.
    #[test]
    fn handoff_rejects_paths_outside_registered_projects() {
        let app = app();
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(dir.path().join("secret.txt"), "x").unwrap();
        register_project_at(&app, project.to_str().unwrap());

        let err = handoff(app.state(), "/etc".into(), HandoffTarget::Terminal).unwrap_err();
        assert!(err.contains("outside"), "got: {err}");

        let escape = format!("{}/../secret.txt", project.display());
        let err = handoff(app.state(), escape, HandoffTarget::Vscode).unwrap_err();
        assert!(err.contains("outside"), "got: {err}");
    }

    /// G8: slash commands are path-policy-checked and aggregate across
    /// providers (StubProvider default contributes nothing).
    #[tokio::test]
    async fn list_slash_commands_validates_path_and_tolerates_unsupported() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));
        let dir = tempfile::tempdir().unwrap();
        register_project_at(&app, dir.path().to_str().unwrap());

        let err = list_slash_commands(app.state(), app.state(), "/etc".into())
            .await
            .unwrap_err();
        assert!(err.contains("outside"), "got: {err}");

        let cmds = list_slash_commands(
            app.state(),
            app.state(),
            dir.path().to_str().unwrap().into(),
        )
        .await
        .unwrap();
        assert!(cmds.is_empty());
    }

    /// G9: persona materialization routes by capability; with no implementing
    /// provider the error is readable, and unknown projects are rejected.
    #[tokio::test]
    async fn materialize_persona_errors_are_readable() {
        let app = app();
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(StubProvider));
        app.manage(Arc::new(registry));

        let err = materialize_persona(app.state(), app.state(), "ghost".into(), "p".into())
            .await
            .unwrap_err();
        assert!(err.contains("unknown project"), "got: {err}");

        let dir = tempfile::tempdir().unwrap();
        register_project_at(&app, dir.path().to_str().unwrap());
        let projects = list_projects(app.state()).unwrap();
        let err = materialize_persona(app.state(), app.state(), projects[0].id.clone(), "p".into())
            .await
            .unwrap_err();
        assert!(
            err.contains("no provider supports persona materialization"),
            "got: {err}"
        );
        let err = remove_materialized_persona(app.state(), app.state(), projects[0].id.clone())
            .await
            .unwrap_err();
        assert!(
            err.contains("no provider supports persona materialization"),
            "got: {err}"
        );
    }

    /// T4 (G6): git commands are path-policy-gated and surface the
    /// `GitUnavailable:` prefix for non-repos; details live in `crate::git`.
    #[tokio::test]
    async fn git_commands_validate_paths_and_degrade_gracefully() {
        let app = app();
        let dir = tempfile::tempdir().unwrap();
        register_project_at(&app, dir.path().to_str().unwrap());

        let err = git_status(app.state(), "/etc".into()).await.unwrap_err();
        assert!(err.contains("outside"), "got: {err}");

        // registered but not a repo -> the graceful variant
        let err = git_status(app.state(), dir.path().display().to_string())
            .await
            .unwrap_err();
        assert!(err.starts_with("GitUnavailable:"), "got: {err}");
        let err = git_diff(app.state(), dir.path().display().to_string(), None)
            .await
            .unwrap_err();
        assert!(err.starts_with("GitUnavailable:"), "got: {err}");
        let err = git_default_base(app.state(), dir.path().display().to_string())
            .await
            .unwrap_err();
        assert!(err.starts_with("GitUnavailable:"), "got: {err}");
    }

    #[test]
    fn session_binding_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        assert!(list_session_bindings(app.state()).unwrap().is_empty());
        let b = upsert_session_binding(
            h.clone(),
            app.state(),
            NewSessionBinding {
                session_id: "sess-1".into(),
                agent_id: None,
                room_id: None,
                display_name: Some("Scout".into()),
                pinned: true,
            },
        )
        .unwrap();
        assert_eq!(b.display_name.as_deref(), Some("Scout"));
        assert!(b.pinned);
        assert_eq!(list_session_bindings(app.state()).unwrap(), vec![b]);
        assert!(delete_session_binding(h.clone(), app.state(), "sess-1".into()).unwrap());
        assert!(!delete_session_binding(h, app.state(), "sess-1".into()).unwrap());
        assert!(list_session_bindings(app.state()).unwrap().is_empty());
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

    /// EKI-20: the settings window is created once with the "settings" label
    /// (matching capabilities/settings.json); a second call focuses instead of
    /// erroring or duplicating.
    #[test]
    fn open_settings_window_creates_once_then_focuses() {
        let app = app();
        assert!(app.get_webview_window("settings").is_none());
        open_settings_window(app.handle().clone()).unwrap();
        assert!(app.get_webview_window("settings").is_some());
        open_settings_window(app.handle().clone()).unwrap();
        assert_eq!(
            app.webview_windows()
                .keys()
                .filter(|l| l.as_str() == "settings")
                .count(),
            1
        );
    }
}
