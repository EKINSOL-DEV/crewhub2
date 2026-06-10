CREATE TABLE agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT, avatar TEXT,
  default_model TEXT, project_path TEXT, permission_mode TEXT NOT NULL DEFAULT 'default',
  system_prompt TEXT, persona_json TEXT, is_pinned INTEGER NOT NULL DEFAULT 0,
  auto_spawn INTEGER NOT NULL DEFAULT 0, bio TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
  folder_path TEXT NOT NULL, docs_path TEXT, status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE rooms (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, icon TEXT, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  is_hq INTEGER NOT NULL DEFAULT 0, style_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE room_rules (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword','model','path_pattern','origin')),
  rule_value TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session_bindings (
  session_id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  display_name TEXT, pinned INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done','blocked')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL DEFAULT 'human',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, actor TEXT NOT NULL, payload_json TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE meetings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, goal TEXT, state TEXT NOT NULL,
  room_id TEXT, project_id TEXT, config_json TEXT, output_md TEXT, output_path TEXT,
  current_round INTEGER, current_turn INTEGER,
  started_at INTEGER, completed_at INTEGER, cancelled_at INTEGER, error_message TEXT
);
CREATE TABLE meeting_turns (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  round_num INTEGER NOT NULL, turn_index INTEGER NOT NULL, agent_id TEXT NOT NULL,
  session_id TEXT, transcript_offset INTEGER, started_at INTEGER, completed_at INTEGER
);
CREATE TABLE meeting_action_items (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL, assignee_agent_id TEXT, priority TEXT, status TEXT NOT NULL DEFAULT 'pending',
  task_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE standups (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE standup_entries (
  id TEXT PRIMARY KEY, standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL, yesterday TEXT, today TEXT, blockers TEXT, submitted_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('scheduled','manual','pipeline_step')),
  schedule_cron TEXT, spec_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at INTEGER
);
CREATE TABLE run_results (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  session_id TEXT, status TEXT NOT NULL, summary TEXT, started_at INTEGER, finished_at INTEGER
);
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, template TEXT NOT NULL,
  variables_json TEXT, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE notification_rules (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('agent','project','global')),
  scope_id TEXT, trigger TEXT NOT NULL, config_json TEXT, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL );

CREATE INDEX idx_tasks_project ON tasks(project_id, status);
CREATE INDEX idx_tasks_room ON tasks(room_id, status);
CREATE INDEX idx_task_events_task ON task_events(task_id, created_at);
CREATE INDEX idx_rooms_project ON rooms(project_id, sort_order);
