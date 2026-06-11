//! Meeting engine (16.1, D-M4-2/3): a PURE state machine (`next`) whose
//! effects are data, executed by a thin async driver over the provider
//! registry. The invariant that makes recovery work: **persist, then act** —
//! `Effect::PersistPosition` always precedes the `StartTurn`/`StartSynthesis`
//! it announces, so a crash at any point resumes at the persisted position
//! (worst case: one turn prompt is re-sent — documented, acceptable).
//!
//! Turn content is NEVER copied into the DB: `meeting_turns.transcript_offset`
//! is captured at turn start and content is read back through the provider's
//! `read_transcript` on demand (round digests, synthesis input), with byte
//! caps and explicit truncation markers.

use crate::engine::types::{SessionEvent, SessionId, SessionStatus, SpawnSpec, UserInput};
use crate::orchestrator::substitute::substitute;
use crate::orchestrator::DriverCtx;
use crate::store::meetings::Meeting;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::broadcast;

// ---- config -----------------------------------------------------------------

pub const DEFAULT_ROUNDS: u32 = 2;
pub const DEFAULT_TURN_TIMEOUT_MS: u64 = 120_000;

/// Byte caps (Appendix D): every inlined excerpt is capped WITH an explicit
/// marker — the model is always told it got a cut, never silently fed less.
pub const DOC_CAP_BYTES: usize = 2 * 1024;
pub const DIGEST_CAP_BYTES: usize = 8 * 1024;
pub const TURN_CAP_BYTES: usize = 8 * 1024;
pub const TRUNCATION_MARKER: &str = "… [truncated]";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct ParticipantSpec {
    pub agent_id: String,
    pub name: String,
    /// Persona carried via the session's appended system prompt.
    pub persona: Option<String>,
}

/// Stored verbatim in `meetings.config_json` — the schema never changes shape
/// (`parallel` is reserved, R5: the engine rejects `true`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MeetingConfig {
    pub participants: Vec<ParticipantSpec>,
    #[serde(default = "default_rounds")]
    pub rounds: u32,
    #[serde(default = "default_turn_timeout_ms")]
    pub turn_timeout_ms: u64,
    pub participant_model: String,
    pub synthesis_model: String,
    pub project_path: String,
    #[serde(default)]
    pub context_docs: Vec<String>,
    #[serde(default)]
    pub parallel: bool,
}

fn default_rounds() -> u32 {
    DEFAULT_ROUNDS
}
fn default_turn_timeout_ms() -> u64 {
    DEFAULT_TURN_TIMEOUT_MS
}

// ---- pure state machine ------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Round 0: each participant answers the topic cold.
    Gathering,
    /// Discussion round `1..=rounds`.
    Round(u32),
    Synthesis,
    Complete,
    Cancelled,
    Error,
}

impl Phase {
    pub fn db_state(&self) -> &'static str {
        match self {
            Phase::Gathering => "gathering",
            Phase::Round(_) => "round",
            Phase::Synthesis => "synthesis",
            Phase::Complete => "complete",
            Phase::Cancelled => "cancelled",
            Phase::Error => "error",
        }
    }

    pub fn round(&self) -> u32 {
        match self {
            Phase::Round(r) => *r,
            _ => 0,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Phase::Complete | Phase::Cancelled | Phase::Error)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Position {
    pub phase: Phase,
    pub turn: u32,
    /// Ephemeral (not persisted): the current turn already got its one retry.
    pub retried: bool,
}

impl Position {
    pub fn start() -> Self {
        Self {
            phase: Phase::Gathering,
            turn: 0,
            retried: false,
        }
    }

    /// Rebuild from a persisted meeting row (boot recovery scan, D-M4-2).
    pub fn from_meeting(m: &Meeting) -> Self {
        let phase = match m.state.as_str() {
            "gathering" => Phase::Gathering,
            "round" => Phase::Round(m.current_round.unwrap_or(1).max(1) as u32),
            "synthesis" => Phase::Synthesis,
            "complete" => Phase::Complete,
            "cancelled" => Phase::Cancelled,
            _ => Phase::Error,
        };
        Self {
            phase,
            turn: m.current_turn.unwrap_or(0).max(0) as u32,
            retried: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum MeetingEvent {
    /// Start fresh or resume at the persisted position.
    Begin,
    TurnDone,
    TurnTimedOut,
    TurnFailed(String),
    SynthesisDone(String),
    SynthesisFailed(String),
    Cancel,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    /// Write the new position to the store — ALWAYS precedes the act it announces.
    PersistPosition,
    EmitChanged,
    /// Mark the turn row completed (skipped turns never get this).
    FinishTurn {
        round: u32,
        turn: u32,
    },
    StartTurn {
        round: u32,
        turn: u32,
        retry: bool,
    },
    StartSynthesis,
    CompleteWith {
        text: String,
    },
    FailWith {
        message: String,
    },
    PersistCancelled,
}

/// The pure transition: `(position, event) -> (position', effects)`.
/// Serial turns always (R5); timeout/failure gets exactly one retry, then the
/// turn is skipped — a missing voice is better than a dead meeting.
pub fn next(cfg: &MeetingConfig, pos: &Position, ev: &MeetingEvent) -> (Position, Vec<Effect>) {
    use MeetingEvent::*;
    if pos.phase.is_terminal() {
        return (pos.clone(), vec![]);
    }
    match (&pos.phase, ev) {
        (_, Cancel) => (
            Position {
                phase: Phase::Cancelled,
                turn: 0,
                retried: false,
            },
            vec![Effect::PersistCancelled, Effect::EmitChanged],
        ),
        (Phase::Gathering | Phase::Round(_), Begin) => {
            let p = Position {
                retried: false,
                ..pos.clone()
            };
            let effects = vec![
                Effect::PersistPosition,
                Effect::EmitChanged,
                Effect::StartTurn {
                    round: p.phase.round(),
                    turn: p.turn,
                    retry: false,
                },
            ];
            (p, effects)
        }
        (Phase::Synthesis, Begin) => (
            Position {
                retried: false,
                ..pos.clone()
            },
            vec![
                Effect::PersistPosition,
                Effect::EmitChanged,
                Effect::StartSynthesis,
            ],
        ),
        (Phase::Gathering | Phase::Round(_), TurnDone) => {
            let mut effects = vec![Effect::FinishTurn {
                round: pos.phase.round(),
                turn: pos.turn,
            }];
            advance(cfg, pos, &mut effects)
        }
        (Phase::Gathering | Phase::Round(_), TurnTimedOut | TurnFailed(_)) if !pos.retried => {
            let p = Position {
                retried: true,
                ..pos.clone()
            };
            let effects = vec![Effect::StartTurn {
                round: p.phase.round(),
                turn: p.turn,
                retry: true,
            }];
            (p, effects)
        }
        // second failure: skip the turn (no FinishTurn) and move on
        (Phase::Gathering | Phase::Round(_), TurnTimedOut | TurnFailed(_)) => {
            let mut effects = vec![];
            advance(cfg, pos, &mut effects)
        }
        (Phase::Synthesis, SynthesisDone(text)) => (
            Position {
                phase: Phase::Complete,
                turn: 0,
                retried: false,
            },
            vec![
                Effect::CompleteWith { text: text.clone() },
                Effect::EmitChanged,
            ],
        ),
        (Phase::Synthesis, SynthesisFailed(e)) => (
            Position {
                phase: Phase::Error,
                turn: 0,
                retried: false,
            },
            vec![Effect::FailWith { message: e.clone() }, Effect::EmitChanged],
        ),
        // mismatched event for the phase: ignore (defensive)
        _ => (pos.clone(), vec![]),
    }
}

fn advance(
    cfg: &MeetingConfig,
    pos: &Position,
    effects: &mut Vec<Effect>,
) -> (Position, Vec<Effect>) {
    let n = cfg.participants.len() as u32;
    let cur_round = pos.phase.round();
    let p = if pos.turn + 1 < n {
        Position {
            phase: pos.phase,
            turn: pos.turn + 1,
            retried: false,
        }
    } else if cur_round < cfg.rounds {
        Position {
            phase: Phase::Round(cur_round + 1),
            turn: 0,
            retried: false,
        }
    } else {
        Position {
            phase: Phase::Synthesis,
            turn: 0,
            retried: false,
        }
    };
    effects.push(Effect::PersistPosition);
    effects.push(Effect::EmitChanged);
    match p.phase {
        Phase::Synthesis => effects.push(Effect::StartSynthesis),
        _ => effects.push(Effect::StartTurn {
            round: p.phase.round(),
            turn: p.turn,
            retry: false,
        }),
    }
    (p, std::mem::take(effects))
}

// ---- prompt scaffolds (Appendix D — structure frozen, slots via substitute) ---

pub const GATHERING_SCAFFOLD: &str = r#"You are {{agent_name}}, participating in a CrewHub meeting: "{{title}}".
Goal: {{goal}}.
{{context_docs}}Give your opening take in ≤300 words. Be concrete; disagree where you disagree.
Do not use tools. Do not ask questions back — state assumptions instead."#;

pub const ROUND_SCAFFOLD: &str = r#"Round {{round}} of {{rounds}}. What the others said last round:
{{digest}}
React in ≤250 words: build on, challenge, or refine. Converge toward
recommendations — round {{rounds}} is the last."#;

pub const SYNTHESIS_SCAFFOLD: &str = r####"You are the meeting scribe. Synthesize this meeting into markdown:
"## Summary" (≤200 words), "## Decisions", "## Open questions".
Then end with EXACTLY ONE fenced json block:
```json
{"action_items": [{"text": "...", "assignee": "<participant name or null>",
                   "priority": "low|medium|high"}]}
```

Meeting: "{{title}}" — goal: {{goal}}.
Full discussion transcript:
{{transcript}}"####;

/// Cap text at `cap` bytes (on a char boundary), appending the explicit
/// truncation marker so the model knows it got a cut.
pub fn cap_text(s: &str, cap: usize) -> String {
    if s.len() <= cap {
        return s.to_string();
    }
    let mut end = cap;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}{}", &s[..end], TRUNCATION_MARKER)
}

// ---- driver -------------------------------------------------------------------

/// Drive a meeting from its persisted position to a terminal state.
/// Spawned by the orchestrator (start + boot recovery scan).
pub(crate) async fn drive_meeting(
    ctx: DriverCtx,
    meeting_id: String,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    let Ok(Some(meeting)) = ctx.store.get_meeting(&meeting_id) else {
        return;
    };
    let cfg: MeetingConfig = match meeting
        .config_json
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("meeting has no config"))
        .and_then(|j| Ok(serde_json::from_str(j)?))
    {
        Ok(cfg) => cfg,
        Err(e) => {
            fail(
                &ctx,
                &meeting_id,
                &format!("unreadable meeting config: {e}"),
            );
            return;
        }
    };
    if cfg.parallel {
        fail(
            &ctx,
            &meeting_id,
            "parallel turns are reserved and unimplemented (R5: serial always)",
        );
        return;
    }
    if cfg.participants.len() < 2 {
        fail(&ctx, &meeting_id, "a meeting needs at least 2 participants");
        return;
    }

    let mut driver = Driver {
        ctx,
        meeting_id: meeting_id.clone(),
        cfg,
        sessions: HashMap::new(),
        resume_targets: HashMap::new(),
        active_session: None,
    };
    driver.rebuild_sessions_from_turns();

    let mut pos = Position::from_meeting(&meeting);
    let mut ev = MeetingEvent::Begin;
    loop {
        // External cancel (IPC writes the terminal state directly): stop.
        match driver.ctx.store.get_meeting(&meeting_id) {
            Ok(Some(m)) => {
                if Position::from_meeting(&m).phase.is_terminal() {
                    break;
                }
            }
            _ => break,
        }
        if *cancel_rx.borrow() {
            ev = MeetingEvent::Cancel;
        }
        let (new_pos, effects) = next(&driver.cfg, &pos, &ev);
        pos = new_pos;
        if effects.is_empty() {
            break;
        }
        let mut next_ev: Option<MeetingEvent> = None;
        let mut terminal = false;
        for effect in effects {
            match effect {
                Effect::PersistPosition => {
                    let _ = driver.ctx.store.set_meeting_position(
                        &meeting_id,
                        pos.phase.db_state(),
                        Some(pos.phase.round() as i64),
                        Some(pos.turn as i64),
                    );
                }
                Effect::EmitChanged => driver.emit_changed(),
                Effect::FinishTurn { round, turn } => {
                    if let Ok(Some(row)) =
                        driver
                            .ctx
                            .store
                            .find_meeting_turn(&meeting_id, round as i64, turn as i64)
                    {
                        let _ = driver.ctx.store.finish_meeting_turn(&row.id);
                    }
                }
                Effect::StartTurn { round, turn, retry } => {
                    next_ev = Some(driver.run_turn(round, turn, retry, &mut cancel_rx).await);
                }
                Effect::StartSynthesis => {
                    next_ev = Some(driver.run_synthesis(&mut cancel_rx).await);
                }
                Effect::CompleteWith { text } => {
                    driver.complete_with(&text);
                    terminal = true;
                }
                Effect::FailWith { message } => {
                    let _ = driver.ctx.store.fail_meeting(&meeting_id, &message);
                    terminal = true;
                }
                Effect::PersistCancelled => {
                    let _ = driver.ctx.store.cancel_meeting(&meeting_id);
                    driver.interrupt_active().await;
                    terminal = true;
                }
            }
        }
        if terminal {
            break;
        }
        match next_ev {
            Some(e) => ev = e,
            None => break,
        }
    }
}

fn fail(ctx: &DriverCtx, meeting_id: &str, message: &str) {
    let _ = ctx.store.fail_meeting(meeting_id, message);
    let _ = ctx.notify.send(crate::events::DomainEvent::MeetingChanged {
        meeting_id: meeting_id.to_string(),
    });
}

struct Driver {
    ctx: DriverCtx,
    meeting_id: String,
    cfg: MeetingConfig,
    /// participant index -> live session id (driver-local cache).
    sessions: HashMap<usize, SessionId>,
    /// participant index -> last persisted session id (resume across restarts).
    resume_targets: HashMap<usize, String>,
    active_session: Option<SessionId>,
}

impl Driver {
    fn emit_changed(&self) {
        let _ = self
            .ctx
            .notify
            .send(crate::events::DomainEvent::MeetingChanged {
                meeting_id: self.meeting_id.clone(),
            });
    }

    /// On resume: the latest persisted session id per participant becomes the
    /// resume target (the session id lives in `meeting_turns` — D-M4-3).
    fn rebuild_sessions_from_turns(&mut self) {
        let Ok(turns) = self.ctx.store.list_meeting_turns(&self.meeting_id) else {
            return;
        };
        for turn in turns {
            let Some(sid) = turn.session_id else { continue };
            if let Some(idx) = self
                .cfg
                .participants
                .iter()
                .position(|p| p.agent_id == turn.agent_id)
            {
                self.resume_targets.insert(idx, sid);
            }
        }
    }

    async fn interrupt_active(&self) {
        if let (Some(provider), Some(sid)) =
            (self.ctx.registry.spawner(), self.active_session.as_ref())
        {
            let _ = provider.interrupt(sid).await;
        }
    }

    /// One turn: ensure session (spawn lazily / resume from persisted id),
    /// persist the turn row (offset at start), send the prompt, await the
    /// completion signal with timeout.
    async fn run_turn(
        &mut self,
        round: u32,
        turn: u32,
        retry: bool,
        cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    ) -> MeetingEvent {
        let participant = self.cfg.participants[turn as usize].clone();
        let Some(provider) = self.ctx.registry.spawner() else {
            return MeetingEvent::TurnFailed("no spawn-capable provider".into());
        };

        let sid = match self.ensure_session(turn as usize).await {
            Ok(sid) => sid,
            Err(e) => return MeetingEvent::TurnFailed(format!("spawn failed: {e}")),
        };
        self.active_session = Some(sid.clone());

        // transcript offset at turn start (no file yet = 0)
        let offset = provider
            .read_transcript(&sid, 0, 0)
            .await
            .map(|p| p.total as i64)
            .unwrap_or(0);

        // persist BEFORE acting (idempotent on resume; refreshes session id)
        let row = match self.ctx.store.start_meeting_turn(
            &self.meeting_id,
            round as i64,
            turn as i64,
            &participant.agent_id,
            Some(&sid.id),
            Some(offset),
        ) {
            Ok(row) => row,
            Err(e) => return MeetingEvent::TurnFailed(format!("persist failed: {e}")),
        };
        if row.session_id.as_deref() != Some(sid.id.as_str()) {
            let _ = self
                .ctx
                .store
                .set_meeting_turn_session(&row.id, &sid.id, offset);
        }

        let prompt = if round == 0 {
            self.gathering_prompt(&participant)
        } else {
            self.round_prompt(round, &participant).await
        };

        // subscribe BEFORE sending so a fast completion is never missed
        let mut rx = self.ctx.registry.aggregate_events();
        if let Err(first) = provider
            .send(
                &sid,
                UserInput {
                    text: prompt.clone(),
                },
            )
            .await
        {
            // dead session (e.g. resumed across an app restart) — respawn once
            self.sessions.remove(&(turn as usize));
            let Ok(new_sid) = self.ensure_session(turn as usize).await else {
                return MeetingEvent::TurnFailed(format!("send failed: {first}"));
            };
            let _ = self
                .ctx
                .store
                .set_meeting_turn_session(&row.id, &new_sid.id, offset);
            self.active_session = Some(new_sid.clone());
            rx = self.ctx.registry.aggregate_events();
            if let Err(e) = provider.send(&new_sid, UserInput { text: prompt }).await {
                return MeetingEvent::TurnFailed(format!("send failed after respawn: {e}"));
            }
            return self
                .await_turn(new_sid, self.cfg.turn_timeout_ms, rx, cancel_rx)
                .await;
        }
        let _ = retry; // retry only re-sends; mechanics identical by design
        self.await_turn(sid, self.cfg.turn_timeout_ms, rx, cancel_rx)
            .await
    }

    /// Turn completion fold: the provider's end-of-turn signal
    /// (`turn-complete` / `turn-error`), session end, or timeout.
    async fn await_turn(
        &self,
        sid: SessionId,
        timeout_ms: u64,
        mut rx: broadcast::Receiver<SessionEvent>,
        cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    ) -> MeetingEvent {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
        loop {
            tokio::select! {
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        return MeetingEvent::Cancel;
                    }
                }
                _ = tokio::time::sleep_until(deadline) => return MeetingEvent::TurnTimedOut,
                ev = rx.recv() => match ev {
                    Ok(SessionEvent::Signal { id, signal }) if id == sid => {
                        match signal.event.as_str() {
                            "turn-complete" | "stop" => return MeetingEvent::TurnDone,
                            "turn-error" => {
                                return MeetingEvent::TurnFailed("turn errored".into())
                            }
                            _ => {}
                        }
                    }
                    Ok(SessionEvent::Updated { meta })
                        if meta.id == sid && meta.status == SessionStatus::Ended =>
                    {
                        return MeetingEvent::TurnFailed("session ended mid-turn".into());
                    }
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => {
                        return MeetingEvent::TurnFailed("event stream closed".into());
                    }
                },
            }
        }
    }

    /// Dedicated per-(meeting, participant) session (D-M4-3): spawned lazily
    /// on first turn at the policy model, resumed (same id) across restarts.
    async fn ensure_session(&mut self, idx: usize) -> anyhow::Result<SessionId> {
        if let Some(sid) = self.sessions.get(&idx) {
            return Ok(sid.clone());
        }
        let provider = self
            .ctx
            .registry
            .spawner()
            .ok_or_else(|| anyhow::anyhow!("no spawn-capable provider"))?;
        let participant = &self.cfg.participants[idx];
        let persona = participant.persona.clone().unwrap_or_else(|| {
            format!(
                "You are {}, an agent participating in a CrewHub meeting. Stay in character.",
                participant.name
            )
        });
        let spec = SpawnSpec {
            project_path: self.cfg.project_path.clone(),
            prompt: None,
            model: Some(self.cfg.participant_model.clone()),
            permission_mode: crate::engine::types::PermissionMode::Default,
            resume_session: self.resume_targets.get(&idx).cloned(),
            fork: false,
            append_system_prompt: Some(persona),
            agent_id: Some(participant.agent_id.clone()),
        };
        let sid = provider.spawn(spec).await?;
        self.sessions.insert(idx, sid.clone());
        self.resume_targets.insert(idx, sid.id.clone());
        Ok(sid)
    }

    fn gathering_prompt(&self, participant: &ParticipantSpec) -> String {
        let mut docs = String::new();
        for path in &self.cfg.context_docs {
            if let Ok(content) = std::fs::read_to_string(path) {
                docs.push_str(&format!(
                    "--- {path} ---\n{}\n",
                    cap_text(&content, DOC_CAP_BYTES)
                ));
            }
        }
        let meeting = self.ctx.store.get_meeting(&self.meeting_id).ok().flatten();
        let title = meeting
            .as_ref()
            .map(|m| m.title.clone())
            .unwrap_or_default();
        let goal = meeting
            .as_ref()
            .and_then(|m| m.goal.clone())
            .unwrap_or_else(|| "reach a useful conclusion".into());
        substitute(
            GATHERING_SCAFFOLD,
            &[
                ("agent_name", participant.name.as_str()),
                ("title", title.as_str()),
                ("goal", goal.as_str()),
                ("context_docs", docs.as_str()),
            ],
        )
        .expect("gathering scaffold slots are fixed")
    }

    /// Discussion-round prompt: the digest carries only the OTHERS' latest
    /// completed turns, read back via transcript offsets (never copied text).
    async fn round_prompt(&self, round: u32, me: &ParticipantSpec) -> String {
        let provider = self.ctx.registry.spawner();
        let turns = self
            .ctx
            .store
            .list_meeting_turns(&self.meeting_id)
            .unwrap_or_default();
        let mut digest = String::new();
        for p in &self.cfg.participants {
            if p.agent_id == me.agent_id {
                continue;
            }
            // latest completed turn (max round, then turn index)
            let latest = turns
                .iter()
                .filter(|t| t.agent_id == p.agent_id && t.completed_at.is_some())
                .max_by_key(|t| (t.round_num, t.turn_index));
            let excerpt = match (latest, provider.as_ref()) {
                (Some(t), Some(prov)) => read_turn_text(prov.as_ref(), t, TURN_CAP_BYTES).await,
                _ => None,
            };
            match excerpt {
                Some(text) if !text.is_empty() => {
                    digest.push_str(&format!("— {}: {}\n", p.name, text));
                }
                _ => digest.push_str(&format!("— {}: (no contribution yet)\n", p.name)),
            }
        }
        let digest = cap_text(&digest, DIGEST_CAP_BYTES);
        let rounds = self.cfg.rounds.to_string();
        let round_s = round.to_string();
        substitute(
            ROUND_SCAFFOLD,
            &[
                ("round", round_s.as_str()),
                ("rounds", rounds.as_str()),
                ("digest", digest.as_str()),
            ],
        )
        .expect("round scaffold slots are fixed")
    }

    /// Synthesis: one headless run at the explicitly upgraded model.
    async fn run_synthesis(
        &mut self,
        cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    ) -> MeetingEvent {
        self.active_session = None;
        let Some(runner) = self.ctx.registry.headless_runner() else {
            return MeetingEvent::SynthesisFailed("no headless-capable provider".into());
        };
        let reader = self.ctx.registry.spawner();
        let turns = self
            .ctx
            .store
            .list_meeting_turns(&self.meeting_id)
            .unwrap_or_default();
        let mut transcript = String::new();
        for t in &turns {
            let name = self
                .cfg
                .participants
                .iter()
                .find(|p| p.agent_id == t.agent_id)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| t.agent_id.clone());
            if t.completed_at.is_none() {
                transcript.push_str(&format!(
                    "### {} (round {}) — did not respond 💤\n",
                    name, t.round_num
                ));
                continue;
            }
            let text = match reader.as_ref() {
                Some(prov) => read_turn_text(prov.as_ref(), t, TURN_CAP_BYTES).await,
                None => None,
            };
            transcript.push_str(&format!(
                "### {} (round {})\n{}\n",
                name,
                t.round_num,
                text.unwrap_or_else(|| "(content unavailable)".into())
            ));
        }
        let meeting = self.ctx.store.get_meeting(&self.meeting_id).ok().flatten();
        let title = meeting
            .as_ref()
            .map(|m| m.title.clone())
            .unwrap_or_default();
        let goal = meeting
            .as_ref()
            .and_then(|m| m.goal.clone())
            .unwrap_or_else(|| "reach a useful conclusion".into());
        let prompt = substitute(
            SYNTHESIS_SCAFFOLD,
            &[
                ("title", title.as_str()),
                ("goal", goal.as_str()),
                ("transcript", transcript.as_str()),
            ],
        )
        .expect("synthesis scaffold slots are fixed");

        let project = std::path::PathBuf::from(&self.cfg.project_path);
        let model = self.cfg.synthesis_model.clone();
        tokio::select! {
            _ = cancel_rx.changed() => MeetingEvent::Cancel,
            res = runner.exec_headless(&project, &prompt, Some(&model)) => match res {
                Ok(exec) if exec.status == "success" => MeetingEvent::SynthesisDone(exec.text),
                Ok(exec) => MeetingEvent::SynthesisFailed(format!(
                    "synthesis run failed: {}",
                    cap_text(&exec.text, 200)
                )),
                Err(e) => MeetingEvent::SynthesisFailed(format!("synthesis exec error: {e}")),
            },
        }
    }

    /// Complete: split output_md from the action-items tail; fuzzy-match
    /// assignees to participants by name; persist (16.3 substrate).
    fn complete_with(&self, text: &str) {
        let (output_md, parsed) = crate::orchestrator::action_items::parse(text);
        let items: Vec<crate::store::meetings::NewActionItem> = parsed
            .into_iter()
            .map(|item| {
                let assignee_agent_id = item.assignee.as_deref().and_then(|name| {
                    let lower = name.to_lowercase();
                    self.cfg
                        .participants
                        .iter()
                        .find(|p| {
                            let pn = p.name.to_lowercase();
                            pn == lower || pn.contains(&lower) || lower.contains(&pn)
                        })
                        .map(|p| p.agent_id.clone())
                });
                crate::store::meetings::NewActionItem {
                    text: item.text,
                    assignee_agent_id,
                    priority: item.priority,
                }
            })
            .collect();
        let _ = self
            .ctx
            .store
            .complete_meeting(&self.meeting_id, &output_md);
        if !items.is_empty() {
            let _ = self.ctx.store.add_action_items(&self.meeting_id, &items);
        }
    }
}

/// Read a turn's content from the provider transcript: items from the turn's
/// start offset, assistant text only, capped with an explicit marker.
async fn read_turn_text(
    provider: &dyn crate::engine::provider::SessionProvider,
    turn: &crate::store::meetings::MeetingTurn,
    cap: usize,
) -> Option<String> {
    let session_id = turn.session_id.as_ref()?;
    let provider_id = provider.id().to_string();
    let sid = SessionId {
        provider: provider_id,
        id: session_id.clone(),
    };
    let offset = turn.transcript_offset.unwrap_or(0).max(0) as u64;
    let page = provider.read_transcript(&sid, offset, 1000).await.ok()?;
    let mut text = String::new();
    for seq_item in page.items {
        if let crate::engine::types::TranscriptItem::AssistantText { text: t, .. } = seq_item.item {
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&t);
        }
    }
    if text.is_empty() {
        None
    } else {
        Some(cap_text(&text, cap))
    }
}

// ---- tests ---------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(n: usize, rounds: u32) -> MeetingConfig {
        MeetingConfig {
            participants: (0..n)
                .map(|i| ParticipantSpec {
                    agent_id: format!("agent-{i}"),
                    name: format!("p{i}"),
                    persona: None,
                })
                .collect(),
            rounds,
            turn_timeout_ms: 1000,
            participant_model: "haiku".into(),
            synthesis_model: "sonnet".into(),
            project_path: "/tmp".into(),
            context_docs: vec![],
            parallel: false,
        }
    }

    fn pos(phase: Phase, turn: u32) -> Position {
        Position {
            phase,
            turn,
            retried: false,
        }
    }

    fn start_turn(round: u32, turn: u32, retry: bool) -> Effect {
        Effect::StartTurn { round, turn, retry }
    }

    /// The flagship table test: a full happy 2-participant, 2-round path.
    #[test]
    fn happy_path_two_participants_two_rounds() {
        let c = cfg(2, 2);
        let mut p = Position::start();

        // Begin -> gathering turn 0, persisted FIRST
        let (p1, fx) = next(&c, &p, &MeetingEvent::Begin);
        assert_eq!(
            fx,
            vec![
                Effect::PersistPosition,
                Effect::EmitChanged,
                start_turn(0, 0, false)
            ]
        );
        p = p1;

        // expected (round, turn) sequence after each TurnDone
        let expected = [(0u32, 1u32), (1, 0), (1, 1), (2, 0), (2, 1)];
        for (round, turn) in expected {
            let (p2, fx) = next(&c, &p, &MeetingEvent::TurnDone);
            assert_eq!(
                fx[0],
                Effect::FinishTurn {
                    round: p.phase.round(),
                    turn: p.turn
                }
            );
            assert!(fx.contains(&Effect::PersistPosition));
            assert_eq!(*fx.last().unwrap(), start_turn(round, turn, false));
            p = p2;
        }

        // last TurnDone -> synthesis
        let (p2, fx) = next(&c, &p, &MeetingEvent::TurnDone);
        assert_eq!(p2.phase, Phase::Synthesis);
        assert_eq!(*fx.last().unwrap(), Effect::StartSynthesis);

        // synthesis done -> complete
        let (p3, fx) = next(&c, &p2, &MeetingEvent::SynthesisDone("## md".into()));
        assert_eq!(p3.phase, Phase::Complete);
        assert_eq!(
            fx[0],
            Effect::CompleteWith {
                text: "## md".into()
            }
        );

        // terminal: events are inert
        let (_, fx) = next(&c, &p3, &MeetingEvent::TurnDone);
        assert!(fx.is_empty());
    }

    #[test]
    fn timeout_gets_exactly_one_retry_then_skip() {
        let c = cfg(3, 1);
        let p = pos(Phase::Gathering, 1);

        // first timeout -> retry same turn, NO position persist (same position)
        let (p1, fx) = next(&c, &p, &MeetingEvent::TurnTimedOut);
        assert!(p1.retried);
        assert_eq!(fx, vec![start_turn(0, 1, true)]);

        // second timeout -> skip: NO FinishTurn, advance to next turn
        let (p2, fx) = next(&c, &p1, &MeetingEvent::TurnTimedOut);
        assert_eq!(p2.turn, 2);
        assert!(!p2.retried);
        assert!(!fx.iter().any(|e| matches!(e, Effect::FinishTurn { .. })));
        assert_eq!(*fx.last().unwrap(), start_turn(0, 2, false));
    }

    #[test]
    fn retry_then_success_finishes_the_turn() {
        let c = cfg(2, 1);
        let p = Position {
            retried: true,
            ..pos(Phase::Round(1), 0)
        };
        let (p1, fx) = next(&c, &p, &MeetingEvent::TurnDone);
        assert_eq!(fx[0], Effect::FinishTurn { round: 1, turn: 0 });
        assert_eq!(p1.turn, 1);
        assert!(!p1.retried);
    }

    #[test]
    fn failure_path_mirrors_timeout() {
        let c = cfg(2, 1);
        let p = pos(Phase::Round(1), 1);
        let (p1, fx) = next(&c, &p, &MeetingEvent::TurnFailed("boom".into()));
        assert!(p1.retried);
        assert_eq!(fx, vec![start_turn(1, 1, true)]);
        // skip on second failure -> last participant of last round -> synthesis
        let (p2, fx) = next(&c, &p1, &MeetingEvent::TurnFailed("boom".into()));
        assert_eq!(p2.phase, Phase::Synthesis);
        assert_eq!(*fx.last().unwrap(), Effect::StartSynthesis);
    }

    #[test]
    fn cancel_mid_await_is_terminal_from_any_phase() {
        let c = cfg(2, 2);
        for phase in [Phase::Gathering, Phase::Round(1), Phase::Synthesis] {
            let (p1, fx) = next(&c, &pos(phase, 0), &MeetingEvent::Cancel);
            assert_eq!(p1.phase, Phase::Cancelled);
            assert_eq!(fx[0], Effect::PersistCancelled);
        }
        // but not from terminal states
        let (_, fx) = next(&c, &pos(Phase::Complete, 0), &MeetingEvent::Cancel);
        assert!(fx.is_empty());
    }

    /// Resume-from-persisted at every (round, turn) position (D-M4-2).
    #[test]
    fn begin_resumes_at_every_position() {
        let c = cfg(3, 2);
        for (phase, turn) in [
            (Phase::Gathering, 0u32),
            (Phase::Gathering, 2),
            (Phase::Round(1), 1),
            (Phase::Round(2), 2),
        ] {
            let (p1, fx) = next(&c, &pos(phase, turn), &MeetingEvent::Begin);
            assert_eq!(p1.phase, phase);
            assert_eq!(p1.turn, turn);
            assert_eq!(fx[0], Effect::PersistPosition, "persist-then-act");
            assert_eq!(*fx.last().unwrap(), start_turn(phase.round(), turn, false));
        }
        let (_, fx) = next(&c, &pos(Phase::Synthesis, 0), &MeetingEvent::Begin);
        assert_eq!(*fx.last().unwrap(), Effect::StartSynthesis);
    }

    #[test]
    fn synthesis_failure_is_error_terminal() {
        let c = cfg(2, 1);
        let (p1, fx) = next(
            &c,
            &pos(Phase::Synthesis, 0),
            &MeetingEvent::SynthesisFailed("rate limited".into()),
        );
        assert_eq!(p1.phase, Phase::Error);
        assert_eq!(
            fx[0],
            Effect::FailWith {
                message: "rate limited".into()
            }
        );
    }

    #[test]
    fn position_roundtrips_through_meeting_row() {
        let m = Meeting {
            id: "m".into(),
            title: "t".into(),
            goal: None,
            state: "round".into(),
            room_id: None,
            project_id: None,
            config_json: None,
            output_md: None,
            output_path: None,
            current_round: Some(2),
            current_turn: Some(1),
            started_at: None,
            completed_at: None,
            cancelled_at: None,
            error_message: None,
        };
        let p = Position::from_meeting(&m);
        assert_eq!(p.phase, Phase::Round(2));
        assert_eq!(p.turn, 1);
        assert!(!p.retried);
    }

    #[test]
    fn cap_text_truncates_with_explicit_marker() {
        assert_eq!(cap_text("short", 100), "short");
        let capped = cap_text(&"x".repeat(100), 10);
        assert!(capped.starts_with("xxxxxxxxxx"));
        assert!(capped.ends_with(TRUNCATION_MARKER));
        // never splits a char
        let capped = cap_text(&"é".repeat(10), 5);
        assert!(capped.ends_with(TRUNCATION_MARKER));
    }

    #[test]
    fn config_defaults_are_cheap_and_serial() {
        let cfg: MeetingConfig = serde_json::from_str(
            r#"{"participants":[],"participant_model":"haiku","synthesis_model":"sonnet","project_path":"/tmp"}"#,
        )
        .unwrap();
        assert_eq!(cfg.rounds, DEFAULT_ROUNDS);
        assert_eq!(cfg.turn_timeout_ms, DEFAULT_TURN_TIMEOUT_MS);
        assert!(!cfg.parallel, "parallel is reserved and defaults off (R5)");
    }
}
