//! Scheduler (17.1, D-M4-4): `croner` parses cron expressions; the ~100-line
//! tokio loop is OURS — the `runs` table stays the single source of truth
//! (no second job registry to reconcile). The pure functions (`next_fire`,
//! `due_runs`) take explicit clocks so tests never sleep real time.
//!
//! Missed-while-closed policy: fire AT MOST ONCE per run on wake when an
//! occurrence was missed (`last_run_at` < previous occurrence), never
//! burst-replay. And honestly: schedules run only while CrewHub is open.

use crate::store::runs::Run;
use crate::store::Store;
use chrono::{DateTime, TimeZone, Utc};
use std::str::FromStr;
use std::sync::Arc;

/// The honest copy the automation panel must render prominently (master plan
/// AC: document this, not bury it).
pub const SCHEDULER_HONEST_COPY: &str = "Schedules run only while CrewHub is open.";

/// The loop re-reads the runs table at least this often, so DB edits are
/// picked up without a wake channel (simple beats clever).
pub const TICK_CAP_MS: u64 = 30_000;

/// Next occurrence of `cron` strictly after `after` (epoch ms), in the given
/// timezone. `None` = unparsable expression or no future occurrence.
pub fn next_fire_in<Tz: TimeZone>(cron: &str, after: DateTime<Tz>) -> Option<i64> {
    let parsed = croner::Cron::from_str(cron).ok()?;
    parsed
        .find_next_occurrence(&after, false)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

/// Next occurrence strictly after `after_ms`, evaluated in UTC (the app
/// stores epoch ms everywhere; cron semantics follow the wall clock of UTC —
/// documented in the schedule editor via `preview_cron`).
pub fn next_fire(cron: &str, after_ms: i64) -> Option<i64> {
    // Floor to whole seconds: cron granularity is seconds, and croner keeps
    // sub-second fractions — without flooring, a sliding anchor (the loop's
    // last tick) chases per-second occurrences forever and never catches one.
    let after_ms = after_ms - after_ms.rem_euclid(1000);
    let after = Utc.timestamp_millis_opt(after_ms).single()?;
    next_fire_in(cron, after)
}

/// Which runs are due at `now`? Pure (injected clocks). Rules:
/// - disabled / cron-less / unparsable rows never fire;
/// - a run that has fired before is due when its next occurrence after
///   `last_run_at` has arrived — at most ONE firing per wake, because firing
///   advances `last_run_at` to `now` (missed-once-on-wake, never burst);
/// - a run that has never fired is due at its first occurrence after
///   `last_tick_ms` (no replay of occurrences before the app opened).
pub fn due_runs(runs: &[Run], last_tick_ms: i64, now_ms: i64) -> Vec<String> {
    runs.iter()
        .filter(|r| r.enabled)
        .filter_map(|r| {
            let cron = r.schedule_cron.as_deref()?;
            let anchor = r.last_run_at.unwrap_or(last_tick_ms);
            let next = next_fire(cron, anchor)?;
            (next <= now_ms).then(|| r.id.clone())
        })
        .collect()
}

/// Sleep budget until the next interesting moment: the earliest upcoming
/// occurrence across enabled rows, capped at [`TICK_CAP_MS`].
pub fn next_tick_ms(runs: &[Run], now_ms: i64) -> u64 {
    let earliest = runs
        .iter()
        .filter(|r| r.enabled)
        .filter_map(|r| next_fire(r.schedule_cron.as_deref()?, now_ms))
        .min();
    match earliest {
        Some(t) => ((t - now_ms).max(50) as u64).min(TICK_CAP_MS),
        None => TICK_CAP_MS,
    }
}

/// The owned tokio loop. `clock` and `dispatch` are injected so tests use a
/// fake clock cap and a fake dispatcher (§3.7: never sleeps real schedule
/// time). Persist-then-act: `last_run_at` advances BEFORE dispatch, so a
/// crash mid-dispatch never replays the firing.
pub(crate) async fn scheduler_loop<D, Fut>(store: Arc<Store>, tick_cap_ms: u64, dispatch: D)
where
    D: Fn(Run) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = ()> + Send,
{
    let mut last_tick = Store::now_ms();
    loop {
        let now = Store::now_ms();
        let runs = store.list_runs().unwrap_or_default();
        for id in due_runs(&runs, last_tick, now) {
            if store.set_run_last_run_at(&id, now).is_err() {
                continue; // deleted mid-tick
            }
            if let Ok(Some(run)) = store.get_run(&id) {
                dispatch(run).await;
            }
        }
        last_tick = now;
        let sleep_ms = next_tick_ms(&runs, now).min(tick_cap_ms);
        tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::runs::NewRun;

    /// 2026-06-15 is a Monday; 12:00:00 UTC epoch ms.
    const MON_NOON: i64 = 1_781_524_800_000;

    fn run_row(id: &str, cron: Option<&str>, enabled: bool, last_run_at: Option<i64>) -> Run {
        Run {
            id: id.into(),
            kind: "scheduled".into(),
            schedule_cron: cron.map(str::to_string),
            spec_json: "{}".into(),
            enabled,
            last_run_at,
        }
    }

    #[test]
    fn next_fire_minute_and_weekday_semantics() {
        // every minute: next is the next minute boundary
        let next = next_fire("* * * * *", MON_NOON).unwrap();
        assert_eq!(next, MON_NOON + 60_000);
        // weekdays at 09:00: from Monday noon -> Tuesday 09:00
        let next = next_fire("0 9 * * 1-5", MON_NOON).unwrap();
        let dt = Utc.timestamp_millis_opt(next).unwrap();
        assert_eq!(dt.to_rfc3339(), "2026-06-16T09:00:00+00:00");
        // strictly after: an occurrence exactly at `after` is NOT returned
        let at_nine = next_fire("0 9 * * 1-5", next).unwrap();
        assert!(at_nine > next);
    }

    #[test]
    fn next_fire_dom_dow_intersection_style() {
        // croner D-M4-4 selling point: sane DOM/DOW handling. 13th of the
        // month at 09:00 from Monday 2026-06-15 -> 2026-07-13.
        let next = next_fire("0 9 13 * *", MON_NOON).unwrap();
        let dt = Utc.timestamp_millis_opt(next).unwrap();
        assert_eq!(dt.to_rfc3339(), "2026-07-13T09:00:00+00:00");
    }

    #[test]
    fn next_fire_sub_second_anchor_still_catches_per_second_occurrences() {
        // regression: anchor 12:00:00.030 -> next per-second occurrence is
        // 12:00:01.000 (absolute boundary), NOT 12:00:01.030 (sliding)
        let next = next_fire("* * * * * *", MON_NOON + 30).unwrap();
        assert_eq!(next, MON_NOON + 1000);
    }

    #[test]
    fn next_fire_garbage_is_none_never_panic() {
        for bad in ["", "not cron", "99 99 * * *", "* * * * * * * *"] {
            assert_eq!(next_fire(bad, MON_NOON), None, "input: {bad:?}");
        }
    }

    #[test]
    fn due_when_occurrence_arrived_since_last_run() {
        let runs = [run_row(
            "r1",
            Some("* * * * *"),
            true,
            Some(MON_NOON - 120_000),
        )];
        // two occurrences elapsed — still fires exactly ONCE (no burst): the
        // pure function names the run; the loop then advances last_run_at
        let due = due_runs(&runs, MON_NOON - 300_000, MON_NOON);
        assert_eq!(due, vec!["r1".to_string()]);
        // after firing (last_run_at = now), nothing is due until next minute
        let runs = [run_row("r1", Some("* * * * *"), true, Some(MON_NOON))];
        assert!(due_runs(&runs, MON_NOON, MON_NOON + 1000).is_empty());
    }

    #[test]
    fn missed_while_closed_fires_once_on_wake() {
        // app was closed for a day; daily 09:00 run last fired 2 days ago
        let two_days_ago = MON_NOON - 2 * 86_400_000;
        let runs = [run_row("r1", Some("0 9 * * *"), true, Some(two_days_ago))];
        let due = due_runs(&runs, MON_NOON - 1000, MON_NOON);
        assert_eq!(due.len(), 1, "missed occurrence fires once on wake");
    }

    #[test]
    fn never_ran_fires_only_for_occurrences_after_the_last_tick() {
        // new schedule, occurrence at every minute, app ticked 10s ago: due
        let runs = [run_row("r1", Some("* * * * *"), true, None)];
        assert_eq!(due_runs(&runs, MON_NOON - 70_000, MON_NOON).len(), 1);
        // but a fresh tick window with no occurrence in it: not due
        assert!(due_runs(&runs, MON_NOON, MON_NOON + 1000).is_empty());
    }

    #[test]
    fn disabled_cronless_and_garbage_rows_never_fire() {
        let runs = [
            run_row("off", Some("* * * * *"), false, None),
            run_row("manual", None, true, None),
            run_row("broken", Some("nonsense"), true, Some(0)),
        ];
        assert!(due_runs(&runs, 0, MON_NOON).is_empty());
    }

    #[test]
    fn next_tick_is_capped_and_tracks_earliest_occurrence() {
        // next minute boundary is 60s away -> capped at 30s
        let runs = [run_row("r1", Some("* * * * *"), true, None)];
        assert_eq!(next_tick_ms(&runs, MON_NOON), TICK_CAP_MS);
        // 5s before the boundary -> sleep just until it
        let now = MON_NOON + 55_000;
        assert_eq!(next_tick_ms(&runs, now), 5_000);
        // nothing enabled -> cap
        assert_eq!(next_tick_ms(&[], MON_NOON), TICK_CAP_MS);
    }

    /// §3.7: the loop with a tiny cap + fake dispatcher fires a due run and
    /// advances `last_run_at` BEFORE dispatching (persist-then-act).
    #[tokio::test(flavor = "multi_thread")]
    async fn loop_fires_due_run_through_injected_dispatcher() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let run = store
            .create_run(NewRun {
                kind: "scheduled".into(),
                schedule_cron: Some("* * * * * *".into()), // every second (6-field)
                spec_json: r#"{"action":"prompt","project_path":"/tmp","prompt":"x"}"#.into(),
            })
            .unwrap();
        let fired = Arc::new(std::sync::Mutex::new(Vec::<(String, Option<i64>)>::new()));
        let sink = fired.clone();
        let loop_store = store.clone();
        let task = tokio::spawn(async move {
            scheduler_loop(loop_store, 50, move |r: Run| {
                let sink = sink.clone();
                async move {
                    sink.lock().unwrap().push((r.id.clone(), r.last_run_at));
                }
            })
            .await;
        });
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            if !fired.lock().unwrap().is_empty() {
                break;
            }
            assert!(tokio::time::Instant::now() < deadline, "never fired");
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        task.abort();
        let fired = fired.lock().unwrap();
        assert_eq!(fired[0].0, run.id);
        assert!(
            fired[0].1.is_some(),
            "last_run_at must be persisted BEFORE dispatch"
        );
    }
}
