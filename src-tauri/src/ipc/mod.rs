use crate::engine::provider::{ProviderCaps, ProviderRegistry, SessionProvider};
use crate::engine::rules::{PermissionRule, PermissionRules};
use crate::engine::types::{
    ArchivedSession, PermissionResponse, QuestionResponse, SearchHit, SessionId, SessionMeta,
    SlashCommand, SpawnSpec, TranscriptPage, UserInput,
};
use crate::events::DomainEvent;
use crate::orchestrator::{Orchestrator, StartMeetingSpec};
use crate::security::paths::{Access, PathPolicy};
use crate::store::agents::{Agent, NewAgent};
use crate::store::meetings::{ActionItem, Meeting, MeetingTurn};
use crate::store::notification_rules::{
    NewNotificationRule, NotificationRule, NOTIFICATION_RULES_SETTING_KEY,
};
use crate::store::projects::{NewProject, Project};
use crate::store::prompt_templates::{
    NewPromptTemplate, PromptTemplate, PROMPT_TEMPLATES_SETTING_KEY,
};
use crate::store::room_rules::{NewRoomRule, RoomRule};
use crate::store::rooms::{NewRoom, Room};
use crate::store::runs::{NewRun, Run, RunResult};
use crate::store::session_bindings::{NewSessionBinding, SessionBinding};
use crate::store::standups::{Standup, StandupEntry};
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

// ---- hooks bridge (M6 T1, D-M6-1/G1) ----
// Thin wrappers over `crate::hooks`: status, REAL preview diff text,
// install/uninstall. Windows reports `supported: false` and the mutating
// commands refuse (UDS bridge; watcher-only mode there).

#[tauri::command]
#[specta::specta]
pub fn hooks_status() -> Result<crate::hooks::HooksStatus> {
    Ok(crate::hooks::bridge_status())
}

#[tauri::command]
#[specta::specta]
pub fn preview_hooks_install() -> Result<crate::hooks::HooksPreview> {
    crate::hooks::bridge_preview().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn install_hooks() -> Result<crate::hooks::HooksStatus> {
    crate::hooks::bridge_install().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn uninstall_hooks() -> Result<crate::hooks::HooksStatus> {
    crate::hooks::bridge_uninstall().map_err(err)
}

// ---- onboarding (M6 T2, D-M6-3/D-M6-9, G2/G3) ----

/// Probe the machine for the wizard's detect step; a found CLI path is
/// persisted so the provider config picks it up on next launch.
#[tauri::command]
#[specta::specta]
pub async fn detect_environment(
    store: State<'_, Arc<Store>>,
) -> Result<crate::onboarding::EnvReport> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || crate::onboarding::detect_environment(&store))
        .await
        .map_err(|e| e.to_string())?
        .map_err(err)
}

/// Manual CLI path picker re-probe (D-M6-3): persists the path and returns
/// the probed version line when the binary answers.
#[tauri::command]
#[specta::specta]
pub async fn set_cli_path(store: State<'_, Arc<Store>>, path: String) -> Result<Option<String>> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || crate::onboarding::set_cli_path(&store, &path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(err)
}

/// Recent unique project paths from the watcher meta cache, ranked by last
/// activity; already-registered project paths filtered out. No new scanner.
#[tauri::command]
#[specta::specta]
pub async fn scan_recent_projects(
    store: State<'_, Arc<Store>>,
    registry: State<'_, Arc<ProviderRegistry>>,
) -> Result<Vec<crate::onboarding::RecentProject>> {
    let metas = registry.list_all_sessions().await;
    let existing: Vec<String> = store
        .list_projects()
        .map_err(err)?
        .into_iter()
        .map(|p| p.folder_path)
        .collect();
    Ok(crate::onboarding::rank_recent_projects(&metas, &existing))
}

/// Materialize the sample crew (D-M6-9) and announce it with the existing
/// coarse DomainEvents.
#[tauri::command]
#[specta::specta]
pub fn create_sample_crew<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
) -> Result<crate::onboarding::SampleCrewResult> {
    let home = dirs::home_dir().ok_or("no home directory")?;
    let result = crate::onboarding::create_sample_crew(&store, &home).map_err(err)?;
    let emit = |e: DomainEvent| e.emit(&app).map_err(|e| e.to_string());
    emit(DomainEvent::ProjectChanged {
        project_id: result.project_id.clone(),
    })?;
    for room_id in &result.room_ids {
        emit(DomainEvent::RoomChanged {
            room_id: room_id.clone(),
        })?;
    }
    for agent_id in &result.agent_ids {
        emit(DomainEvent::AgentCreated {
            agent_id: agent_id.clone(),
        })?;
    }
    for task_id in &result.task_ids {
        emit(DomainEvent::TaskChanged {
            task_id: task_id.clone(),
        })?;
    }
    Ok(result)
}

// ---- v1 import (M6 T3, D-M6-8/G9) ----
// Preview and run share one plan builder in `import::v1`; both default the
// db path to the standard v1 location. Run emits the existing coarse
// DomainEvents batched after commit (Appendix C: no new variants).

fn v1_db_path(db_path: Option<String>) -> std::path::PathBuf {
    db_path
        .map(std::path::PathBuf::from)
        .unwrap_or_else(crate::onboarding::default_v1_db_path)
}

#[tauri::command]
#[specta::specta]
pub async fn preview_v1_import(
    store: State<'_, Arc<Store>>,
    db_path: Option<String>,
) -> Result<crate::import::v1::ImportReport> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::import::v1::preview(&store, &v1_db_path(db_path), &Default::default())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn run_v1_import<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Arc<Store>>,
    db_path: Option<String>,
    options: crate::import::v1::ImportOptions,
) -> Result<crate::import::v1::ImportReport> {
    let blocking_store = store.inner().clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        crate::import::v1::apply(&blocking_store, &v1_db_path(db_path), &options)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(err)?;

    let emit = |e: DomainEvent| e.emit(&app).map_err(|e| e.to_string());
    for id in &report.imported.projects {
        emit(DomainEvent::ProjectChanged {
            project_id: id.clone(),
        })?;
    }
    for id in &report.imported.rooms {
        emit(DomainEvent::RoomChanged {
            room_id: id.clone(),
        })?;
    }
    for id in &report.imported.agents {
        emit(DomainEvent::AgentCreated {
            agent_id: id.clone(),
        })?;
    }
    for id in &report.imported.tasks {
        emit(DomainEvent::TaskChanged {
            task_id: id.clone(),
        })?;
    }
    for id in &report.imported.bindings {
        emit(DomainEvent::SessionBindingChanged {
            session_id: id.clone(),
        })?;
    }
    if !report.imported.templates.is_empty() {
        emit(DomainEvent::SettingChanged {
            key: PROMPT_TEMPLATES_SETTING_KEY.into(),
        })?;
    }
    Ok(report)
}

// ---- updater (M6 T7, D-M6-7/G7) ----
// Rust-side typed IPC: the webview holds no updater/process grant. Offline
// or unsigned-dev builds get a readable error — never a broken app.

#[tauri::command]
#[specta::specta]
pub async fn check_for_update(
    app: AppHandle<tauri::Wry>,
) -> Result<Option<crate::updater::UpdateInfo>> {
    crate::updater::check(&app).await.map_err(err)
}

/// Download + verify + install, persisting `updater.pending_notes` for the
/// What's-new dialog, then relaunch. Only returns on failure.
#[tauri::command]
#[specta::specta]
pub async fn install_update(
    app: AppHandle<tauri::Wry>,
    store: State<'_, Arc<Store>>,
) -> Result<()> {
    crate::updater::install(&app, &store).await.map_err(err)
}

// ---- error report (M6 T6, D-M6-10/G8) ----

/// Assemble the local report bundle (version, OS/arch, last error lines —
/// NO transcript/settings content) and reveal it next to the user. Returns
/// the file path. Nothing leaves the machine.
#[tauri::command]
#[specta::specta]
pub fn build_error_report<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    let version = app.package_info().version.to_string();
    let path = crate::errlog::build_report(&version).map_err(err)?;
    crate::errlog::reveal(&path);
    Ok(path.display().to_string())
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

// ---- notification rules (T5, D-M3-9/G7) ----
// Mutations announce themselves via `SettingChanged { key: "notification_rules" }`
// — the cheap invalidation signal; the matcher is a pure frontend function.

fn emit_notification_rules_changed<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    DomainEvent::SettingChanged {
        key: NOTIFICATION_RULES_SETTING_KEY.into(),
    }
    .emit(app)
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_notification_rules(store: State<Arc<Store>>) -> Result<Vec<NotificationRule>> {
    store.list_notification_rules().map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_notification_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewNotificationRule,
) -> Result<NotificationRule> {
    let rule = store.create_notification_rule(input).map_err(err)?;
    emit_notification_rules_changed(&app)?;
    Ok(rule)
}

#[tauri::command]
#[specta::specta]
pub fn update_notification_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    rule: NotificationRule,
) -> Result<NotificationRule> {
    let rule = store.update_notification_rule(rule).map_err(err)?;
    emit_notification_rules_changed(&app)?;
    Ok(rule)
}

#[tauri::command]
#[specta::specta]
pub fn delete_notification_rule<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
    let deleted = store.delete_notification_rule(&id).map_err(err)?;
    if deleted {
        emit_notification_rules_changed(&app)?;
    }
    Ok(deleted)
}

/// Seed the M6 default attention rules (D-M6-4) — called by the wizard's
/// notifications opt-in. Idempotent; returns only newly created rules.
#[tauri::command]
#[specta::specta]
pub fn seed_default_notification_rules<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
) -> Result<Vec<NotificationRule>> {
    let created = store.seed_default_notification_rules().map_err(err)?;
    if !created.is_empty() {
        emit_notification_rules_changed(&app)?;
    }
    Ok(created)
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

/// Open (or focus) a dedicated workspace window (world-primary shell): the
/// panels in their own window, while the main window keeps the ONE 3D world.
/// Mirrors `open_settings_window` — own least-privilege capability file
/// (`capabilities/workspace.json`, core:default only); the webview renders
/// WorkspaceShell only when launched with `?window=workspace` (no world, no
/// wizard). Cross-window state stays consistent the same way: both windows
/// write through the same IPC and reconcile on domain events.
#[tauri::command]
#[specta::specta]
pub fn open_workspace_window<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    use tauri::Manager;
    if let Some(existing) = app.get_webview_window("workspace") {
        return existing.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "workspace",
        tauri::WebviewUrl::App("index.html?window=workspace".into()),
    )
    .title("CrewHub Workspace")
    .inner_size(1100.0, 720.0)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// ---- meetings (M4 T2 read surface + T3 engine commands) ----

/// Start a meeting: persists the row + config, then the orchestrator drives
/// it (gathering → rounds → synthesis) over dedicated managed sessions.
#[tauri::command]
#[specta::specta]
pub async fn start_meeting(
    orchestrator: State<'_, Arc<Orchestrator>>,
    spec: StartMeetingSpec,
) -> Result<Meeting> {
    orchestrator.start_meeting(spec).map_err(err)
}

/// Cancel: terminal state persisted immediately; the in-flight turn (if any)
/// is interrupted by the driver.
#[tauri::command]
#[specta::specta]
pub async fn cancel_meeting(
    orchestrator: State<'_, Arc<Orchestrator>>,
    id: String,
) -> Result<Meeting> {
    orchestrator.cancel_meeting(&id).map_err(err)
}

/// Convert an action item to a board task (16.3): one click on the existing
/// M3 surface. `room_id` falls back to the meeting's room — without either,
/// this errors (the standing room_id lesson: tasks without a room don't show
/// on any board, so the UI must ask).
#[tauri::command]
#[specta::specta]
pub fn convert_action_item<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    item_id: String,
    room_id: Option<String>,
) -> Result<Task> {
    let item = store
        .get_action_item(&item_id)
        .map_err(err)?
        .ok_or_else(|| format!("no action item {item_id}"))?;
    let meeting = store
        .get_meeting(&item.meeting_id)
        .map_err(err)?
        .ok_or_else(|| "meeting vanished".to_string())?;
    let room_id = room_id.or(meeting.room_id.clone()).ok_or_else(|| {
        "room_id required: the meeting has no room — pick one in the convert dialog".to_string()
    })?;
    let task = store
        .create_task_as(
            NewTask {
                project_id: meeting.project_id.clone(),
                room_id: Some(room_id),
                title: item.text.clone(),
                description: Some(format!(
                    "Action item from meeting “{}” (meeting:{})",
                    meeting.title, meeting.id
                )),
                priority: item.priority.clone(),
                assignee_agent_id: item.assignee_agent_id.clone(),
                created_by: None,
            },
            ACTOR_HUMAN,
        )
        .map_err(err)?;
    store
        .set_action_item_task(&item_id, &task.id)
        .map_err(err)?;
    DomainEvent::TaskChanged {
        task_id: task.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    DomainEvent::MeetingChanged {
        meeting_id: meeting.id,
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
#[specta::specta]
pub fn list_meetings(store: State<Arc<Store>>, project_id: Option<String>) -> Result<Vec<Meeting>> {
    store.list_meetings(project_id.as_deref()).map_err(err)
}

/// Single-meeting refetch for `MeetingChanged` reconciliation (D-M4-11).
#[tauri::command]
#[specta::specta]
pub fn get_meeting(store: State<Arc<Store>>, id: String) -> Result<Option<Meeting>> {
    store.get_meeting(&id).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn list_meeting_turns(
    store: State<Arc<Store>>,
    meeting_id: String,
) -> Result<Vec<MeetingTurn>> {
    store.list_meeting_turns(&meeting_id).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn list_action_items(store: State<Arc<Store>>, meeting_id: String) -> Result<Vec<ActionItem>> {
    store.list_action_items(&meeting_id).map_err(err)
}

// ---- standups (M4 T4 — D-M4-7) ----

/// Manual standup trigger: creates the row and fans out one bounded haiku
/// gathering run per agent in the background; entries stream in via
/// `StandupChanged`.
#[tauri::command]
#[specta::specta]
pub async fn run_standup(
    orchestrator: State<'_, Arc<Orchestrator>>,
    agent_ids: Option<Vec<String>>,
    title: Option<String>,
) -> Result<Standup> {
    orchestrator.start_standup(agent_ids, title).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn list_standups(store: State<Arc<Store>>) -> Result<Vec<Standup>> {
    store.list_standups().map_err(err)
}

/// Single-standup refetch for `StandupChanged` reconciliation.
#[tauri::command]
#[specta::specta]
pub fn get_standup(store: State<Arc<Store>>, id: String) -> Result<Option<Standup>> {
    store.get_standup(&id).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn list_standup_entries(
    store: State<Arc<Store>>,
    standup_id: String,
) -> Result<Vec<StandupEntry>> {
    store.list_standup_entries(&standup_id).map_err(err)
}

// ---- runs & scheduler (M4 T5 — D-M4-4/5) ----

#[tauri::command]
#[specta::specta]
pub fn list_runs(store: State<Arc<Store>>) -> Result<Vec<Run>> {
    store.list_runs().map_err(err)
}

/// Single-run refetch for `RunChanged` reconciliation.
#[tauri::command]
#[specta::specta]
pub fn get_run(store: State<Arc<Store>>, id: String) -> Result<Option<Run>> {
    store.get_run(&id).map_err(err)
}

/// Create a run. `spec_json` is validated at write time against the tagged
/// union (prompt | sequence | standup); the cron expression (if any) must parse.
#[tauri::command]
#[specta::specta]
pub fn create_run<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewRun,
) -> Result<Run> {
    crate::orchestrator::dispatch::validate_spec(&input.spec_json).map_err(err)?;
    if let Some(cron) = input.schedule_cron.as_deref() {
        if crate::orchestrator::scheduler::next_fire(cron, Store::now_ms()).is_none() {
            return Err(format!("unparsable cron expression: {cron}"));
        }
    }
    let run = store.create_run(input).map_err(err)?;
    DomainEvent::RunChanged {
        run_id: run.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(run)
}

#[tauri::command]
#[specta::specta]
pub fn update_run<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    run: Run,
) -> Result<Run> {
    crate::orchestrator::dispatch::validate_spec(&run.spec_json).map_err(err)?;
    if let Some(cron) = run.schedule_cron.as_deref() {
        if crate::orchestrator::scheduler::next_fire(cron, Store::now_ms()).is_none() {
            return Err(format!("unparsable cron expression: {cron}"));
        }
    }
    let run = store.update_run(run).map_err(err)?;
    DomainEvent::RunChanged {
        run_id: run.id.clone(),
    }
    .emit(&app)
    .map_err(|e| e.to_string())?;
    Ok(run)
}

#[tauri::command]
#[specta::specta]
pub fn delete_run<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
    let deleted = store.delete_run(&id).map_err(err)?;
    if deleted {
        DomainEvent::RunChanged { run_id: id }
            .emit(&app)
            .map_err(|e| e.to_string())?;
    }
    Ok(deleted)
}

#[tauri::command]
#[specta::specta]
pub fn set_run_enabled<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
    enabled: bool,
) -> Result<Run> {
    store.set_run_enabled(&id, enabled).map_err(err)?;
    DomainEvent::RunChanged { run_id: id.clone() }
        .emit(&app)
        .map_err(|e| e.to_string())?;
    store
        .get_run(&id)
        .map_err(err)?
        .ok_or_else(|| format!("no run {id}"))
}

/// "Run now": the same dispatcher code path as a scheduled firing (D-M4-5).
#[tauri::command]
#[specta::specta]
pub async fn run_now(
    orchestrator: State<'_, Arc<Orchestrator>>,
    run_id: String,
) -> Result<RunResult> {
    orchestrator.run_now(&run_id).await.map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn list_run_results(store: State<Arc<Store>>, run_id: String) -> Result<Vec<RunResult>> {
    store.list_run_results(&run_id).map_err(err)
}

/// Cron preview for the schedule editor: next 3 occurrences + a human
/// description, plus the honest copy the panel must show (D-M4-4).
#[derive(Serialize, specta::Type)]
pub struct CronPreview {
    #[specta(type = Vec<specta_typescript::Number>)]
    pub next: Vec<i64>,
    pub desc: Option<String>,
    /// "Schedules run only while CrewHub is open."
    pub note: String,
}

#[tauri::command]
#[specta::specta]
pub fn preview_cron(expr: String) -> Result<CronPreview> {
    use crate::orchestrator::scheduler::{next_fire, SCHEDULER_HONEST_COPY};
    let mut next = Vec::new();
    let mut after = Store::now_ms();
    for _ in 0..3 {
        match next_fire(&expr, after) {
            Some(t) => {
                next.push(t);
                after = t;
            }
            None => break,
        }
    }
    if next.is_empty() {
        return Err(format!("unparsable cron expression: {expr}"));
    }
    let desc = std::str::FromStr::from_str(expr.as_str())
        .ok()
        .map(|c: croner::Cron| c.describe());
    Ok(CronPreview {
        next,
        desc,
        note: SCHEDULER_HONEST_COPY.into(),
    })
}

// ---- prompt templates (M4 T8 — D-M4-8) ----

/// Validate `variables_json`: an array of `{name, default?}` objects.
fn validate_variables_json(raw: Option<&str>) -> Result<()> {
    let Some(raw) = raw else { return Ok(()) };
    let v: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("invalid variables_json: {e}"))?;
    let arr = v
        .as_array()
        .ok_or_else(|| "variables_json must be an array".to_string())?;
    for item in arr {
        let name = item
            .get("name")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "every variable needs a string name".to_string())?;
        if name.trim().is_empty() {
            return Err("variable names must not be empty".into());
        }
        if let Some(default) = item.get("default") {
            if !default.is_string() && !default.is_null() {
                return Err(format!("variable {name}: default must be a string"));
            }
        }
    }
    Ok(())
}

fn emit_templates_changed<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    DomainEvent::SettingChanged {
        key: PROMPT_TEMPLATES_SETTING_KEY.into(),
    }
    .emit(app)
    .map_err(|e| e.to_string())
}

/// Global templates plus, when given, the project's own (D-M4-8).
#[tauri::command]
#[specta::specta]
pub fn list_prompt_templates(
    store: State<Arc<Store>>,
    project_id: Option<String>,
) -> Result<Vec<PromptTemplate>> {
    store
        .list_prompt_templates(project_id.as_deref())
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub fn create_prompt_template<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    input: NewPromptTemplate,
) -> Result<PromptTemplate> {
    validate_variables_json(input.variables_json.as_deref())?;
    let t = store.create_prompt_template(input).map_err(err)?;
    emit_templates_changed(&app)?;
    Ok(t)
}

#[tauri::command]
#[specta::specta]
pub fn update_prompt_template<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    template: PromptTemplate,
) -> Result<PromptTemplate> {
    validate_variables_json(template.variables_json.as_deref())?;
    let t = store.update_prompt_template(template).map_err(err)?;
    emit_templates_changed(&app)?;
    Ok(t)
}

#[tauri::command]
#[specta::specta]
pub fn delete_prompt_template<R: Runtime>(
    app: AppHandle<R>,
    store: State<Arc<Store>>,
    id: String,
) -> Result<bool> {
    let deleted = store.delete_prompt_template(&id).map_err(err)?;
    if deleted {
        emit_templates_changed(&app)?;
    }
    Ok(deleted)
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

    /// T5 (G7): notification-rule CRUD round-trips with scope/trigger
    /// validation; the matcher lives in the frontend (D-M3-9).
    #[test]
    fn notification_rule_commands_roundtrip() {
        let app = app();
        let h = app.handle().clone();
        assert!(list_notification_rules(app.state()).unwrap().is_empty());

        let err = create_notification_rule(
            h.clone(),
            app.state(),
            NewNotificationRule {
                scope: "global".into(),
                scope_id: None,
                trigger: "task_vibed".into(),
                config_json: None,
                enabled: None,
            },
        )
        .unwrap_err();
        assert!(err.contains("invalid trigger"), "got: {err}");

        let mut rule = create_notification_rule(
            h.clone(),
            app.state(),
            NewNotificationRule {
                scope: "global".into(),
                scope_id: None,
                trigger: "task_blocked".into(),
                config_json: None,
                enabled: None,
            },
        )
        .unwrap();
        assert!(rule.enabled);
        rule.enabled = false; // per-rule mute
        let rule = update_notification_rule(h.clone(), app.state(), rule).unwrap();
        assert!(!list_notification_rules(app.state()).unwrap()[0].enabled);
        assert!(delete_notification_rule(h.clone(), app.state(), rule.id.clone()).unwrap());
        assert!(!delete_notification_rule(h, app.state(), rule.id).unwrap());
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

    /// World-primary shell: the workspace window is created once with the
    /// "workspace" label (matching capabilities/workspace.json); a second call
    /// focuses instead of erroring or duplicating — there's never a second one.
    #[test]
    fn open_workspace_window_creates_once_then_focuses() {
        let app = app();
        assert!(app.get_webview_window("workspace").is_none());
        open_workspace_window(app.handle().clone()).unwrap();
        assert!(app.get_webview_window("workspace").is_some());
        open_workspace_window(app.handle().clone()).unwrap();
        assert_eq!(
            app.webview_windows()
                .keys()
                .filter(|l| l.as_str() == "workspace")
                .count(),
            1
        );
    }
}
