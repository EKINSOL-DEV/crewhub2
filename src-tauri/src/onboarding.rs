//! Onboarding backend (M6 T2 — D-M6-3/D-M6-9, G2/G3): environment detection,
//! recent-project ranking and the deletable sample crew.
//!
//! Naming-firewall note: the CLI probe itself lives in `engine/claude/detect`
//! (the documented exception — only that module knows binary names and
//! install locations); this module composes results and owns the
//! provider-neutral pieces (v1 DB presence, sample crew, wizard state).

use crate::engine::types::SessionMeta;
use crate::store::agents::NewAgent;
use crate::store::projects::NewProject;
use crate::store::rooms::NewRoom;
use crate::store::tasks::NewTask;
use crate::store::Store;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

/// `pending | done | skipped` — the wizard overlay shows while != "done"
/// (D-M6-2). Written by the wizard; pre-set to "done" for existing installs
/// by [`mark_existing_install_done`].
pub const ONBOARDING_STATE_KEY: &str = "onboarding.state";
/// The resumable wizard step id (D-M6-2).
pub const ONBOARDING_STEP_KEY: &str = "onboarding.step";

/// Appendix C `EnvReport`.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct EnvReport {
    /// Resolved CLI path (persisted to the cli-path setting when found).
    pub cli_path: Option<String>,
    /// First line of `--version`, when the probe answered in time.
    pub cli_version: Option<String>,
    /// The agent runtime's user dir exists (it has been used on this machine).
    pub claude_dir: bool,
    /// Its transcripts dir exists (recent-project scan will have material).
    pub claude_projects: bool,
    /// Path to a CrewHub v1 database, when present (the importer hook).
    pub v1_db: Option<String>,
}

/// One ranked entry from the recent-project scan (Appendix C).
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
pub struct RecentProject {
    pub path: String,
    #[specta(type = specta_typescript::Number)]
    pub last_active_ms: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SampleCrewResult {
    pub project_id: String,
    pub room_ids: Vec<String>,
    pub agent_ids: Vec<String>,
    pub task_ids: Vec<String>,
}

/// Default v1 database location (a CrewHub format, provider-neutral).
pub fn default_v1_db_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".crewhub/crewhub.db")
}

/// Probe the machine (D-M6-3) and persist a found CLI path so
/// `ClaudeConfig::from_settings` picks it up on the next launch.
pub fn detect_environment(store: &Store) -> anyhow::Result<EnvReport> {
    let home = dirs::home_dir().unwrap_or_default();
    let cli = crate::engine::claude::detect::find_cli(std::env::var_os("PATH").as_deref(), &home);
    if let Some(path) = &cli {
        store.set_setting(
            crate::engine::claude::detect::CLI_PATH_SETTING,
            &path.display().to_string(),
        )?;
    }
    let cli_version = cli.as_deref().and_then(|bin| {
        crate::engine::claude::detect::probe_version(
            bin,
            crate::engine::claude::detect::VERSION_PROBE_TIMEOUT,
        )
    });
    let claude_dir = home.join(".claude").is_dir();
    let claude_projects = home.join(".claude/projects").is_dir();
    let v1 = default_v1_db_path();
    Ok(EnvReport {
        cli_path: cli.map(|p| p.display().to_string()),
        cli_version,
        claude_dir,
        claude_projects,
        v1_db: v1.is_file().then(|| v1.display().to_string()),
    })
}

/// Re-probe a user-picked CLI path (the wizard's manual picker): persists and
/// reports the version only when the path is plausible.
pub fn set_cli_path(store: &Store, path: &str) -> anyhow::Result<Option<String>> {
    let p = Path::new(path);
    anyhow::ensure!(p.is_file(), "no executable at {path}");
    store.set_setting(crate::engine::claude::detect::CLI_PATH_SETTING, path)?;
    Ok(crate::engine::claude::detect::probe_version(
        p,
        crate::engine::claude::detect::VERSION_PROBE_TIMEOUT,
    ))
}

/// Pure fold (D-M6-3): unique project paths from the watcher's meta cache,
/// ranked by last activity, minus already-registered project paths. No new
/// filesystem scanner.
pub fn rank_recent_projects(metas: &[SessionMeta], existing: &[String]) -> Vec<RecentProject> {
    let mut by_path: HashMap<&str, i64> = HashMap::new();
    for meta in metas {
        if meta.project_path.is_empty() {
            continue;
        }
        let entry = by_path
            .entry(meta.project_path.as_str())
            .or_insert(i64::MIN);
        *entry = (*entry).max(meta.last_activity_ms);
    }
    let mut out: Vec<RecentProject> = by_path
        .into_iter()
        .filter(|(path, _)| !existing.iter().any(|e| e == path))
        .map(|(path, last_active_ms)| RecentProject {
            path: path.to_string(),
            last_active_ms,
        })
        .collect();
    out.sort_by(|a, b| {
        b.last_active_ms
            .cmp(&a.last_active_ms)
            .then(a.path.cmp(&b.path))
    });
    out
}

pub const SAMPLE_PROJECT_NAME: &str = "CrewHub Sample";
const SAMPLE_DIR_NAME: &str = "CrewHub Sample";

/// Materialize the sample crew (D-M6-9): a real folder under `base`, one
/// project, two rooms, two safe-default agents and three starter tasks —
/// ordinary data, deleted through ordinary CRUD. Refuses politely when the
/// folder or project already exists.
pub fn create_sample_crew(store: &Store, base: &Path) -> anyhow::Result<SampleCrewResult> {
    let folder = base.join(SAMPLE_DIR_NAME);
    anyhow::ensure!(
        !folder.exists(),
        "the sample folder already exists at {} — delete it (and the '{}' project) to start over",
        folder.display(),
        SAMPLE_PROJECT_NAME
    );
    let duplicate = store
        .list_projects()?
        .into_iter()
        .any(|p| p.name == SAMPLE_PROJECT_NAME);
    anyhow::ensure!(
        !duplicate,
        "a '{SAMPLE_PROJECT_NAME}' project already exists — it's ordinary data; delete it to recreate the sample"
    );

    let docs = folder.join("docs");
    std::fs::create_dir_all(&docs)?;
    std::fs::write(
        folder.join("README.md"),
        "# CrewHub Sample\n\nA tiny playground your crew can react to. \
         Everything here is ordinary data — delete the project (and this folder) whenever you like.\n",
    )?;
    std::fs::write(
        docs.join("getting-started.md"),
        "# Getting started\n\n1. Open a chat with Scout.\n2. Ask for a tour of this folder.\n3. Watch the board update as tasks move.\n",
    )?;
    std::fs::write(
        docs.join("ideas.md"),
        "# Ideas box\n\n- Rename the rooms\n- Give an agent a persona\n- Import your real project when ready\n",
    )?;

    let project = store.create_project(NewProject {
        name: SAMPLE_PROJECT_NAME.into(),
        description: Some("A safe sandbox crew — delete me whenever".into()),
        icon: Some("📦".into()),
        color: None,
        folder_path: folder.display().to_string(),
        docs_path: Some(docs.display().to_string()),
    })?;

    let lounge = store.create_room(NewRoom {
        project_id: Some(project.id.clone()),
        name: "Sample Lounge".into(),
        icon: Some("🛋️".into()),
        color: None,
        is_hq: Some(true),
    })?;
    let workshop = store.create_room(NewRoom {
        project_id: Some(project.id.clone()),
        name: "Workshop".into(),
        icon: Some("🛠️".into()),
        color: None,
        is_hq: Some(false),
    })?;

    // Safe defaults (D-M6-9): cheapest model, default permission mode and NO
    // auto-spawn — a demo must never burn tokens or touch files uninvited.
    let mut agent_ids = Vec::new();
    for (name, icon) in [("Scout", "🔭"), ("Sketch", "✏️")] {
        let agent = store.create_agent(NewAgent {
            name: name.into(),
            icon: Some(icon.into()),
            color: None,
            default_model: Some("haiku".into()),
            project_path: Some(folder.display().to_string()),
            permission_mode: Some("default".into()),
            system_prompt: None,
        })?;
        debug_assert!(!agent.auto_spawn);
        agent_ids.push(agent.id);
    }

    let starters = [
        ("Say hello to your crew", &lounge, "low"),
        ("Explore the sample docs", &workshop, "medium"),
        ("Move this card to Done", &workshop, "high"),
    ];
    let mut task_ids = Vec::new();
    for (title, room, priority) in starters {
        let task = store.create_task(NewTask {
            project_id: Some(project.id.clone()),
            room_id: Some(room.id.clone()),
            title: title.into(),
            description: None,
            priority: Some(priority.into()),
            assignee_agent_id: None,
            created_by: None,
        })?;
        task_ids.push(task.id);
    }

    Ok(SampleCrewResult {
        project_id: project.id,
        room_ids: vec![lounge.id, workshop.id],
        agent_ids,
        task_ids,
    })
}

/// One-time fresh-install check (D-M6-2): a DB that already has projects or
/// agents never sees the wizard — `onboarding.state` is set to "done" when
/// absent. Genuinely fresh installs keep the key absent (== pending).
pub fn mark_existing_install_done(store: &Store) -> anyhow::Result<()> {
    if store.get_setting(ONBOARDING_STATE_KEY)?.is_some() {
        return Ok(());
    }
    let has_data = !store.list_projects()?.is_empty() || !store.list_agents()?.is_empty();
    if has_data {
        store.set_setting(ONBOARDING_STATE_KEY, "done")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::types::{SessionId, SessionMeta, SessionOrigin, SessionStatus, UsageTotals};

    fn meta(path: &str, last: i64) -> SessionMeta {
        SessionMeta {
            id: SessionId {
                provider: "test".into(),
                id: format!("s-{path}-{last}"),
            },
            origin: SessionOrigin::External,
            project_path: path.into(),
            model: None,
            status: SessionStatus::Idle,
            activity_detail: None,
            parent: None,
            team: None,
            usage: UsageTotals::default(),
            git_branch: None,
            last_activity_ms: last,
        }
    }

    #[test]
    fn rank_recent_projects_dedupes_ranks_and_filters_existing() {
        let metas = vec![
            meta("/work/alpha", 100),
            meta("/work/alpha", 300),
            meta("/work/beta", 200),
            meta("/work/gamma", 50),
            meta("", 999),
        ];
        let existing = vec!["/work/gamma".to_string()];
        let ranked = rank_recent_projects(&metas, &existing);
        assert_eq!(
            ranked,
            vec![
                RecentProject {
                    path: "/work/alpha".into(),
                    last_active_ms: 300
                },
                RecentProject {
                    path: "/work/beta".into(),
                    last_active_ms: 200
                },
            ]
        );
    }

    #[test]
    fn sample_crew_materializes_and_refuses_twice() {
        let store = Store::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let result = create_sample_crew(&store, dir.path()).unwrap();

        let folder = dir.path().join(SAMPLE_DIR_NAME);
        assert!(folder.join("README.md").is_file());
        assert!(folder.join("docs/getting-started.md").is_file());

        let projects = store.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, result.project_id);
        let rooms = store.list_rooms().unwrap();
        assert_eq!(rooms.len(), 2);
        assert_eq!(rooms.iter().filter(|r| r.is_hq).count(), 1);
        let agents = store.list_agents().unwrap();
        assert_eq!(agents.len(), 2);
        for agent in &agents {
            assert_eq!(agent.default_model.as_deref(), Some("haiku"));
            assert_eq!(agent.permission_mode, "default");
            assert!(!agent.auto_spawn, "sample agents must never auto-spawn");
        }
        let tasks = store.list_tasks().unwrap();
        assert_eq!(tasks.len(), 3);
        assert!(
            tasks.iter().all(|t| t.room_id.is_some()),
            "boardless tasks are invisible"
        );

        let err = create_sample_crew(&store, dir.path()).unwrap_err();
        assert!(err.to_string().contains("already exists"), "got: {err}");
    }

    #[test]
    fn sample_crew_refuses_on_existing_project_even_without_folder() {
        let store = Store::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        create_sample_crew(&store, dir.path()).unwrap();
        let err = create_sample_crew(&store, other.path()).unwrap_err();
        assert!(
            err.to_string().contains("project already exists"),
            "got: {err}"
        );
    }

    #[test]
    fn existing_install_is_marked_done_fresh_one_is_not() {
        let fresh = Store::open_in_memory().unwrap();
        mark_existing_install_done(&fresh).unwrap();
        assert_eq!(fresh.get_setting(ONBOARDING_STATE_KEY).unwrap(), None);

        let seasoned = Store::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        seasoned
            .create_project(NewProject {
                name: "P".into(),
                description: None,
                icon: None,
                color: None,
                folder_path: dir.path().display().to_string(),
                docs_path: None,
            })
            .unwrap();
        mark_existing_install_done(&seasoned).unwrap();
        assert_eq!(
            seasoned.get_setting(ONBOARDING_STATE_KEY).unwrap(),
            Some("done".into())
        );

        // user choices are never overwritten
        seasoned
            .set_setting(ONBOARDING_STATE_KEY, "skipped")
            .unwrap();
        mark_existing_install_done(&seasoned).unwrap();
        assert_eq!(
            seasoned.get_setting(ONBOARDING_STATE_KEY).unwrap(),
            Some("skipped".into())
        );
    }

    #[test]
    fn cli_setting_feeds_claude_config() {
        let store = Store::open_in_memory().unwrap();
        let config = crate::engine::claude::ClaudeConfig::from_settings(&store);
        assert_eq!(config.cli_path, std::path::PathBuf::from("claude"));
        store
            .set_setting(
                crate::engine::claude::detect::CLI_PATH_SETTING,
                "/custom/claude",
            )
            .unwrap();
        let config = crate::engine::claude::ClaudeConfig::from_settings(&store);
        assert_eq!(config.cli_path, std::path::PathBuf::from("/custom/claude"));
    }
}
