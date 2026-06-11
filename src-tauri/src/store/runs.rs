//! Runs + run_results persistence (Epic 17, D-M4-5). The `runs` table is the
//! scheduler's single source of truth; `spec_json` is a tagged union
//! (`prompt` | `sequence` | `standup`) validated by `orchestrator::dispatch`
//! at write time and parsed tolerantly at read time.

use super::Store;
use serde::{Deserialize, Serialize};

/// Valid run kinds (mirrors the CHECK constraint in migration 001).
pub const RUN_KINDS: &[&str] = &["scheduled", "manual", "pipeline_step"];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Run {
    pub id: String,
    pub kind: String,
    pub schedule_cron: Option<String>,
    pub spec_json: String,
    pub enabled: bool,
    #[specta(type = Option<specta_typescript::Number>)]
    pub last_run_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewRun {
    pub kind: String,
    pub schedule_cron: Option<String>,
    pub spec_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct RunResult {
    pub id: String,
    pub run_id: String,
    pub session_id: Option<String>,
    pub status: String,
    pub summary: Option<String>,
    /// Position within a sequence (migration 003); NULL for simple runs.
    #[specta(type = Option<specta_typescript::Number>)]
    pub step_index: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub started_at: Option<i64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct NewRunResult<'a> {
    pub run_id: &'a str,
    pub session_id: Option<&'a str>,
    pub status: &'a str,
    pub summary: Option<&'a str>,
    pub step_index: Option<i64>,
    pub started_at: i64,
    pub finished_at: i64,
}

fn row_to_run(r: &rusqlite::Row) -> rusqlite::Result<Run> {
    Ok(Run {
        id: r.get("id")?,
        kind: r.get("kind")?,
        schedule_cron: r.get("schedule_cron")?,
        spec_json: r.get("spec_json")?,
        enabled: r.get::<_, i64>("enabled")? != 0,
        last_run_at: r.get("last_run_at")?,
    })
}

fn row_to_result(r: &rusqlite::Row) -> rusqlite::Result<RunResult> {
    Ok(RunResult {
        id: r.get("id")?,
        run_id: r.get("run_id")?,
        session_id: r.get("session_id")?,
        status: r.get("status")?,
        summary: r.get("summary")?,
        step_index: r.get("step_index")?,
        started_at: r.get("started_at")?,
        finished_at: r.get("finished_at")?,
    })
}

impl Store {
    pub fn create_run(&self, new: NewRun) -> anyhow::Result<Run> {
        anyhow::ensure!(
            RUN_KINDS.contains(&new.kind.as_str()),
            "invalid run kind: {}",
            new.kind
        );
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO runs (id, kind, schedule_cron, spec_json) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, new.kind, new.schedule_cron, new.spec_json],
            )?;
        }
        Ok(self.get_run(&id)?.expect("just inserted"))
    }

    pub fn get_run(&self, id: &str) -> anyhow::Result<Option<Run>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM runs WHERE id=?1")?;
        match stmt.query_row([id], row_to_run) {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_runs(&self) -> anyhow::Result<Vec<Run>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM runs ORDER BY rowid")?;
        let rows = stmt.query_map([], row_to_run)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_run(&self, run: Run) -> anyhow::Result<Run> {
        anyhow::ensure!(
            RUN_KINDS.contains(&run.kind.as_str()),
            "invalid run kind: {}",
            run.kind
        );
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE runs SET kind=?2, schedule_cron=?3, spec_json=?4, enabled=?5 WHERE id=?1",
            rusqlite::params![
                run.id,
                run.kind,
                run.schedule_cron,
                run.spec_json,
                run.enabled as i64
            ],
        )?;
        anyhow::ensure!(n == 1, "run not found: {}", run.id);
        Ok(run)
    }

    pub fn delete_run(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM runs WHERE id=?1", [id])? > 0)
    }

    pub fn set_run_enabled(&self, id: &str, enabled: bool) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE runs SET enabled=?2 WHERE id=?1",
            rusqlite::params![id, enabled as i64],
        )?;
        anyhow::ensure!(n == 1, "run not found: {id}");
        Ok(())
    }

    pub fn set_run_last_run_at(&self, id: &str, ts_ms: i64) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE runs SET last_run_at=?2 WHERE id=?1",
            rusqlite::params![id, ts_ms],
        )?;
        anyhow::ensure!(n == 1, "run not found: {id}");
        Ok(())
    }

    // ---- results ----

    pub fn add_run_result(&self, new: NewRunResult<'_>) -> anyhow::Result<RunResult> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO run_results (id, run_id, session_id, status, summary, step_index, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                new.run_id,
                new.session_id,
                new.status,
                new.summary,
                new.step_index,
                new.started_at,
                new.finished_at
            ],
        )?;
        let mut stmt = conn.prepare("SELECT * FROM run_results WHERE id=?1")?;
        Ok(stmt.query_row([&id], row_to_result)?)
    }

    /// Persist-then-act for executions (T6): the row exists (status
    /// "running") BEFORE the process starts, so an app death mid-step leaves
    /// honest evidence for [`Store::mark_interrupted_run_results`].
    pub fn begin_run_result(
        &self,
        run_id: &str,
        step_index: Option<i64>,
    ) -> anyhow::Result<RunResult> {
        self.add_run_result(NewRunResult {
            run_id,
            session_id: None,
            status: "running",
            summary: None,
            step_index,
            started_at: Self::now_ms(),
            finished_at: 0,
        })
    }

    pub fn finish_run_result(
        &self,
        id: &str,
        status: &str,
        summary: Option<&str>,
        session_id: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE run_results SET status=?2, summary=?3, session_id=?4, finished_at=?5 WHERE id=?1",
            rusqlite::params![id, status, summary, session_id, Self::now_ms()],
        )?;
        anyhow::ensure!(n == 1, "run result not found: {id}");
        Ok(())
    }

    /// Boot scan (§3.2): anything still "running" died with the app — mark it
    /// interrupted. Sequences are atomic-or-stopped, NEVER auto-resumed.
    pub fn mark_interrupted_run_results(&self) -> anyhow::Result<usize> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE run_results SET status='interrupted',
             summary='interrupted: the app closed mid-execution', finished_at=?1
             WHERE status='running'",
            rusqlite::params![Self::now_ms()],
        )?;
        Ok(n)
    }

    pub fn list_run_results(&self, run_id: &str) -> anyhow::Result<Vec<RunResult>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM run_results WHERE run_id=?1
             ORDER BY started_at DESC, step_index ASC",
        )?;
        let rows = stmt.query_map([run_id], row_to_result)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_run(kind: &str) -> NewRun {
        NewRun {
            kind: kind.into(),
            schedule_cron: Some("0 9 * * 1-5".into()),
            spec_json: r#"{"action":"prompt","project_path":"/tmp","prompt":"hi"}"#.into(),
        }
    }

    #[test]
    fn create_get_list_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_run(new_run("scheduled")).unwrap();
        assert!(r.enabled, "runs default enabled");
        assert_eq!(r.last_run_at, None);
        assert_eq!(s.get_run(&r.id).unwrap(), Some(r.clone()));
        assert_eq!(s.list_runs().unwrap(), vec![r]);
    }

    #[test]
    fn invalid_kind_rejected() {
        let s = Store::open_in_memory().unwrap();
        assert!(s.create_run(new_run("cron")).is_err());
    }

    #[test]
    fn enable_disable_and_last_run() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_run(new_run("scheduled")).unwrap();
        s.set_run_enabled(&r.id, false).unwrap();
        assert!(!s.get_run(&r.id).unwrap().unwrap().enabled);
        s.set_run_last_run_at(&r.id, 12345).unwrap();
        assert_eq!(s.get_run(&r.id).unwrap().unwrap().last_run_at, Some(12345));
        assert!(s.set_run_enabled("missing", true).is_err());
    }

    #[test]
    fn update_and_delete() {
        let s = Store::open_in_memory().unwrap();
        let mut r = s.create_run(new_run("manual")).unwrap();
        r.schedule_cron = None;
        r.spec_json = r#"{"action":"standup","agent_ids":[]}"#.into();
        let r = s.update_run(r).unwrap();
        assert_eq!(s.get_run(&r.id).unwrap().unwrap().schedule_cron, None);
        assert!(s.delete_run(&r.id).unwrap());
        assert!(!s.delete_run(&r.id).unwrap());
    }

    #[test]
    fn begin_finish_and_interrupted_marking() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_run(new_run("manual")).unwrap();
        let a = s.begin_run_result(&r.id, Some(0)).unwrap();
        assert_eq!(a.status, "running");
        s.finish_run_result(&a.id, "success", Some("done"), Some("sess-9"))
            .unwrap();
        let b = s.begin_run_result(&r.id, Some(1)).unwrap();
        // app "dies" here; boot scan marks the running row interrupted
        assert_eq!(s.mark_interrupted_run_results().unwrap(), 1);
        let rows = s.list_run_results(&r.id).unwrap();
        let a_row = rows.iter().find(|x| x.id == a.id).unwrap();
        let b_row = rows.iter().find(|x| x.id == b.id).unwrap();
        assert_eq!(a_row.status, "success");
        assert_eq!(a_row.session_id.as_deref(), Some("sess-9"));
        assert_eq!(b_row.status, "interrupted");
        // idempotent: nothing left to mark
        assert_eq!(s.mark_interrupted_run_results().unwrap(), 0);
    }

    #[test]
    fn results_with_step_index_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let r = s.create_run(new_run("manual")).unwrap();
        for (i, status) in ["success", "error"].iter().enumerate() {
            s.add_run_result(NewRunResult {
                run_id: &r.id,
                session_id: Some("sess-1"),
                status,
                summary: Some("did things"),
                step_index: Some(i as i64),
                started_at: 100 + i as i64,
                finished_at: 200,
            })
            .unwrap();
        }
        // simple run result without step
        s.add_run_result(NewRunResult {
            run_id: &r.id,
            session_id: None,
            status: "success",
            summary: None,
            step_index: None,
            started_at: 300,
            finished_at: 301,
        })
        .unwrap();
        let results = s.list_run_results(&r.id).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].step_index, None, "newest first");
        // deleting the run cascades results
        s.delete_run(&r.id).unwrap();
        assert!(s.list_run_results(&r.id).unwrap().is_empty());
    }
}
