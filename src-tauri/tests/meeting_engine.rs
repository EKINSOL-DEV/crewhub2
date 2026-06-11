//! Meeting engine integration tests against fake-claude (M4 T3, §3.2/§3.3/§3.4).
//!
//! G11 in action: every participant process picks its OWN scenario via the
//! `[scenario:<name>]` marker planted in its persona (argv), from
//! `FAKE_CLAUDE_SCENARIO_DIR`; the synthesis headless run (no marker) plays
//! `default.jsonl`. Transcripts land in `FAKE_CLAUDE_TRANSCRIPT_DIR/<session>.jsonl`
//! — the same place the provider's `read_transcript` looks.

use crewhub2_lib::engine::claude::{ClaudeCodeProvider, ClaudeConfig};
use crewhub2_lib::engine::provider::ProviderRegistry;
use crewhub2_lib::engine::types::{SessionEvent, SessionMeta, SessionOrigin};
use crewhub2_lib::events::DomainEvent;
use crewhub2_lib::orchestrator::meeting::ParticipantSpec;
use crewhub2_lib::orchestrator::{Orchestrator, StartMeetingSpec};
use crewhub2_lib::store::Store;
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct Harness {
    store: Arc<Store>,
    registry: Arc<ProviderRegistry>,
    orchestrator: Arc<Orchestrator>,
    /// Discovered managed-session metas (cost-discipline assertions).
    discovered: Arc<Mutex<Vec<SessionMeta>>>,
    notify_rx: tokio::sync::broadcast::Receiver<DomainEvent>,
    project: std::path::PathBuf,
}

/// Build a full stack over `scenario_dir`, optionally reusing an existing store.
fn harness(
    base: &std::path::Path,
    scenario_dir: &std::path::Path,
    store: Option<Arc<Store>>,
) -> Harness {
    let root = base.join("claude-projects");
    let fakeproj = root.join("fakeproj");
    std::fs::create_dir_all(&fakeproj).unwrap();
    let project = base.join("proj");
    std::fs::create_dir_all(&project).unwrap();

    let store = store.unwrap_or_else(|| Arc::new(Store::open_in_memory().unwrap()));
    let provider = ClaudeCodeProvider::start(
        ClaudeConfig {
            root,
            cli_path: env!("CARGO_BIN_EXE_fake-claude").into(),
            idle_timeout_ms: 30 * 60 * 1000,
            extra_env: vec![
                (
                    "FAKE_CLAUDE_SCENARIO_DIR".into(),
                    scenario_dir.display().to_string(),
                ),
                (
                    "FAKE_CLAUDE_TRANSCRIPT_DIR".into(),
                    fakeproj.display().to_string(),
                ),
            ],
        },
        store.clone(),
    )
    .unwrap();

    let mut registry = ProviderRegistry::default();
    registry.register(Arc::new(provider));
    let registry = Arc::new(registry);

    // collect Discovered managed metas for the model-policy assertions
    let discovered: Arc<Mutex<Vec<SessionMeta>>> = Arc::default();
    let sink = discovered.clone();
    let mut events = registry.aggregate_events();
    tokio::spawn(async move {
        while let Ok(ev) = events.recv().await {
            if let SessionEvent::Discovered { meta } = ev {
                if meta.origin == SessionOrigin::Managed {
                    sink.lock().unwrap().push(meta);
                }
            }
        }
    });

    let (notify, notify_rx) = tokio::sync::broadcast::channel(256);
    let orchestrator = Orchestrator::new(store.clone(), registry.clone(), notify);
    Harness {
        store,
        registry,
        orchestrator,
        discovered,
        notify_rx,
        project,
    }
}

fn write_lines(path: &std::path::Path, lines: &[serde_json::Value]) {
    let body: String = lines.iter().map(|l| format!("{l}\n")).collect();
    std::fs::write(path, body).unwrap();
}

fn assistant_line(text: &str) -> serde_json::Value {
    json!({"write_transcript": {"type":"assistant","message":{"role":"assistant",
        "content":[{"type":"text","text": text}]}}})
}

fn result_line() -> serde_json::Value {
    json!({"emit": {"type":"result","subtype":"success","is_error":false,"result":"ok"}})
}

/// Participant scenario: init, then one (expect, reply, result) triple per turn.
fn participant_scenario(name: &str, turns: &[(&str, &str)]) -> Vec<serde_json::Value> {
    let mut lines = vec![
        json!({"expect_arg": "haiku"}),
        json!({"expect_stdin": {"contains": "initialize"}}),
    ];
    for (expect, reply) in turns {
        lines.push(json!({"expect_stdin": {"contains": expect}}));
        lines.push(assistant_line(reply));
        lines.push(result_line());
    }
    let _ = name;
    lines
}

fn participant(name: &str) -> ParticipantSpec {
    ParticipantSpec {
        agent_id: format!("agent-{name}"),
        name: name.into(),
        persona: Some(format!(
            "You are {name}, a focused meeting participant. [scenario:{name}]"
        )),
    }
}

fn spec(
    h: &Harness,
    title: &str,
    participants: Vec<ParticipantSpec>,
    rounds: u32,
) -> StartMeetingSpec {
    StartMeetingSpec {
        title: title.into(),
        goal: Some("decide the plan".into()),
        room_id: None,
        project_id: None,
        project_path: h.project.display().to_string(),
        participants,
        rounds: Some(rounds),
        turn_timeout_ms: Some(10_000),
        participant_model: None, // -> policy default (haiku), asserted below
        synthesis_model: None,   // -> policy default (sonnet), asserted via expect_arg
        context_docs: None,
    }
}

async fn wait_for_state(store: &Store, meeting_id: &str, state: &str, secs: u64) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(secs);
    loop {
        let m = store.get_meeting(meeting_id).unwrap().unwrap();
        if m.state == state {
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "timeout waiting for state {state}; meeting is {m:?}"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn synthesis_scenario() -> Vec<serde_json::Value> {
    let output = "## Summary\nA crisp meeting.\n\n## Decisions\n- ship it\n\n```json\n{\"action_items\":[{\"text\":\"Ship the feature\",\"assignee\":\"alice\",\"priority\":\"high\"},{\"text\":\"Write the docs\",\"assignee\":null,\"priority\":null}]}\n```";
    vec![
        json!({"expect_arg": "sonnet"}),
        json!({"expect_arg": "meeting scribe"}),
        json!({"emit": {"type":"result","subtype":"success","is_error":false,
            "session_id":"synth-1","result": output}}),
        json!({"exit": 0}),
    ]
}

/// §3.3 flagship: 3 participants, gathering + 2 rounds, serial turns, haiku
/// specs, offsets recorded, synthesis upgrade, action items, MeetingChanged.
#[tokio::test(flavor = "multi_thread")]
async fn three_participant_meeting_runs_to_complete() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();

    write_lines(
        &scenarios.join("alice.jsonl"),
        &participant_scenario(
            "alice",
            &[
                ("You are alice", "alice-gathering-take"),
                // round 1 digest must carry the others' gathering text (offset reads)
                ("bob-gathering-take", "alice-round1-take"),
                ("Round 2", "alice-round2-take"),
            ],
        ),
    );
    write_lines(
        &scenarios.join("bob.jsonl"),
        &participant_scenario(
            "bob",
            &[
                ("You are bob", "bob-gathering-take"),
                // alice already spoke in round 1 -> digest carries her LATEST turn
                ("alice-round1-take", "bob-round1-take"),
                ("Round 2", "bob-round2-take"),
            ],
        ),
    );
    write_lines(
        &scenarios.join("carol.jsonl"),
        &participant_scenario(
            "carol",
            &[
                ("You are carol", "carol-gathering-take"),
                ("Round 1", "carol-round1-take"),
                ("Round 2", "carol-round2-take"),
            ],
        ),
    );
    write_lines(&scenarios.join("default.jsonl"), &synthesis_scenario());

    let mut h = harness(dir.path(), &scenarios, None);
    let m = h
        .orchestrator
        .start_meeting(spec(
            &h,
            "Sprint direction",
            vec![
                participant("alice"),
                participant("bob"),
                participant("carol"),
            ],
            2,
        ))
        .unwrap();

    wait_for_state(&h.store, &m.id, "complete", 60).await;

    // 3 participants × (gathering + 2 rounds) = 9 turns, all completed, serial
    let turns = h.store.list_meeting_turns(&m.id).unwrap();
    assert_eq!(turns.len(), 9);
    for t in &turns {
        assert!(t.completed_at.is_some(), "turn not completed: {t:?}");
        assert!(t.session_id.is_some());
        assert!(t.transcript_offset.is_some(), "offset must be recorded");
    }
    // offsets grow per participant across rounds (no copied text, real reads)
    for name in ["alice", "bob", "carol"] {
        let agent = format!("agent-{name}");
        let offsets: Vec<i64> = turns
            .iter()
            .filter(|t| t.agent_id == agent)
            .map(|t| t.transcript_offset.unwrap())
            .collect();
        assert_eq!(offsets.len(), 3);
        assert!(
            offsets.windows(2).all(|w| w[0] < w[1]),
            "{name} offsets must increase: {offsets:?}"
        );
    }

    // D-M4-3 cost discipline: every participant session spawned at haiku;
    // exactly 3 dedicated sessions (reused across rounds, never respawned)
    let metas = h.discovered.lock().unwrap().clone();
    assert_eq!(metas.len(), 3, "one dedicated session per participant");
    for meta in &metas {
        assert_eq!(meta.model.as_deref(), Some("haiku"), "{meta:?}");
    }
    // (synthesis model upgrade is asserted INSIDE default.jsonl: expect_arg
    // "sonnet" — a wrong model kills the fake and the meeting never completes)

    let m = h.store.get_meeting(&m.id).unwrap().unwrap();
    let output = m.output_md.unwrap();
    assert!(output.contains("## Summary"));
    assert!(!output.contains("action_items"), "tail block stripped");

    let items = h.store.list_action_items(&m.id).unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].text, "Ship the feature");
    assert_eq!(items[0].assignee_agent_id.as_deref(), Some("agent-alice"));
    assert_eq!(items[0].priority.as_deref(), Some("high"));
    assert_eq!(items[1].assignee_agent_id, None);

    // MeetingChanged events flowed
    let mut changed = 0;
    while let Ok(ev) = h.notify_rx.try_recv() {
        if matches!(ev, DomainEvent::MeetingChanged { ref meeting_id } if *meeting_id == m.id) {
            changed += 1;
        }
    }
    assert!(changed >= 5, "expected progress events, got {changed}");
}

/// §3.4: a sleeping participant exercises timeout → retry-once → skip; the
/// meeting completes with the missing voice marked (completed_at NULL).
#[tokio::test(flavor = "multi_thread")]
async fn timeout_retries_once_then_skips_and_meeting_completes() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();

    write_lines(
        &scenarios.join("alice.jsonl"),
        &participant_scenario(
            "alice",
            &[
                ("You are alice", "alice-gathering-take"),
                ("Round 1", "alice-round1-take"),
            ],
        ),
    );
    // betty answers nothing, ever: every send times out (test-shortened)
    write_lines(
        &scenarios.join("betty.jsonl"),
        &[
            json!({"expect_stdin": {"contains": "initialize"}}),
            json!({"sleep_ms": 30_000}),
            json!({"exit": 0}),
        ],
    );
    write_lines(&scenarios.join("default.jsonl"), &synthesis_scenario());

    let h = harness(dir.path(), &scenarios, None);
    let mut meeting_spec = spec(
        &h,
        "Quorum check",
        vec![participant("alice"), participant("betty")],
        1,
    );
    meeting_spec.turn_timeout_ms = Some(400);
    let m = h.orchestrator.start_meeting(meeting_spec).unwrap();

    wait_for_state(&h.store, &m.id, "complete", 60).await;

    let turns = h.store.list_meeting_turns(&m.id).unwrap();
    assert_eq!(turns.len(), 4, "2 participants × 2 rounds");
    for t in &turns {
        let done = t.completed_at.is_some();
        if t.agent_id == "agent-alice" {
            assert!(done, "alice spoke: {t:?}");
        } else {
            assert!(!done, "betty was skipped (💤): {t:?}");
        }
    }
}

/// §3.2 mechanized: kill the orchestrator mid-round, build a FRESH stack over
/// the same store, and assert it resumes at the persisted position — with the
/// participants' dedicated sessions RESUMED (same session ids), not respawned.
#[tokio::test(flavor = "multi_thread")]
async fn kill_mid_round_then_fresh_orchestrator_resumes_and_completes() {
    let dir = tempfile::tempdir().unwrap();
    let phase1 = dir.path().join("phase1");
    let phase2 = dir.path().join("phase2");
    std::fs::create_dir_all(&phase1).unwrap();
    std::fs::create_dir_all(&phase2).unwrap();

    // phase 1: both gather; dave receives his round-1 prompt and HANGS there
    write_lines(
        &phase1.join("dave.jsonl"),
        &[
            json!({"expect_arg": "haiku"}),
            json!({"expect_stdin": {"contains": "initialize"}}),
            json!({"expect_stdin": {"contains": "You are dave"}}),
            assistant_line("dave-gathering-take"),
            result_line(),
            json!({"expect_stdin": {"contains": "Round 1"}}),
            json!({"sleep_ms": 30_000}),
        ],
    );
    write_lines(
        &phase1.join("erin.jsonl"),
        &participant_scenario("erin", &[("You are erin", "erin-gathering-take")]),
    );

    let h1 = harness(dir.path(), &phase1, None);
    let store = h1.store.clone();
    let m = h1
        .orchestrator
        .start_meeting(spec(
            &h1,
            "Resumable",
            vec![participant("dave"), participant("erin")],
            1,
        ))
        .unwrap();

    // wait until dave's round-1 turn row is persisted (position written first)
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    let dave_turn = loop {
        if let Some(t) = store.find_meeting_turn(&m.id, 1, 0).unwrap() {
            break t;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "never reached round 1"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    let dave_session_phase1 = dave_turn.session_id.clone().unwrap();

    // the kill: drop every driver task mid-await
    h1.orchestrator.shutdown();
    assert!(!h1.orchestrator.is_driving(&m.id));
    let mid = store.get_meeting(&m.id).unwrap().unwrap();
    assert_eq!(mid.state, "round");
    assert_eq!(mid.current_round, Some(1));
    assert_eq!(mid.current_turn, Some(0));

    // phase 2: fresh provider + registry + orchestrator over the SAME store.
    // Every spawn must be a RESUME of the persisted session ids.
    write_lines(
        &phase2.join("dave.jsonl"),
        &[
            json!({"expect_arg": "--resume"}),
            json!({"expect_arg": "haiku"}),
            json!({"expect_stdin": {"contains": "initialize"}}),
            json!({"expect_stdin": {"contains": "Round 1"}}), // the re-sent prompt
            assistant_line("dave-round1-take"),
            result_line(),
        ],
    );
    write_lines(
        &phase2.join("erin.jsonl"),
        &[
            json!({"expect_arg": "--resume"}),
            json!({"expect_stdin": {"contains": "initialize"}}),
            json!({"expect_stdin": {"contains": "dave-round1-take"}}), // digest sees dave
            assistant_line("erin-round1-take"),
            result_line(),
        ],
    );
    write_lines(&phase2.join("default.jsonl"), &synthesis_scenario());

    let h2 = harness(dir.path(), &phase2, Some(store.clone()));
    assert_eq!(
        h2.orchestrator.recover_on_boot(),
        1,
        "one meeting to resume"
    );

    wait_for_state(&store, &m.id, "complete", 60).await;

    let turns = store.list_meeting_turns(&m.id).unwrap();
    assert_eq!(turns.len(), 4);
    assert!(turns.iter().all(|t| t.completed_at.is_some()));
    // dave's round-1 row kept the SAME session id: resumed, not replaced
    let dave_round1 = store.find_meeting_turn(&m.id, 1, 0).unwrap().unwrap();
    assert_eq!(dave_round1.session_id.unwrap(), dave_session_phase1);
    drop(h1);
    drop(h2);
}

/// Cancel mid-meeting: terminal state persisted, driver stops, no synthesis.
#[tokio::test(flavor = "multi_thread")]
async fn cancel_mid_meeting_is_terminal() {
    let dir = tempfile::tempdir().unwrap();
    let scenarios = dir.path().join("scenarios");
    std::fs::create_dir_all(&scenarios).unwrap();
    // both participants hang forever — the meeting only ends by cancel
    for name in ["alice", "bob"] {
        write_lines(
            &scenarios.join(format!("{name}.jsonl")),
            &[
                json!({"expect_stdin": {"contains": "initialize"}}),
                json!({"sleep_ms": 30_000}),
            ],
        );
    }
    let h = harness(dir.path(), &scenarios, None);
    let m = h
        .orchestrator
        .start_meeting(spec(
            &h,
            "Cancelled",
            vec![participant("alice"), participant("bob")],
            1,
        ))
        .unwrap();

    wait_for_state(&h.store, &m.id, "gathering", 30).await;
    tokio::time::sleep(Duration::from_millis(200)).await; // mid-await
    let cancelled = h.orchestrator.cancel_meeting(&m.id).unwrap();
    assert_eq!(cancelled.state, "cancelled");
    assert!(cancelled.cancelled_at.is_some());

    // stays cancelled (driver must not overwrite the terminal state)
    tokio::time::sleep(Duration::from_millis(500)).await;
    let still = h.store.get_meeting(&m.id).unwrap().unwrap();
    assert_eq!(still.state, "cancelled");
    let _ = h.registry.clone();
}
