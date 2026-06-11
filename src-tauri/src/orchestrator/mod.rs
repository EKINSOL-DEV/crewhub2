//! Orchestration layer (M4): meetings, standups, scheduler, sequences.
//!
//! This layer COMPOSES the engine rather than extending it: it is
//! provider-neutral, speaks `SessionProvider`/`SessionEvent` only, and
//! persists every state transition BEFORE acting (D-M4-2 — the v1 lesson:
//! an app crash mid-meeting must never orphan a meeting). On boot,
//! [`Orchestrator::recover_on_boot`] scans for non-terminal meetings and
//! resumes them at the persisted position.

pub mod action_items;
pub mod dispatch;
pub mod meeting;
pub mod scheduler;
pub mod standup;
pub mod substitute;

use crate::engine::provider::ProviderRegistry;
use crate::events::DomainEvent;
use crate::store::meetings::{Meeting, NewMeeting};
use crate::store::Store;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, watch};

// ---- model policy (D-M4-3): data in settings, never hardcoded expensive ----

pub const MODEL_POLICY_MEETING_PARTICIPANT_KEY: &str = "model_policy.meeting_participant";
pub const MODEL_POLICY_MEETING_SYNTHESIS_KEY: &str = "model_policy.meeting_synthesis";
pub const MODEL_POLICY_STANDUP_KEY: &str = "model_policy.standup";

/// Gathering/discussion turns run on the cheapest capable tier.
pub const DEFAULT_MEETING_PARTICIPANT_MODEL: &str = "haiku";
/// Synthesis is the ONE explicitly upgraded step — quality compounds there.
pub const DEFAULT_MEETING_SYNTHESIS_MODEL: &str = "sonnet";
/// Standup gathering runs are cheap by default.
pub const DEFAULT_STANDUP_MODEL: &str = "haiku";

/// Resolve a model-policy setting with its default.
pub fn policy_model(store: &Store, key: &str, default: &str) -> String {
    store
        .get_setting(key)
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

/// Everything a driver needs (cloneable bundle).
#[derive(Clone)]
pub(crate) struct DriverCtx {
    pub store: Arc<Store>,
    pub registry: Arc<ProviderRegistry>,
    pub notify: broadcast::Sender<DomainEvent>,
}

struct DriverHandle {
    cancel_tx: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}

/// IPC-facing spec for `start_meeting` (models default from the policy keys;
/// the dialog pre-fills and may override per meeting — D-M4-3).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct StartMeetingSpec {
    pub title: String,
    pub goal: Option<String>,
    pub room_id: Option<String>,
    pub project_id: Option<String>,
    pub project_path: String,
    pub participants: Vec<meeting::ParticipantSpec>,
    pub rounds: Option<u32>,
    pub turn_timeout_ms: Option<u32>,
    pub participant_model: Option<String>,
    pub synthesis_model: Option<String>,
    pub context_docs: Option<Vec<String>>,
}

pub struct Orchestrator {
    store: Arc<Store>,
    registry: Arc<ProviderRegistry>,
    notify: broadcast::Sender<DomainEvent>,
    drivers: Mutex<HashMap<String, DriverHandle>>,
}

impl Orchestrator {
    pub fn new(
        store: Arc<Store>,
        registry: Arc<ProviderRegistry>,
        notify: broadcast::Sender<DomainEvent>,
    ) -> Arc<Self> {
        Arc::new(Self {
            store,
            registry,
            notify,
            drivers: Mutex::new(HashMap::new()),
        })
    }

    fn ctx(&self) -> DriverCtx {
        DriverCtx {
            store: self.store.clone(),
            registry: self.registry.clone(),
            notify: self.notify.clone(),
        }
    }

    /// Boot recovery scan (D-M4-2): resume every non-terminal meeting at its
    /// persisted position. Returns how many were resumed. Must be called
    /// within a tokio runtime.
    pub fn recover_on_boot(self: &Arc<Self>) -> usize {
        // §3.2: executions that died with the app are marked, never resumed —
        // sequences are atomic-or-stopped.
        match self.store.mark_interrupted_run_results() {
            Ok(n) if n > 0 => crate::errlog::error(
                "orchestrator",
                format!("marked {n} interrupted run result(s)"),
            ),
            _ => {}
        }
        let meetings = self.store.list_non_terminal_meetings().unwrap_or_default();
        let n = meetings.len();
        for m in meetings {
            self.spawn_driver(m.id);
        }
        n
    }

    /// Create + persist the meeting, then start its driver. Validation is
    /// strict at the entry: ≥2 participants, `parallel` rejected (R5).
    pub fn start_meeting(self: &Arc<Self>, spec: StartMeetingSpec) -> anyhow::Result<Meeting> {
        anyhow::ensure!(
            spec.participants.len() >= 2,
            "a meeting needs at least 2 participants"
        );
        anyhow::ensure!(
            !spec.project_path.trim().is_empty(),
            "project_path is required"
        );
        let cfg = meeting::MeetingConfig {
            participants: spec.participants,
            rounds: spec.rounds.unwrap_or(meeting::DEFAULT_ROUNDS),
            turn_timeout_ms: spec
                .turn_timeout_ms
                .map(u64::from)
                .unwrap_or(meeting::DEFAULT_TURN_TIMEOUT_MS),
            participant_model: spec.participant_model.unwrap_or_else(|| {
                policy_model(
                    &self.store,
                    MODEL_POLICY_MEETING_PARTICIPANT_KEY,
                    DEFAULT_MEETING_PARTICIPANT_MODEL,
                )
            }),
            synthesis_model: spec.synthesis_model.unwrap_or_else(|| {
                policy_model(
                    &self.store,
                    MODEL_POLICY_MEETING_SYNTHESIS_KEY,
                    DEFAULT_MEETING_SYNTHESIS_MODEL,
                )
            }),
            project_path: spec.project_path,
            context_docs: spec.context_docs.unwrap_or_default(),
            parallel: false, // reserved (R5) — not even accepted over IPC
        };
        let m = self.store.create_meeting(NewMeeting {
            title: spec.title,
            goal: spec.goal,
            room_id: spec.room_id,
            project_id: spec.project_id,
            config_json: Some(serde_json::to_string(&cfg)?),
        })?;
        let _ = self.notify.send(DomainEvent::MeetingChanged {
            meeting_id: m.id.clone(),
        });
        self.spawn_driver(m.id.clone());
        Ok(m)
    }

    /// Cancel: terminal state persisted immediately, in-flight turn
    /// interrupted by the driver (its awaits select on the cancel signal).
    pub fn cancel_meeting(&self, id: &str) -> anyhow::Result<Meeting> {
        let m = self
            .store
            .get_meeting(id)?
            .ok_or_else(|| anyhow::anyhow!("no meeting {id}"))?;
        let terminal = matches!(m.state.as_str(), "complete" | "cancelled" | "error");
        if !terminal {
            self.store.cancel_meeting(id)?;
            let _ = self.notify.send(DomainEvent::MeetingChanged {
                meeting_id: id.to_string(),
            });
        }
        if let Some(handle) = self.drivers.lock().unwrap().remove(id) {
            let _ = handle.cancel_tx.send(true);
        }
        Ok(self.store.get_meeting(id)?.expect("just read"))
    }

    fn spawn_driver(self: &Arc<Self>, meeting_id: String) {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let ctx = self.ctx();
        let id_for_task = meeting_id.clone();
        let this = Arc::downgrade(self);
        let task = tokio::spawn(async move {
            meeting::drive_meeting(ctx, id_for_task.clone(), cancel_rx).await;
            if let Some(orch) = this.upgrade() {
                orch.drivers.lock().unwrap().remove(&id_for_task);
            }
        });
        self.drivers
            .lock()
            .unwrap()
            .insert(meeting_id, DriverHandle { cancel_tx, task });
    }

    /// Abort every driver task WITHOUT touching persisted state — the test
    /// hook for the §3.2 kill-and-resume scenario, and app-shutdown hygiene.
    pub fn shutdown(&self) {
        for (_, handle) in self.drivers.lock().unwrap().drain() {
            handle.task.abort();
        }
    }

    /// True while a driver task is registered for the meeting (test aid).
    pub fn is_driving(&self, meeting_id: &str) -> bool {
        self.drivers.lock().unwrap().contains_key(meeting_id)
    }

    /// Start the owned scheduler loop (17.1, D-M4-4). Call once at boot,
    /// within a tokio runtime.
    pub fn start_scheduler(self: &Arc<Self>) {
        let ctx = self.ctx();
        tokio::spawn(async move {
            let store = ctx.store.clone();
            scheduler::scheduler_loop(store, scheduler::TICK_CAP_MS, move |run| {
                let ctx = ctx.clone();
                async move {
                    dispatch::execute_run(&ctx, &run).await;
                }
            })
            .await;
        });
    }

    /// "Run now": genuinely the same code path as a scheduled firing
    /// (D-M4-5). Returns the newest result row for this firing.
    pub async fn run_now(&self, run_id: &str) -> anyhow::Result<crate::store::runs::RunResult> {
        let run = self
            .store
            .get_run(run_id)?
            .ok_or_else(|| anyhow::anyhow!("no run {run_id}"))?;
        self.store.set_run_last_run_at(run_id, Store::now_ms())?;
        let ctx = self.ctx();
        dispatch::execute_run(&ctx, &run).await;
        self.store
            .list_run_results(run_id)?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("run produced no result row"))
    }

    /// Start a standup (16.4): create the row, fan out one bounded headless
    /// gathering run per agent in the background (D-M4-7). `agent_ids = None`
    /// means every agent.
    pub fn start_standup(
        self: &Arc<Self>,
        agent_ids: Option<Vec<String>>,
        title: Option<String>,
    ) -> anyhow::Result<crate::store::standups::Standup> {
        let all = self.store.list_agents()?;
        let agents: Vec<_> = match &agent_ids {
            Some(ids) => all.into_iter().filter(|a| ids.contains(&a.id)).collect(),
            None => all,
        };
        anyhow::ensure!(!agents.is_empty(), "no agents to ask for a standup");
        let standup = self
            .store
            .create_standup(title.as_deref().unwrap_or("Standup"), Some("human"))?;
        let _ = self.notify.send(DomainEvent::StandupChanged {
            standup_id: standup.id.clone(),
        });
        let ctx = self.ctx();
        let standup_id = standup.id.clone();
        tokio::spawn(async move {
            standup::run_standup_fanout(ctx, standup_id, agents).await;
        });
        Ok(standup)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// D-M4-3: cost discipline as a regression test — the policy DEFAULTS
    /// are cheap; synthesis is the single explicit upgrade.
    #[test]
    fn model_policy_defaults_are_haiku_with_sonnet_synthesis() {
        assert_eq!(DEFAULT_MEETING_PARTICIPANT_MODEL, "haiku");
        assert_eq!(DEFAULT_STANDUP_MODEL, "haiku");
        assert_eq!(DEFAULT_MEETING_SYNTHESIS_MODEL, "sonnet");
        let store = Store::open_in_memory().unwrap();
        assert_eq!(
            policy_model(
                &store,
                MODEL_POLICY_MEETING_PARTICIPANT_KEY,
                DEFAULT_MEETING_PARTICIPANT_MODEL
            ),
            "haiku"
        );
        // settings override wins (data, not code)
        store
            .set_setting(MODEL_POLICY_MEETING_PARTICIPANT_KEY, "sonnet")
            .unwrap();
        assert_eq!(
            policy_model(
                &store,
                MODEL_POLICY_MEETING_PARTICIPANT_KEY,
                DEFAULT_MEETING_PARTICIPANT_MODEL
            ),
            "sonnet"
        );
    }

    #[tokio::test]
    async fn start_meeting_requires_two_participants() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let registry = Arc::new(ProviderRegistry::default());
        let (tx, _) = broadcast::channel(16);
        let orch = Orchestrator::new(store, registry, tx);
        let err = orch
            .start_meeting(StartMeetingSpec {
                title: "t".into(),
                goal: None,
                room_id: None,
                project_id: None,
                project_path: "/tmp".into(),
                participants: vec![meeting::ParticipantSpec {
                    agent_id: "a".into(),
                    name: "a".into(),
                    persona: None,
                }],
                rounds: None,
                turn_timeout_ms: None,
                participant_model: None,
                synthesis_model: None,
                context_docs: None,
            })
            .unwrap_err();
        assert!(err.to_string().contains("at least 2"));
    }

    #[tokio::test]
    async fn start_meeting_persists_policy_models_in_config() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let registry = Arc::new(ProviderRegistry::default());
        let (tx, _) = broadcast::channel(16);
        let orch = Orchestrator::new(store.clone(), registry, tx);
        let m = orch
            .start_meeting(StartMeetingSpec {
                title: "t".into(),
                goal: None,
                room_id: None,
                project_id: None,
                project_path: "/tmp".into(),
                participants: vec![
                    meeting::ParticipantSpec {
                        agent_id: "a".into(),
                        name: "a".into(),
                        persona: None,
                    },
                    meeting::ParticipantSpec {
                        agent_id: "b".into(),
                        name: "b".into(),
                        persona: None,
                    },
                ],
                rounds: None,
                turn_timeout_ms: None,
                participant_model: None,
                synthesis_model: None,
                context_docs: None,
            })
            .unwrap();
        let cfg: meeting::MeetingConfig =
            serde_json::from_str(m.config_json.as_deref().unwrap()).unwrap();
        assert_eq!(cfg.participant_model, "haiku");
        assert_eq!(cfg.synthesis_model, "sonnet");
        assert!(!cfg.parallel);
        // driver will fail it quickly (no provider), but the row exists and
        // cancel works even then
        let cancelled = orch.cancel_meeting(&m.id);
        assert!(cancelled.is_ok());
    }
}
