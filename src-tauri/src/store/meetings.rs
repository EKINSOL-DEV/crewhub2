//! Meetings persistence (Epic 16, D-M4-2): the meeting engine writes state
//! BEFORE acting, so every helper here is a single small transition the
//! orchestrator can persist-then-act on. Turn content is NEVER copied into
//! the DB — `meeting_turns.transcript_offset` stores the item-sequence offset
//! at turn start; content is read back through the provider on demand.

use super::Store;
use serde::{Deserialize, Serialize};

/// Valid meeting states (D-M4-2 state machine).
pub const MEETING_STATES: &[&str] = &[
    "gathering",
    "round",
    "synthesis",
    "complete",
    "cancelled",
    "error",
];

/// Non-terminal states the boot recovery scan resumes.
pub const NON_TERMINAL_STATES: &[&str] = &["gathering", "round", "synthesis"];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub goal: Option<String>,
    pub state: String,
    pub room_id: Option<String>,
    pub project_id: Option<String>,
    pub config_json: Option<String>,
    pub output_md: Option<String>,
    pub output_path: Option<String>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub current_round: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub current_turn: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub started_at: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub completed_at: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub cancelled_at: Option<i64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewMeeting {
    pub title: String,
    pub goal: Option<String>,
    pub room_id: Option<String>,
    pub project_id: Option<String>,
    /// Meeting config (participants, rounds, models, timeouts) as JSON —
    /// shape owned by `orchestrator::meeting::MeetingConfig`.
    pub config_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct MeetingTurn {
    pub id: String,
    pub meeting_id: String,
    #[specta(type = specta_typescript::Number)]
    pub round_num: i64,
    #[specta(type = specta_typescript::Number)]
    pub turn_index: i64,
    pub agent_id: String,
    pub session_id: Option<String>,
    /// Item-sequence offset in the participant's transcript at turn start.
    #[specta(type = Option<specta_typescript::Number>)]
    pub transcript_offset: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub started_at: Option<i64>,
    /// NULL + meeting moved past it = the turn was skipped (💤).
    #[specta(type = Option<specta_typescript::Number>)]
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct ActionItem {
    pub id: String,
    pub meeting_id: String,
    pub text: String,
    pub assignee_agent_id: Option<String>,
    pub priority: Option<String>,
    pub status: String,
    pub task_id: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub sort_order: i64,
    #[specta(type = specta_typescript::Number)]
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewActionItem {
    pub text: String,
    pub assignee_agent_id: Option<String>,
    pub priority: Option<String>,
}

fn row_to_meeting(r: &rusqlite::Row) -> rusqlite::Result<Meeting> {
    Ok(Meeting {
        id: r.get("id")?,
        title: r.get("title")?,
        goal: r.get("goal")?,
        state: r.get("state")?,
        room_id: r.get("room_id")?,
        project_id: r.get("project_id")?,
        config_json: r.get("config_json")?,
        output_md: r.get("output_md")?,
        output_path: r.get("output_path")?,
        current_round: r.get("current_round")?,
        current_turn: r.get("current_turn")?,
        started_at: r.get("started_at")?,
        completed_at: r.get("completed_at")?,
        cancelled_at: r.get("cancelled_at")?,
        error_message: r.get("error_message")?,
    })
}

fn row_to_turn(r: &rusqlite::Row) -> rusqlite::Result<MeetingTurn> {
    Ok(MeetingTurn {
        id: r.get("id")?,
        meeting_id: r.get("meeting_id")?,
        round_num: r.get("round_num")?,
        turn_index: r.get("turn_index")?,
        agent_id: r.get("agent_id")?,
        session_id: r.get("session_id")?,
        transcript_offset: r.get("transcript_offset")?,
        started_at: r.get("started_at")?,
        completed_at: r.get("completed_at")?,
    })
}

fn row_to_item(r: &rusqlite::Row) -> rusqlite::Result<ActionItem> {
    Ok(ActionItem {
        id: r.get("id")?,
        meeting_id: r.get("meeting_id")?,
        text: r.get("text")?,
        assignee_agent_id: r.get("assignee_agent_id")?,
        priority: r.get("priority")?,
        status: r.get("status")?,
        task_id: r.get("task_id")?,
        sort_order: r.get("sort_order")?,
        created_at: r.get("created_at")?,
    })
}

impl Store {
    pub fn create_meeting(&self, new: NewMeeting) -> anyhow::Result<Meeting> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Self::now_ms();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO meetings (id, title, goal, state, room_id, project_id, config_json, started_at)
                 VALUES (?1, ?2, ?3, 'gathering', ?4, ?5, ?6, ?7)",
                rusqlite::params![id, new.title, new.goal, new.room_id, new.project_id, new.config_json, now],
            )?;
        }
        Ok(self.get_meeting(&id)?.expect("just inserted"))
    }

    pub fn get_meeting(&self, id: &str) -> anyhow::Result<Option<Meeting>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM meetings WHERE id=?1")?;
        match stmt.query_row([id], row_to_meeting) {
            Ok(m) => Ok(Some(m)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_meetings(&self, project_id: Option<&str>) -> anyhow::Result<Vec<Meeting>> {
        let conn = self.conn.lock().unwrap();
        match project_id {
            Some(p) => {
                let mut stmt = conn.prepare(
                    "SELECT * FROM meetings WHERE project_id=?1 ORDER BY started_at DESC",
                )?;
                let rows = stmt.query_map([p], row_to_meeting)?;
                Ok(rows.collect::<Result<_, _>>()?)
            }
            None => {
                let mut stmt = conn.prepare("SELECT * FROM meetings ORDER BY started_at DESC")?;
                let rows = stmt.query_map([], row_to_meeting)?;
                Ok(rows.collect::<Result<_, _>>()?)
            }
        }
    }

    /// Meetings the boot recovery scan must resume (D-M4-2).
    pub fn list_non_terminal_meetings(&self) -> anyhow::Result<Vec<Meeting>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM meetings WHERE state IN ('gathering','round','synthesis')
             ORDER BY started_at ASC",
        )?;
        let rows = stmt.query_map([], row_to_meeting)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Persist the engine's position BEFORE acting on it (the recovery invariant).
    pub fn set_meeting_position(
        &self,
        id: &str,
        state: &str,
        current_round: Option<i64>,
        current_turn: Option<i64>,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(MEETING_STATES.contains(&state), "invalid state: {state}");
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meetings SET state=?2, current_round=?3, current_turn=?4 WHERE id=?1",
            rusqlite::params![id, state, current_round, current_turn],
        )?;
        anyhow::ensure!(n == 1, "meeting not found: {id}");
        Ok(())
    }

    pub fn complete_meeting(&self, id: &str, output_md: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meetings SET state='complete', output_md=?2, completed_at=?3 WHERE id=?1",
            rusqlite::params![id, output_md, Self::now_ms()],
        )?;
        anyhow::ensure!(n == 1, "meeting not found: {id}");
        Ok(())
    }

    pub fn cancel_meeting(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meetings SET state='cancelled', cancelled_at=?2 WHERE id=?1",
            rusqlite::params![id, Self::now_ms()],
        )?;
        anyhow::ensure!(n == 1, "meeting not found: {id}");
        Ok(())
    }

    pub fn fail_meeting(&self, id: &str, error: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meetings SET state='error', error_message=?2 WHERE id=?1",
            rusqlite::params![id, error],
        )?;
        anyhow::ensure!(n == 1, "meeting not found: {id}");
        Ok(())
    }

    // ---- turns ----

    /// Insert the turn row at turn START (persist-then-act). Idempotent per
    /// (meeting, round, turn): a resumed engine reuses the existing row.
    #[allow(clippy::too_many_arguments)]
    pub fn start_meeting_turn(
        &self,
        meeting_id: &str,
        round_num: i64,
        turn_index: i64,
        agent_id: &str,
        session_id: Option<&str>,
        transcript_offset: Option<i64>,
    ) -> anyhow::Result<MeetingTurn> {
        if let Some(existing) = self.find_meeting_turn(meeting_id, round_num, turn_index)? {
            // resume path: refresh session/offset if they were unknown before
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE meeting_turns SET session_id=COALESCE(?2, session_id),
                 transcript_offset=COALESCE(?3, transcript_offset) WHERE id=?1",
                rusqlite::params![existing.id, session_id, transcript_offset],
            )?;
            drop(conn);
            return Ok(self
                .find_meeting_turn(meeting_id, round_num, turn_index)?
                .expect("just updated"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let now = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meeting_turns (id, meeting_id, round_num, turn_index, agent_id, session_id, transcript_offset, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, meeting_id, round_num, turn_index, agent_id, session_id, transcript_offset, now],
        )?;
        drop(conn);
        Ok(self
            .find_meeting_turn(meeting_id, round_num, turn_index)?
            .expect("just inserted"))
    }

    pub fn find_meeting_turn(
        &self,
        meeting_id: &str,
        round_num: i64,
        turn_index: i64,
    ) -> anyhow::Result<Option<MeetingTurn>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM meeting_turns WHERE meeting_id=?1 AND round_num=?2 AND turn_index=?3",
        )?;
        match stmt.query_row(
            rusqlite::params![meeting_id, round_num, turn_index],
            row_to_turn,
        ) {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Force-update a turn's session/offset (a respawned participant after an
    /// app restart gets a fresh session id; the row must follow).
    pub fn set_meeting_turn_session(
        &self,
        turn_id: &str,
        session_id: &str,
        transcript_offset: i64,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meeting_turns SET session_id=?2, transcript_offset=?3 WHERE id=?1",
            rusqlite::params![turn_id, session_id, transcript_offset],
        )?;
        anyhow::ensure!(n == 1, "turn not found: {turn_id}");
        Ok(())
    }

    /// Mark a turn done. Skipped turns never get this call — `completed_at`
    /// stays NULL and the UI derives 💤 from the meeting position.
    pub fn finish_meeting_turn(&self, turn_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meeting_turns SET completed_at=?2 WHERE id=?1",
            rusqlite::params![turn_id, Self::now_ms()],
        )?;
        anyhow::ensure!(n == 1, "turn not found: {turn_id}");
        Ok(())
    }

    pub fn list_meeting_turns(&self, meeting_id: &str) -> anyhow::Result<Vec<MeetingTurn>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM meeting_turns WHERE meeting_id=?1 ORDER BY round_num, turn_index",
        )?;
        let rows = stmt.query_map([meeting_id], row_to_turn)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    // ---- action items ----

    pub fn add_action_items(
        &self,
        meeting_id: &str,
        items: &[NewActionItem],
    ) -> anyhow::Result<Vec<ActionItem>> {
        let now = Self::now_ms();
        {
            let conn = self.conn.lock().unwrap();
            for (i, item) in items.iter().enumerate() {
                conn.execute(
                    "INSERT INTO meeting_action_items (id, meeting_id, text, assignee_agent_id, priority, status, sort_order, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7)",
                    rusqlite::params![
                        uuid::Uuid::new_v4().to_string(),
                        meeting_id,
                        item.text,
                        item.assignee_agent_id,
                        item.priority,
                        i as i64,
                        now
                    ],
                )?;
            }
        }
        self.list_action_items(meeting_id)
    }

    pub fn list_action_items(&self, meeting_id: &str) -> anyhow::Result<Vec<ActionItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM meeting_action_items WHERE meeting_id=?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([meeting_id], row_to_item)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn get_action_item(&self, id: &str) -> anyhow::Result<Option<ActionItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM meeting_action_items WHERE id=?1")?;
        match stmt.query_row([id], row_to_item) {
            Ok(i) => Ok(Some(i)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Backfill the created task id after convert-to-task (16.3).
    pub fn set_action_item_task(&self, item_id: &str, task_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE meeting_action_items SET task_id=?2, status='converted' WHERE id=?1",
            rusqlite::params![item_id, task_id],
        )?;
        anyhow::ensure!(n == 1, "action item not found: {item_id}");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_meeting(title: &str) -> NewMeeting {
        NewMeeting {
            title: title.into(),
            goal: Some("decide".into()),
            room_id: None,
            project_id: None,
            config_json: Some(r#"{"rounds":2}"#.into()),
        }
    }

    #[test]
    fn create_starts_in_gathering_with_started_at() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("Sprint planning")).unwrap();
        assert_eq!(m.state, "gathering");
        assert!(m.started_at.is_some());
        assert_eq!(s.get_meeting(&m.id).unwrap(), Some(m));
    }

    #[test]
    fn list_filters_by_project() {
        let s = Store::open_in_memory().unwrap();
        s.create_meeting(new_meeting("global")).unwrap();
        let mut withp = new_meeting("scoped");
        withp.project_id = None;
        s.create_meeting(withp).unwrap();
        assert_eq!(s.list_meetings(None).unwrap().len(), 2);
        assert_eq!(s.list_meetings(Some("nope")).unwrap().len(), 0);
    }

    #[test]
    fn position_updates_and_boot_scan() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("m")).unwrap();
        s.set_meeting_position(&m.id, "round", Some(1), Some(2))
            .unwrap();
        let m = s.get_meeting(&m.id).unwrap().unwrap();
        assert_eq!(
            (m.state.as_str(), m.current_round, m.current_turn),
            ("round", Some(1), Some(2))
        );
        assert_eq!(s.list_non_terminal_meetings().unwrap().len(), 1);
        s.complete_meeting(&m.id, "## Summary").unwrap();
        assert!(s.list_non_terminal_meetings().unwrap().is_empty());
        let m = s.get_meeting(&m.id).unwrap().unwrap();
        assert_eq!(m.output_md.as_deref(), Some("## Summary"));
        assert!(m.completed_at.is_some());
    }

    #[test]
    fn invalid_state_rejected() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("m")).unwrap();
        assert!(s
            .set_meeting_position(&m.id, "parallel", None, None)
            .is_err());
    }

    #[test]
    fn cancel_and_error_are_terminal() {
        let s = Store::open_in_memory().unwrap();
        let a = s.create_meeting(new_meeting("a")).unwrap();
        let b = s.create_meeting(new_meeting("b")).unwrap();
        s.cancel_meeting(&a.id).unwrap();
        s.fail_meeting(&b.id, "boom").unwrap();
        assert!(s
            .get_meeting(&a.id)
            .unwrap()
            .unwrap()
            .cancelled_at
            .is_some());
        assert_eq!(
            s.get_meeting(&b.id)
                .unwrap()
                .unwrap()
                .error_message
                .as_deref(),
            Some("boom")
        );
        assert!(s.list_non_terminal_meetings().unwrap().is_empty());
    }

    #[test]
    fn turn_start_is_idempotent_for_resume() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("m")).unwrap();
        let t1 = s
            .start_meeting_turn(&m.id, 0, 0, "agent-1", None, None)
            .unwrap();
        // resume: same position, now with a session + offset
        let t2 = s
            .start_meeting_turn(&m.id, 0, 0, "agent-1", Some("sess-9"), Some(4))
            .unwrap();
        assert_eq!(t1.id, t2.id, "resume must reuse the persisted row");
        assert_eq!(t2.session_id.as_deref(), Some("sess-9"));
        assert_eq!(t2.transcript_offset, Some(4));
        assert_eq!(s.list_meeting_turns(&m.id).unwrap().len(), 1);
    }

    #[test]
    fn finish_turn_sets_completed_at_only_for_done_turns() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("m")).unwrap();
        let done = s
            .start_meeting_turn(&m.id, 0, 0, "a1", Some("s1"), Some(0))
            .unwrap();
        let skipped = s
            .start_meeting_turn(&m.id, 0, 1, "a2", Some("s2"), Some(0))
            .unwrap();
        s.finish_meeting_turn(&done.id).unwrap();
        let turns = s.list_meeting_turns(&m.id).unwrap();
        assert!(turns[0].completed_at.is_some());
        assert!(turns[1].completed_at.is_none(), "skipped stays NULL");
        assert_eq!(skipped.completed_at, None);
    }

    #[test]
    fn action_items_roundtrip_and_task_backfill() {
        let s = Store::open_in_memory().unwrap();
        let m = s.create_meeting(new_meeting("m")).unwrap();
        let items = s
            .add_action_items(
                &m.id,
                &[
                    NewActionItem {
                        text: "Ship it".into(),
                        assignee_agent_id: None,
                        priority: Some("high".into()),
                    },
                    NewActionItem {
                        text: "Write docs".into(),
                        assignee_agent_id: Some("agent-1".into()),
                        priority: None,
                    },
                ],
            )
            .unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].sort_order, 0);
        assert_eq!(items[1].sort_order, 1);
        assert_eq!(items[0].status, "pending");
        s.set_action_item_task(&items[0].id, "task-77").unwrap();
        let again = s.get_action_item(&items[0].id).unwrap().unwrap();
        assert_eq!(again.task_id.as_deref(), Some("task-77"));
        assert_eq!(again.status, "converted");
    }
}
