//! v1 → v2 importer (M6 T3 — D-M6-8, EKI-106).
//!
//! Contract (all binding, all tested):
//! - the v1 database is opened **read-only** and never written;
//! - **v1 ids are preserved verbatim** and every insert is skip-if-exists —
//!   re-running reports `already imported` per row, never duplicates;
//! - preview and run share ONE plan builder; run executes the plan inside a
//!   single v2 transaction;
//! - every dropped row/table is **counted and named**, never silent;
//! - `custom_blueprints` rows are returned raw — the frontend converts them
//!   through the existing tested `parse-v1.ts` (one converter, not two).

use crate::store::Store;
use rusqlite::types::Value as Sql;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
pub struct ImportOptions {
    /// v1 project id → folder path, for v1 projects without `folder_path`
    /// (NOT NULL in v2). Projects without an override are skipped (counted).
    #[serde(default)]
    pub folder_overrides: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SkipCount {
    pub reason: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TableReport {
    pub table: String,
    pub found: u32,
    pub will_import: u32,
    /// Row skips AND named field-level drops, both counted (never silent).
    pub skipped: Vec<SkipCount>,
}

/// A raw v1 blueprint row for the frontend conversion leg (D-M6-8).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct BlueprintRow {
    pub id: String,
    pub name: String,
    pub room_id: Option<String>,
    pub blueprint_json: String,
}

/// Ids that landed in v2 — the IPC layer fans these out as the existing
/// coarse DomainEvents after commit (no new event variants, Appendix C).
#[derive(Debug, Clone, Default, Serialize, specta::Type)]
pub struct ImportedIds {
    pub projects: Vec<String>,
    pub rooms: Vec<String>,
    pub agents: Vec<String>,
    pub tasks: Vec<String>,
    pub bindings: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ImportReport {
    pub db_path: String,
    /// True for previews: nothing was written.
    pub dry_run: bool,
    pub tables: Vec<TableReport>,
    /// Row-level warnings (lossy folds, flagged conversions).
    pub warnings: Vec<String>,
    /// v1 tables present but deliberately not imported (master plan §4.4).
    pub not_imported: Vec<String>,
    pub blueprints: Vec<BlueprintRow>,
    pub imported: ImportedIds,
}

/// One planned v2 insert: fixed SQL + bound params (the shared plan unit).
struct Insert {
    sql: &'static str,
    params: Vec<Sql>,
}

struct Planned {
    report: ImportReport,
    plan: Vec<Insert>,
}

#[derive(Default)]
struct TableAcc {
    found: u32,
    inserts: Vec<Insert>,
    skipped: HashMap<String, u32>,
}

impl TableAcc {
    fn skip(&mut self, reason: &str) {
        *self.skipped.entry(reason.to_string()).or_default() += 1;
    }
    fn report(self, table: &str) -> (TableReport, Vec<Insert>) {
        let mut skipped: Vec<SkipCount> = self
            .skipped
            .into_iter()
            .map(|(reason, count)| SkipCount { reason, count })
            .collect();
        skipped.sort_by(|a, b| a.reason.cmp(&b.reason));
        (
            TableReport {
                table: table.into(),
                found: self.found,
                will_import: self.inserts.len() as u32,
                skipped,
            },
            self.inserts,
        )
    }
}

const ALREADY: &str = "already imported";

/// v1 tables deliberately NOT imported (dropped or rebuilt-different per
/// master plan §4.4) — listed in the report when present in the file.
const NOT_IMPORTED: &[&str] = &[
    "placed_props",
    "connections",
    "api_keys",
    "threads",
    "thread_participants",
    "thread_messages",
    "claude_processes",
    "meetings",
    "meeting_participants",
    "meeting_turns",
    "meeting_action_items",
    "standups",
    "standup_entries",
    "pipelines",
    "pipeline_runs",
    "project_agents",
    "notification_rules",
];

/// Preview: the full mapping in memory, nothing written.
pub fn preview(
    store: &Store,
    v1_path: &Path,
    options: &ImportOptions,
) -> anyhow::Result<ImportReport> {
    run(store, v1_path, options, true)
}

/// Apply: the same plan, executed in one v2 transaction.
pub fn apply(
    store: &Store,
    v1_path: &Path,
    options: &ImportOptions,
) -> anyhow::Result<ImportReport> {
    run(store, v1_path, options, false)
}

fn run(
    store: &Store,
    v1_path: &Path,
    options: &ImportOptions,
    dry_run: bool,
) -> anyhow::Result<ImportReport> {
    anyhow::ensure!(v1_path.is_file(), "no v1 database at {}", v1_path.display());
    // Read-only by construction (24.1 "v1 left untouched").
    let v1 = Connection::open_with_flags(
        v1_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;

    let Planned { mut report, plan } = build_plan(store, &v1, options, v1_path)?;
    report.dry_run = dry_run;
    if dry_run {
        return Ok(report);
    }

    // Execute the plan in ONE transaction; skip-if-exists was decided against
    // the v2 snapshot taken by the plan builder just above.
    let mut conn = store.conn.lock().unwrap();
    let tx = conn.transaction()?;
    for insert in plan {
        tx.execute(insert.sql, rusqlite::params_from_iter(insert.params))?;
    }
    tx.commit()?;
    Ok(report)
}

// -- v1 row access helpers (tolerant: v1 used IF NOT EXISTS migrations; old
// installs may lack late columns — every optional column reads through these).

type Row = HashMap<String, Sql>;

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |_| Ok(()),
    )
    .is_ok()
}

fn load_table(conn: &Connection, table: &str) -> anyhow::Result<Vec<Row>> {
    if !table_exists(conn, table) {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map([], |row| {
        let mut map = Row::new();
        for (idx, name) in names.iter().enumerate() {
            map.insert(name.clone(), row.get::<_, Sql>(idx)?);
        }
        Ok(map)
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn s(row: &Row, col: &str) -> Option<String> {
    match row.get(col) {
        Some(Sql::Text(t)) if !t.is_empty() => Some(t.clone()),
        _ => None,
    }
}

fn i(row: &Row, col: &str) -> Option<i64> {
    match row.get(col) {
        Some(Sql::Integer(v)) => Some(*v),
        Some(Sql::Real(v)) => Some(*v as i64),
        Some(Sql::Text(t)) => t.parse().ok(),
        _ => None,
    }
}

fn b(row: &Row, col: &str) -> Option<bool> {
    match row.get(col) {
        Some(Sql::Integer(v)) => Some(*v != 0),
        Some(Sql::Text(t)) => match t.to_ascii_lowercase().as_str() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn f(row: &Row, col: &str) -> Option<f64> {
    match row.get(col) {
        Some(Sql::Real(v)) => Some(*v),
        Some(Sql::Integer(v)) => Some(*v as f64),
        _ => None,
    }
}

/// A session-transcript-shaped UUID (8-4-4-4-12 hex) — the binding filter.
/// Gateway keys (`agent:...`) and other shapes are dropped (counted).
fn is_session_uuid(key: &str) -> bool {
    key.len() == 36
        && key.char_indices().all(|(idx, c)| match idx {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn opt(v: Option<String>) -> Sql {
    v.map(Sql::Text).unwrap_or(Sql::Null)
}

fn existing_ids(conn: &Connection, sql: &str) -> anyhow::Result<HashSet<String>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn load_personas(v1: &Connection) -> anyhow::Result<HashMap<String, Row>> {
    let rows = load_table(v1, "agent_personas")?;
    Ok(rows
        .into_iter()
        .filter_map(|row| s(&row, "agent_id").map(|id| (id, row)))
        .collect())
}

fn load_surfaces(v1: &Connection) -> anyhow::Result<HashMap<String, Vec<serde_json::Value>>> {
    let rows = load_table(v1, "agent_surfaces")?;
    let mut out: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    for row in &rows {
        let Some(agent_id) = s(row, "agent_id") else {
            continue;
        };
        out.entry(agent_id).or_default().push(json!({
            "surface": s(row, "surface"),
            "format_rules": s(row, "format_rules"),
            "enabled": b(row, "enabled").unwrap_or(true),
        }));
    }
    Ok(out)
}

/// The single plan builder both IPC commands share — the D-M6-8 mapping
/// table, one block per row.
#[allow(clippy::too_many_lines)]
fn build_plan(
    store: &Store,
    v1: &Connection,
    options: &ImportOptions,
    v1_path: &Path,
) -> anyhow::Result<Planned> {
    let now = Store::now_ms();
    let mut warnings: Vec<String> = Vec::new();
    let mut tables: Vec<TableReport> = Vec::new();
    let mut plan: Vec<Insert> = Vec::new();
    let mut imported = ImportedIds::default();

    let (
        existing_projects,
        existing_rooms,
        existing_agents,
        existing_tasks,
        existing_events,
        existing_rules,
        existing_bindings,
        existing_templates,
    ) = {
        let conn = store.conn.lock().unwrap();
        (
            existing_ids(&conn, "SELECT id FROM projects")?,
            existing_ids(&conn, "SELECT id FROM rooms")?,
            existing_ids(&conn, "SELECT id FROM agents")?,
            existing_ids(&conn, "SELECT id FROM tasks")?,
            existing_ids(&conn, "SELECT id FROM task_events")?,
            existing_ids(&conn, "SELECT id FROM room_rules")?,
            existing_ids(&conn, "SELECT session_id FROM session_bindings")?,
            existing_ids(&conn, "SELECT id FROM prompt_templates")?,
        )
    };

    // ---- projects ----
    let v1_projects = load_table(v1, "projects")?;
    let mut acc = TableAcc::default();
    // ids that will exist in v2 after this plan (FK folds below)
    let mut v2_projects: HashSet<String> = existing_projects.clone();
    for row in &v1_projects {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_projects.contains(&id) {
            acc.skip(ALREADY);
            continue;
        }
        let folder = s(row, "folder_path").or_else(|| options.folder_overrides.get(&id).cloned());
        let Some(folder_path) = folder else {
            acc.skip("needs_folder (no folder_path; assign one in folder_overrides)");
            continue;
        };
        acc.inserts.push(Insert {
            sql: "INSERT INTO projects (id, name, description, icon, color, folder_path, docs_path, status, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params: vec![
                Sql::Text(id.clone()),
                Sql::Text(s(row, "name").unwrap_or_else(|| "Untitled".into())),
                opt(s(row, "description")),
                opt(s(row, "icon")),
                opt(s(row, "color")),
                Sql::Text(folder_path),
                opt(s(row, "docs_path")),
                Sql::Text(s(row, "status").unwrap_or_else(|| "active".into())),
                Sql::Integer(i(row, "created_at").unwrap_or(now)),
                Sql::Integer(i(row, "updated_at").unwrap_or(now)),
            ],
        });
        v2_projects.insert(id.clone());
        imported.projects.push(id);
    }
    let (rep, ins) = acc.report("projects");
    tables.push(rep);
    plan.extend(ins);

    // ---- rooms ----
    let v1_rooms = load_table(v1, "rooms")?;
    let mut acc = TableAcc::default();
    let mut v2_rooms: HashSet<String> = existing_rooms.clone();
    for row in &v1_rooms {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_rooms.contains(&id) {
            acc.skip(ALREADY);
            v2_rooms.insert(id);
            continue;
        }
        // v2 `rooms.project_id` is nullable (verified): global rooms land
        // with NULL; a project link survives only when that project exists.
        let project_id = match s(row, "project_id") {
            Some(p) if v2_projects.contains(&p) => Some(p),
            Some(_) => {
                warnings.push(format!(
                    "room {id}: linked project not imported — kept as a global room"
                ));
                None
            }
            None => None,
        };
        let mut style = serde_json::Map::new();
        if let Some(x) = s(row, "default_model") {
            style.insert("default_model".into(), json!(x));
        }
        if let Some(x) = f(row, "speed_multiplier") {
            style.insert("speed_multiplier".into(), json!(x));
        }
        if let Some(x) = s(row, "floor_style") {
            style.insert("floor_style".into(), json!(x));
        }
        if let Some(x) = s(row, "wall_style") {
            style.insert("wall_style".into(), json!(x));
        }
        let style_json = (!style.is_empty()).then(|| serde_json::Value::Object(style).to_string());
        acc.inserts.push(Insert {
            sql: "INSERT INTO rooms (id, project_id, name, icon, color, sort_order, is_hq, style_json, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)",
            params: vec![
                Sql::Text(id.clone()),
                opt(project_id),
                Sql::Text(s(row, "name").unwrap_or_else(|| "Room".into())),
                opt(s(row, "icon")),
                opt(s(row, "color")),
                Sql::Integer(i(row, "sort_order").unwrap_or(0)),
                opt(style_json),
                Sql::Integer(i(row, "created_at").unwrap_or(now)),
                Sql::Integer(i(row, "updated_at").unwrap_or(now)),
            ],
        });
        v2_rooms.insert(id.clone());
        imported.rooms.push(id);
    }
    let (rep, ins) = acc.report("rooms");
    tables.push(rep);
    plan.extend(ins);

    // ---- agents (+ personas + surfaces folded into persona_json) ----
    let v1_agents = load_table(v1, "agents")?;
    let personas = load_personas(v1)?;
    let surfaces = load_surfaces(v1)?;
    // session-key → agent-id resolution map (used by tasks/history too)
    let mut session_key_to_agent: HashMap<String, String> = HashMap::new();
    let mut v2_agents: HashSet<String> = existing_agents.clone();
    let mut acc = TableAcc::default();
    let mut dropped_fields_noted = false;
    for row in &v1_agents {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if let Some(key) = s(row, "agent_session_key") {
            session_key_to_agent.insert(key, id.clone());
        }
        if existing_agents.contains(&id) {
            acc.skip(ALREADY);
            continue;
        }
        if !dropped_fields_noted
            && (s(row, "agent_session_key").is_some() || s(row, "default_room_id").is_some())
        {
            warnings.push(
                "agents: v1 fields agent_session_key / default_room_id have no v2 analogue and were dropped"
                    .into(),
            );
            dropped_fields_noted = true;
        }
        let persona = personas.get(&id);
        let custom_instructions = persona.and_then(|p| s(p, "custom_instructions"));
        let mut persona_json = serde_json::Map::new();
        if let Some(p) = persona {
            if let Some(x) = s(p, "preset") {
                persona_json.insert("preset".into(), json!(x));
            }
            let mut sliders = serde_json::Map::new();
            for col in [
                "start_behavior",
                "checkin_frequency",
                "response_detail",
                "approach_style",
            ] {
                if let Some(v) = i(p, col) {
                    sliders.insert(col.into(), json!(v));
                }
            }
            if !sliders.is_empty() {
                persona_json.insert("sliders".into(), serde_json::Value::Object(sliders));
            }
            if let Some(x) = &custom_instructions {
                persona_json.insert("custom_instructions".into(), json!(x));
            }
            if let Some(x) = s(p, "identity_anchor") {
                persona_json.insert("identity_anchor".into(), json!(x));
            }
            if let Some(x) = s(p, "surface_rules") {
                persona_json.insert("surface_rules".into(), json!(x));
            }
        }
        if let Some(rows) = surfaces.get(&id) {
            persona_json.insert("surfaces".into(), json!(rows));
        }
        let persona_json =
            (!persona_json.is_empty()).then(|| serde_json::Value::Object(persona_json).to_string());
        // custom_instructions also → system_prompt (D-M6-8), else v1's own.
        let system_prompt = custom_instructions.or_else(|| s(row, "system_prompt"));
        acc.inserts.push(Insert {
            sql: "INSERT INTO agents (id, name, icon, color, avatar, default_model, project_path, permission_mode, system_prompt, persona_json, is_pinned, auto_spawn, bio, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params: vec![
                Sql::Text(id.clone()),
                Sql::Text(s(row, "name").unwrap_or_else(|| "Agent".into())),
                opt(s(row, "icon")),
                opt(s(row, "color")),
                opt(s(row, "avatar_url")),
                opt(s(row, "default_model")),
                opt(s(row, "project_path")),
                Sql::Text(s(row, "permission_mode").unwrap_or_else(|| "default".into())),
                opt(system_prompt),
                opt(persona_json),
                Sql::Integer(i64::from(b(row, "is_pinned").unwrap_or(false))),
                Sql::Integer(i64::from(b(row, "auto_spawn").unwrap_or(false))),
                opt(s(row, "bio")),
                Sql::Integer(i(row, "created_at").unwrap_or(now)),
                Sql::Integer(i(row, "updated_at").unwrap_or(now)),
            ],
        });
        v2_agents.insert(id.clone());
        imported.agents.push(id);
    }
    let (rep, ins) = acc.report("agents");
    tables.push(rep);
    plan.extend(ins);

    // v1 actor string (a session key, or anything else) → v2 actor
    let resolve_actor = |raw: Option<String>| -> String {
        raw.and_then(|key| {
            session_key_to_agent
                .get(&key)
                .filter(|agent_id| v2_agents.contains(*agent_id))
                .map(|agent_id| format!("agent:{agent_id}"))
        })
        .unwrap_or_else(|| "human".into())
    };

    // ---- tasks ----
    let v1_tasks = load_table(v1, "tasks")?;
    let mut acc = TableAcc::default();
    let mut v2_tasks: HashSet<String> = existing_tasks.clone();
    for row in &v1_tasks {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_tasks.contains(&id) {
            acc.skip(ALREADY);
            v2_tasks.insert(id);
            continue;
        }
        let project_id = match s(row, "project_id") {
            Some(p) if v2_projects.contains(&p) => Some(p),
            Some(_) => {
                acc.skip("project not imported");
                continue;
            }
            None => None,
        };
        let room_id = match s(row, "room_id") {
            Some(r) if v2_rooms.contains(&r) => Some(r),
            Some(_) => {
                warnings.push(format!(
                    "task {id}: room not imported — landed without a room"
                ));
                None
            }
            None => None,
        };
        // assigned_session_key → assignee via the v1 lookup, else NULL (counted)
        let assignee = match s(row, "assigned_session_key") {
            Some(key) => match session_key_to_agent.get(&key) {
                Some(agent_id) if v2_agents.contains(agent_id) => Some(agent_id.clone()),
                _ => {
                    acc.skip("assignee dropped (session key did not resolve to an agent)");
                    None
                }
            },
            None => None,
        };
        let created_by = resolve_actor(s(row, "created_by"));
        acc.inserts.push(Insert {
            sql: "INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, assignee_agent_id, created_by, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params: vec![
                Sql::Text(id.clone()),
                opt(project_id),
                opt(room_id),
                Sql::Text(s(row, "title").unwrap_or_else(|| "Untitled".into())),
                opt(s(row, "description")),
                Sql::Text(s(row, "status").unwrap_or_else(|| "todo".into())),
                Sql::Text(s(row, "priority").unwrap_or_else(|| "medium".into())),
                opt(assignee),
                Sql::Text(created_by),
                Sql::Integer(i(row, "created_at").unwrap_or(now)),
                Sql::Integer(i(row, "updated_at").unwrap_or(now)),
            ],
        });
        v2_tasks.insert(id.clone());
        imported.tasks.push(id);
    }
    let (rep, ins) = acc.report("tasks");
    tables.push(rep);
    plan.extend(ins);

    // ---- project_history → task_events ----
    let v1_history = load_table(v1, "project_history")?;
    let mut acc = TableAcc::default();
    for row in &v1_history {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_events.contains(&id) {
            acc.skip(ALREADY);
            continue;
        }
        // v2 task_events.task_id is NOT NULL: project-level rows are dropped.
        let Some(task_id) = s(row, "task_id") else {
            acc.skip("project-level history (no task_id) — dropped");
            continue;
        };
        if !v2_tasks.contains(&task_id) {
            acc.skip("task not imported");
            continue;
        }
        acc.inserts.push(Insert {
            sql:
                "INSERT INTO task_events (id, task_id, event_type, actor, payload_json, created_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params: vec![
                Sql::Text(id),
                Sql::Text(task_id),
                Sql::Text(s(row, "event_type").unwrap_or_else(|| "imported".into())),
                Sql::Text(resolve_actor(s(row, "actor_session_key"))),
                opt(s(row, "payload_json")),
                Sql::Integer(i(row, "created_at").unwrap_or(now)),
            ],
        });
    }
    let (rep, ins) = acc.report("project_history -> task_events");
    tables.push(rep);
    plan.extend(ins);

    // ---- room_assignment_rules → room_rules ----
    let v1_rules = load_table(v1, "room_assignment_rules")?;
    let mut acc = TableAcc::default();
    for row in &v1_rules {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_rules.contains(&id) {
            acc.skip(ALREADY);
            continue;
        }
        let Some(room_id) = s(row, "room_id").filter(|r| v2_rooms.contains(r)) else {
            acc.skip("room not imported");
            continue;
        };
        let rule_type = match s(row, "rule_type").as_deref() {
            Some("keyword") => "keyword",
            Some("model") => "model",
            Some("label_pattern") => {
                warnings.push(format!(
                    "room rule {id}: v1 label_pattern imported as a keyword rule (review it)"
                ));
                "keyword"
            }
            Some("session_type") => {
                acc.skip("session_type rule — an OpenClaw concept with no v2 analogue");
                continue;
            }
            _ => {
                acc.skip("unknown rule_type");
                continue;
            }
        };
        acc.inserts.push(Insert {
            sql: "INSERT INTO room_rules (id, room_id, rule_type, rule_value, priority)
                  VALUES (?1, ?2, ?3, ?4, ?5)",
            params: vec![
                Sql::Text(id),
                Sql::Text(room_id),
                Sql::Text(rule_type.into()),
                Sql::Text(s(row, "rule_value").unwrap_or_default()),
                Sql::Integer(i(row, "priority").unwrap_or(0)),
            ],
        });
    }
    let (rep, ins) = acc.report("room_assignment_rules -> room_rules");
    tables.push(rep);
    plan.extend(ins);

    // ---- session_display_names + session_room_assignments → session_bindings ----
    let names = load_table(v1, "session_display_names")?;
    let assignments = load_table(v1, "session_room_assignments")?;
    let mut merged: HashMap<String, (Option<String>, Option<String>, i64)> = HashMap::new();
    for row in &names {
        if let Some(key) = s(row, "session_key") {
            let entry = merged.entry(key).or_insert((None, None, now));
            entry.0 = s(row, "display_name");
            entry.2 = i(row, "updated_at").unwrap_or(now);
        }
    }
    for row in &assignments {
        if let Some(key) = s(row, "session_key") {
            let entry = merged.entry(key).or_insert((None, None, now));
            entry.1 = s(row, "room_id");
        }
    }
    let mut acc = TableAcc {
        found: merged.len() as u32,
        ..TableAcc::default()
    };
    let mut entries: Vec<_> = merged.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    for (key, (display_name, room_id, updated_at)) in entries {
        if !is_session_uuid(&key) {
            acc.skip("gateway/non-session key — dropped");
            continue;
        }
        if existing_bindings.contains(&key) {
            acc.skip(ALREADY);
            continue;
        }
        let room_id = room_id.filter(|r| v2_rooms.contains(r));
        acc.inserts.push(Insert {
            sql: "INSERT INTO session_bindings (session_id, agent_id, room_id, display_name, pinned, updated_at)
                  VALUES (?1, NULL, ?2, ?3, 0, ?4)",
            params: vec![
                Sql::Text(key.clone()),
                opt(room_id),
                opt(display_name),
                Sql::Integer(updated_at),
            ],
        });
        imported.bindings.push(key);
    }
    let (rep, ins) = acc.report("session names/rooms -> session_bindings");
    tables.push(rep);
    plan.extend(ins);

    // ---- prompt_templates ----
    let v1_templates = load_table(v1, "prompt_templates")?;
    let mut acc = TableAcc::default();
    for row in &v1_templates {
        acc.found += 1;
        let Some(id) = s(row, "id") else {
            acc.skip("missing id");
            continue;
        };
        if existing_templates.contains(&id) {
            acc.skip(ALREADY);
            continue;
        }
        if b(row, "is_builtin").unwrap_or(false) {
            acc.skip("v1 builtin (v2 ships its own seeds)");
            continue;
        }
        let project_id = match s(row, "project_id") {
            Some(p) if v2_projects.contains(&p) => Some(p),
            Some(_) => {
                warnings.push(format!(
                    "template {id}: linked project not imported — kept as a global template"
                ));
                None
            }
            None => None,
        };
        acc.inserts.push(Insert {
            sql: "INSERT INTO prompt_templates (id, name, template, variables_json, project_id)
                  VALUES (?1, ?2, ?3, ?4, ?5)",
            params: vec![
                Sql::Text(id.clone()),
                Sql::Text(s(row, "name").unwrap_or_else(|| "Template".into())),
                Sql::Text(s(row, "template").unwrap_or_default()),
                opt(s(row, "variables")),
                opt(project_id),
            ],
        });
        imported.templates.push(id);
    }
    let (rep, ins) = acc.report("prompt_templates");
    tables.push(rep);
    plan.extend(ins);

    // ---- custom_blueprints: returned raw for the frontend leg ----
    let v1_blueprints = load_table(v1, "custom_blueprints")?;
    let mut blueprints = Vec::new();
    for row in &v1_blueprints {
        let (Some(id), Some(blueprint_json)) = (s(row, "id"), s(row, "blueprint_json")) else {
            continue;
        };
        blueprints.push(BlueprintRow {
            id,
            name: s(row, "name").unwrap_or_else(|| "Blueprint".into()),
            room_id: s(row, "room_id"),
            blueprint_json,
        });
    }
    tables.push(TableReport {
        table: "custom_blueprints (converted in the import dialog)".into(),
        found: v1_blueprints.len() as u32,
        will_import: blueprints.len() as u32,
        skipped: Vec::new(),
    });

    let not_imported = NOT_IMPORTED
        .iter()
        .filter(|t| table_exists(v1, t))
        .map(|t| t.to_string())
        .collect();

    Ok(Planned {
        report: ImportReport {
            db_path: v1_path.display().to_string(),
            dry_run: true,
            tables,
            warnings,
            not_imported,
            blueprints,
            imported,
        },
        plan,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The checked-in fixture builder (§3.1): a v1 database at schema v25,
    /// or the degraded variant missing late columns (old installs — v1 used
    /// IF NOT EXISTS migrations, so anything can be absent).
    fn build_v1_fixture(path: &Path, degraded: bool) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE projects (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
               status TEXT DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
               folder_path TEXT, docs_path TEXT);
             CREATE TABLE rooms (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT,
               sort_order INTEGER DEFAULT 0, default_model TEXT, speed_multiplier REAL DEFAULT 1.0,
               created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
               project_id TEXT, is_hq BOOLEAN DEFAULT 0);
             CREATE TABLE tasks (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, room_id TEXT, title TEXT NOT NULL,
               description TEXT, status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium',
               assigned_session_key TEXT, created_by TEXT,
               created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE project_history (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_id TEXT, event_type TEXT NOT NULL,
               actor_session_key TEXT, payload_json TEXT, created_at INTEGER NOT NULL);
             CREATE TABLE room_assignment_rules (
               id TEXT PRIMARY KEY, room_id TEXT NOT NULL, rule_type TEXT NOT NULL,
               rule_value TEXT NOT NULL, priority INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
             CREATE TABLE session_display_names (
               session_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE session_room_assignments (
               session_key TEXT PRIMARY KEY, room_id TEXT NOT NULL, assigned_at INTEGER NOT NULL);
             CREATE TABLE custom_blueprints (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, room_id TEXT, blueprint_json TEXT NOT NULL,
               source TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE placed_props (id TEXT PRIMARY KEY, prop_id TEXT NOT NULL);
             CREATE TABLE threads (id TEXT PRIMARY KEY, kind TEXT NOT NULL);
             CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);",
        )
        .unwrap();
        if degraded {
            // pre-v10/v20 installs: agents lack the late columns; personas,
            // surfaces and prompt_templates never existed.
            conn.execute_batch(
                "CREATE TABLE agents (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, avatar_url TEXT, color TEXT,
                   agent_session_key TEXT UNIQUE, default_model TEXT, default_room_id TEXT,
                   sort_order INTEGER DEFAULT 0, is_pinned BOOLEAN DEFAULT FALSE,
                   auto_spawn BOOLEAN DEFAULT TRUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
            )
            .unwrap();
        } else {
            conn.execute_batch(
                "CREATE TABLE agents (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, avatar_url TEXT, color TEXT,
                   agent_session_key TEXT UNIQUE, default_model TEXT, default_room_id TEXT,
                   sort_order INTEGER DEFAULT 0, is_pinned BOOLEAN DEFAULT FALSE,
                   auto_spawn BOOLEAN DEFAULT TRUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                   bio TEXT, source TEXT NOT NULL DEFAULT 'openclaw', project_path TEXT,
                   permission_mode TEXT DEFAULT 'default', current_session_id TEXT, system_prompt TEXT DEFAULT '');
                 CREATE TABLE agent_personas (
                   agent_id TEXT PRIMARY KEY, preset TEXT, start_behavior INTEGER NOT NULL DEFAULT 1,
                   checkin_frequency INTEGER NOT NULL DEFAULT 4, response_detail INTEGER NOT NULL DEFAULT 2,
                   approach_style INTEGER NOT NULL DEFAULT 3, custom_instructions TEXT DEFAULT '',
                   created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
                   identity_anchor TEXT DEFAULT '', surface_rules TEXT DEFAULT '', identity_locked BOOLEAN DEFAULT FALSE);
                 CREATE TABLE agent_surfaces (
                   id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, surface TEXT NOT NULL,
                   format_rules TEXT DEFAULT '', enabled BOOLEAN DEFAULT TRUE,
                   created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
                   UNIQUE(agent_id, surface));
                 CREATE TABLE prompt_templates (
                   id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, template TEXT NOT NULL,
                   variables TEXT DEFAULT '[]', is_builtin BOOLEAN DEFAULT FALSE,
                   created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
            )
            .unwrap();
        }

        // seed rows (ids are what the idempotency contract preserves)
        conn.execute_batch(
            "INSERT INTO projects (id, name, description, folder_path, created_at, updated_at)
               VALUES ('p1', 'Alpha', 'first', '/work/alpha', 1000, 2000);
             INSERT INTO projects (id, name, created_at, updated_at)
               VALUES ('p2', 'Beta', 1100, 2100);
             INSERT INTO rooms (id, name, default_model, speed_multiplier, created_at, updated_at)
               VALUES ('r1', 'Lounge', 'sonnet', 2.0, 1000, 2000);
             INSERT INTO rooms (id, name, project_id, created_at, updated_at)
               VALUES ('r2', 'Lab', 'p1', 1000, 2000);
             INSERT INTO rooms (id, name, project_id, created_at, updated_at)
               VALUES ('r3', 'Orphan', 'p2', 1000, 2000);
             INSERT INTO agents (id, name, icon, avatar_url, agent_session_key, default_model, default_room_id, is_pinned, auto_spawn, created_at, updated_at)
               VALUES ('a1', 'Main', '🤖', 'https://x/a.png', 'agent:main:main', 'opus', 'r1', 1, 1, 1000, 2000);
             INSERT INTO agents (id, name, created_at, updated_at)
               VALUES ('a2', 'Side', 1000, 2000);
             INSERT INTO tasks (id, project_id, room_id, title, status, priority, assigned_session_key, created_by, created_at, updated_at)
               VALUES ('t1', 'p1', 'r2', 'Fix flux', 'in_progress', 'urgent', 'agent:main:main', 'agent:main:main', 1000, 2000);
             INSERT INTO tasks (id, project_id, title, created_by, created_at, updated_at)
               VALUES ('t2', 'p2', 'Beta task', 'user', 1000, 2000);
             INSERT INTO tasks (id, project_id, room_id, title, assigned_session_key, created_by, created_at, updated_at)
               VALUES ('t3', 'p1', 'r1', 'Loose ends', 'agent:ghost:x', 'user', 1000, 2000);
             INSERT INTO project_history (id, project_id, task_id, event_type, actor_session_key, payload_json, created_at)
               VALUES ('h1', 'p1', 't1', 'status_changed', 'agent:main:main', '{\"from\":\"todo\"}', 1500);
             INSERT INTO project_history (id, project_id, event_type, created_at)
               VALUES ('h2', 'p1', 'project_created', 1000);
             INSERT INTO project_history (id, project_id, task_id, event_type, created_at)
               VALUES ('h3', 'p2', 't2', 'created', 1000);
             INSERT INTO room_assignment_rules (id, room_id, rule_type, rule_value, priority, created_at)
               VALUES ('ru1', 'r1', 'keyword', 'fox', 5, 1000);
             INSERT INTO room_assignment_rules (id, room_id, rule_type, rule_value, priority, created_at)
               VALUES ('ru2', 'r1', 'model', 'opus', 0, 1000);
             INSERT INTO room_assignment_rules (id, room_id, rule_type, rule_value, priority, created_at)
               VALUES ('ru3', 'r1', 'label_pattern', 'bug-*', 0, 1000);
             INSERT INTO room_assignment_rules (id, room_id, rule_type, rule_value, priority, created_at)
               VALUES ('ru4', 'r1', 'session_type', 'openclaw', 0, 1000);
             INSERT INTO session_display_names (session_key, display_name, updated_at)
               VALUES ('0f9e8d7c-1a2b-3c4d-5e6f-708192a3b4c5', 'Scout', 3000);
             INSERT INTO session_display_names (session_key, display_name, updated_at)
               VALUES ('agent:main:main', 'Gateway Main', 3000);
             INSERT INTO session_room_assignments (session_key, room_id, assigned_at)
               VALUES ('0f9e8d7c-1a2b-3c4d-5e6f-708192a3b4c5', 'r1', 3000);
             INSERT INTO session_room_assignments (session_key, room_id, assigned_at)
               VALUES ('11111111-2222-3333-4444-555555555555', 'r2', 3000);
             INSERT INTO custom_blueprints (id, name, room_id, blueprint_json, created_at, updated_at)
               VALUES ('bp1', 'Cozy corner', 'r1', '{\"props\":[]}', 1000, 2000);
             INSERT INTO placed_props (id, prop_id) VALUES ('pp1', 'plant');
             INSERT INTO threads (id, kind) VALUES ('th1', 'group');",
        )
        .unwrap();
        if !degraded {
            conn.execute_batch(
                "INSERT INTO agent_personas (agent_id, preset, start_behavior, checkin_frequency, response_detail, approach_style, custom_instructions, identity_anchor)
                   VALUES ('a1', 'builder', 2, 3, 1, 4, 'Be terse.', 'I am Main.');
                 INSERT INTO agent_surfaces (agent_id, surface, format_rules, enabled)
                   VALUES ('a1', 'discord', 'short lines', 1);
                 INSERT INTO agent_surfaces (agent_id, surface, format_rules, enabled)
                   VALUES ('a1', 'board', '', 0);
                 INSERT INTO prompt_templates (id, project_id, name, template, variables, is_builtin, created_at, updated_at)
                   VALUES ('pt1', NULL, 'Builtin', 'b', '[]', 1, 1000, 2000);
                 INSERT INTO prompt_templates (id, project_id, name, template, variables, is_builtin, created_at, updated_at)
                   VALUES ('pt2', 'p1', 'Review', 'Review {{name}}', '[{\"name\":\"name\"}]', 0, 1000, 2000);",
            )
            .unwrap();
        }
    }

    fn fixture(degraded: bool) -> (tempfile::TempDir, std::path::PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("crewhub-v1.db");
        build_v1_fixture(&path, degraded);
        (dir, path, Store::open_in_memory().unwrap())
    }

    fn table<'a>(report: &'a ImportReport, prefix: &str) -> &'a TableReport {
        report
            .tables
            .iter()
            .find(|t| t.table.starts_with(prefix))
            .unwrap_or_else(|| panic!("no table report starting with {prefix}"))
    }

    fn skip_count(t: &TableReport, needle: &str) -> u32 {
        t.skipped
            .iter()
            .filter(|s| s.reason.contains(needle))
            .map(|s| s.count)
            .sum()
    }

    #[test]
    fn preview_counts_the_full_mapping_and_writes_nothing() {
        let (_dir, path, store) = fixture(false);
        let report = preview(&store, &path, &ImportOptions::default()).unwrap();
        assert!(report.dry_run);

        let projects = table(&report, "projects");
        assert_eq!((projects.found, projects.will_import), (2, 1));
        assert_eq!(skip_count(projects, "needs_folder"), 1);

        let rooms = table(&report, "rooms");
        assert_eq!((rooms.found, rooms.will_import), (3, 3));

        let tasks = table(&report, "tasks");
        assert_eq!((tasks.found, tasks.will_import), (3, 2)); // t2's project skipped
        assert_eq!(skip_count(tasks, "project not imported"), 1);
        assert_eq!(skip_count(tasks, "assignee dropped"), 1); // t3's ghost key

        let events = table(&report, "project_history");
        assert_eq!((events.found, events.will_import), (3, 1));
        assert_eq!(skip_count(events, "no task_id"), 1);
        assert_eq!(skip_count(events, "task not imported"), 1);

        let rules = table(&report, "room_assignment_rules");
        assert_eq!((rules.found, rules.will_import), (4, 3));
        assert_eq!(skip_count(rules, "session_type"), 1);
        assert!(report.warnings.iter().any(|w| w.contains("label_pattern")));

        let bindings = table(&report, "session names");
        assert_eq!((bindings.found, bindings.will_import), (3, 2));
        assert_eq!(skip_count(bindings, "gateway"), 1);

        let templates = table(&report, "prompt_templates");
        assert_eq!((templates.found, templates.will_import), (2, 1));
        assert_eq!(skip_count(templates, "builtin"), 1);

        assert_eq!(report.blueprints.len(), 1);
        assert!(report.not_imported.contains(&"placed_props".to_string()));
        assert!(report.not_imported.contains(&"threads".to_string()));

        // dry run wrote NOTHING
        assert!(store.list_projects().unwrap().is_empty());
        assert!(store.list_agents().unwrap().is_empty());
        assert!(store.list_tasks().unwrap().is_empty());
    }

    #[test]
    fn apply_lands_everything_via_normal_store_reads_with_preserved_ids() {
        let (_dir, path, store) = fixture(false);
        let mut options = ImportOptions::default();
        options
            .folder_overrides
            .insert("p2".into(), "/work/beta".into());
        let report = apply(&store, &path, &options).unwrap();
        assert!(!report.dry_run);

        // projects: both, ids preserved, override applied
        let projects = store.list_projects().unwrap();
        let ids: HashSet<_> = projects.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, HashSet::from(["p1", "p2"]));
        let beta = projects.iter().find(|p| p.id == "p2").unwrap();
        assert_eq!(beta.folder_path, "/work/beta");

        // rooms: style fold + project links (r3 -> p2 now imported)
        let rooms = store.list_rooms().unwrap();
        assert_eq!(rooms.len(), 3);
        let lounge = rooms.iter().find(|r| r.id == "r1").unwrap();
        assert_eq!(lounge.project_id, None);
        assert!(!lounge.is_hq);
        let style: serde_json::Value =
            serde_json::from_str(lounge.style_json.as_deref().unwrap()).unwrap();
        assert_eq!(style["default_model"], "sonnet");
        assert_eq!(style["speed_multiplier"], 2.0);
        let orphan = rooms.iter().find(|r| r.id == "r3").unwrap();
        assert_eq!(orphan.project_id.as_deref(), Some("p2"));

        // agents: persona + surfaces folded, avatar mapped, prompt fold
        let agents = store.list_agents().unwrap();
        assert_eq!(agents.len(), 2);
        let main = agents.iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(main.avatar.as_deref(), Some("https://x/a.png"));
        assert_eq!(main.system_prompt.as_deref(), Some("Be terse."));
        assert!(main.is_pinned);
        let persona: serde_json::Value =
            serde_json::from_str(main.persona_json.as_deref().unwrap()).unwrap();
        assert_eq!(persona["preset"], "builder");
        assert_eq!(persona["sliders"]["checkin_frequency"], 3);
        assert_eq!(persona["surfaces"].as_array().unwrap().len(), 2);

        // tasks: enums verbatim incl. urgent; session-key resolution
        let tasks = store.list_tasks().unwrap();
        assert_eq!(tasks.len(), 3); // t2 imports too now that p2 has a folder
        let t1 = tasks.iter().find(|t| t.id == "t1").unwrap();
        assert_eq!(t1.priority, "urgent");
        assert_eq!(t1.assignee_agent_id.as_deref(), Some("a1"));
        assert_eq!(t1.created_by, "agent:a1");
        let t3 = tasks.iter().find(|t| t.id == "t3").unwrap();
        assert_eq!(t3.assignee_agent_id, None);
        assert_eq!(t3.created_by, "human");

        // history -> task_events with actor resolution
        let events = store.list_task_events("t1").unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "h1");
        assert_eq!(events[0].actor, "agent:a1");

        // room rules: label_pattern landed as keyword
        let rules = store.list_room_rules(Some("r1")).unwrap();
        assert_eq!(rules.len(), 3);
        let ru3 = rules.iter().find(|r| r.id == "ru3").unwrap();
        assert_eq!(ru3.rule_type, "keyword");
        assert_eq!(ru3.rule_value, "bug-*");

        // bindings: merged name+room; UUID filter applied
        let bindings = store.list_session_bindings().unwrap();
        assert_eq!(bindings.len(), 2);
        let scout = bindings
            .iter()
            .find(|b| b.session_id == "0f9e8d7c-1a2b-3c4d-5e6f-708192a3b4c5")
            .unwrap();
        assert_eq!(scout.display_name.as_deref(), Some("Scout"));
        assert_eq!(scout.room_id.as_deref(), Some("r1"));

        // templates: builtin skipped, variables -> variables_json
        let templates = store.list_prompt_templates(Some("p1")).unwrap();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].id, "pt2");
        assert!(templates[0]
            .variables_json
            .as_deref()
            .unwrap()
            .contains("name"));

        // blueprints raw for the frontend leg
        assert_eq!(report.blueprints[0].room_id.as_deref(), Some("r1"));
        assert_eq!(report.blueprints[0].blueprint_json, r#"{"props":[]}"#);

        // imported id lists drive the coarse DomainEvents
        assert_eq!(report.imported.projects.len(), 2);
        assert_eq!(report.imported.agents.len(), 2);
        assert_eq!(report.imported.tasks.len(), 3);
    }

    /// Idempotency (§3.1): import twice — the second report is all-skipped
    /// and row counts are unchanged.
    #[test]
    fn double_import_is_idempotent() {
        let (_dir, path, store) = fixture(false);
        let mut options = ImportOptions::default();
        options
            .folder_overrides
            .insert("p2".into(), "/work/beta".into());
        apply(&store, &path, &options).unwrap();
        let counts = |s: &Store| {
            (
                s.list_projects().unwrap().len(),
                s.list_rooms().unwrap().len(),
                s.list_agents().unwrap().len(),
                s.list_tasks().unwrap().len(),
                s.list_session_bindings().unwrap().len(),
            )
        };
        let first = counts(&store);

        let second = apply(&store, &path, &options).unwrap();
        assert_eq!(counts(&store), first, "second run must not change rows");
        for t in &second.tables {
            if t.table.starts_with("custom_blueprints") {
                continue; // frontend leg: always returned
            }
            assert_eq!(t.will_import, 0, "{}: must be all-skipped", t.table);
            if t.found > 0 {
                assert!(
                    skip_count(t, ALREADY) > 0 || t.skipped.iter().any(|s| s.count > 0),
                    "{}: skips must be reported",
                    t.table
                );
            }
        }
        assert!(second.imported.projects.is_empty());
    }

    /// Read-only (§3.1): the v1 file is byte-identical after an apply.
    #[test]
    fn v1_file_bytes_are_untouched() {
        let (_dir, path, store) = fixture(false);
        let before = std::fs::read(&path).unwrap();
        apply(&store, &path, &ImportOptions::default()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }

    /// Degraded-schema variant (§3.1): late columns/tables absent — imports
    /// with defaults instead of erroring.
    #[test]
    fn degraded_schema_imports_with_defaults() {
        let (_dir, path, store) = fixture(true);
        let report = apply(&store, &path, &ImportOptions::default()).unwrap();
        let agents = store.list_agents().unwrap();
        assert_eq!(agents.len(), 2);
        let main = agents.iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(main.permission_mode, "default");
        assert_eq!(main.persona_json, None);
        assert_eq!(main.system_prompt, None);
        // prompt_templates table absent -> empty report row, no error
        let templates = table(&report, "prompt_templates");
        assert_eq!((templates.found, templates.will_import), (0, 0));
    }

    #[test]
    fn missing_db_is_a_readable_error() {
        let store = Store::open_in_memory().unwrap();
        let err = preview(
            &store,
            Path::new("/nope/crewhub.db"),
            &ImportOptions::default(),
        )
        .unwrap_err();
        assert!(err.to_string().contains("no v1 database"), "got: {err}");
    }

    #[test]
    fn session_uuid_filter_shapes() {
        assert!(is_session_uuid("0f9e8d7c-1a2b-3c4d-5e6f-708192a3b4c5"));
        assert!(is_session_uuid("ABCDEF01-2345-6789-abcd-ef0123456789"));
        assert!(!is_session_uuid("agent:main:main"));
        assert!(!is_session_uuid("0f9e8d7c1a2b3c4d5e6f708192a3b4c5"));
        assert!(!is_session_uuid("zf9e8d7c-1a2b-3c4d-5e6f-708192a3b4c5"));
    }
}
