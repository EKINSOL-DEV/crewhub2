use super::types::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

pub type ProviderId = &'static str;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct ProviderCaps {
    pub spawn: bool,
    pub resume: bool,
    pub fork: bool,
    pub permissions: bool,
    pub interrupt: bool,
    pub thinking: bool,
    pub subagents: bool,
    pub headless_runs: bool,
    pub hooks: bool,
    pub mcp_registration: bool,
}

#[async_trait::async_trait]
pub trait SessionProvider: Send + Sync + 'static {
    fn id(&self) -> ProviderId;
    fn caps(&self) -> ProviderCaps;
    async fn list_sessions(&self) -> Vec<SessionMeta>;
    async fn spawn(&self, spec: SpawnSpec) -> anyhow::Result<SessionId>;
    async fn send(&self, id: &SessionId, input: UserInput) -> anyhow::Result<()>;
    async fn respond_permission(
        &self,
        id: &SessionId,
        resp: PermissionResponse,
    ) -> anyhow::Result<()>;
    async fn answer_question(&self, id: &SessionId, resp: QuestionResponse) -> anyhow::Result<()>;
    async fn interrupt(&self, id: &SessionId) -> anyhow::Result<()>;
    async fn kill(&self, id: &SessionId) -> anyhow::Result<()>;
    fn subscribe(&self) -> broadcast::Receiver<SessionEvent>;
}

/// Holds every registered provider and fans their event streams into one channel.
///
/// `register` spawns a forwarding task and therefore must be called from within
/// a tokio runtime (tests: `#[tokio::test]`; app: inside `tauri::async_runtime`).
pub struct ProviderRegistry {
    providers: Vec<Arc<dyn SessionProvider>>,
    tx: broadcast::Sender<SessionEvent>,
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self {
            providers: Vec::new(),
            tx,
        }
    }
}

impl ProviderRegistry {
    pub fn register(&mut self, provider: Arc<dyn SessionProvider>) {
        let mut rx = provider.subscribe();
        let tx = self.tx.clone();
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(ev) => {
                        let _ = tx.send(ev);
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });
        self.providers.push(provider);
    }

    pub fn get(&self, id: &str) -> Option<&Arc<dyn SessionProvider>> {
        self.providers.iter().find(|p| p.id() == id)
    }

    pub fn all(&self) -> &[Arc<dyn SessionProvider>] {
        &self.providers
    }

    /// Subscribe to the fan-in of every provider's events.
    pub fn aggregate_events(&self) -> broadcast::Receiver<SessionEvent> {
        self.tx.subscribe()
    }

    pub async fn list_all_sessions(&self) -> Vec<SessionMeta> {
        let mut out = Vec::new();
        for p in &self.providers {
            out.extend(p.list_sessions().await);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Proves the trait is implementable without `engine/claude` — the Codex-readiness test.
    struct TestProvider {
        tx: broadcast::Sender<SessionEvent>,
    }

    impl TestProvider {
        fn new() -> Self {
            let (tx, _) = broadcast::channel(16);
            Self { tx }
        }

        fn meta(&self) -> SessionMeta {
            SessionMeta {
                id: SessionId {
                    provider: "test".into(),
                    id: "s1".into(),
                },
                origin: SessionOrigin::External,
                project_path: "/tmp".into(),
                model: None,
                status: SessionStatus::Idle,
                activity_detail: None,
                parent: None,
                usage: UsageTotals::default(),
                git_branch: None,
                last_activity_ms: 0,
            }
        }
    }

    #[async_trait::async_trait]
    impl SessionProvider for TestProvider {
        fn id(&self) -> ProviderId {
            "test"
        }
        fn caps(&self) -> ProviderCaps {
            ProviderCaps {
                spawn: false,
                ..Default::default()
            }
        }
        async fn list_sessions(&self) -> Vec<SessionMeta> {
            vec![self.meta()]
        }
        async fn spawn(&self, _spec: SpawnSpec) -> anyhow::Result<SessionId> {
            anyhow::bail!("unsupported")
        }
        async fn send(&self, _id: &SessionId, _input: UserInput) -> anyhow::Result<()> {
            Ok(())
        }
        async fn respond_permission(
            &self,
            _id: &SessionId,
            _r: PermissionResponse,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn answer_question(
            &self,
            _id: &SessionId,
            _r: QuestionResponse,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn interrupt(&self, _id: &SessionId) -> anyhow::Result<()> {
            Ok(())
        }
        async fn kill(&self, _id: &SessionId) -> anyhow::Result<()> {
            Ok(())
        }
        fn subscribe(&self) -> broadcast::Receiver<SessionEvent> {
            self.tx.subscribe()
        }
    }

    #[tokio::test]
    async fn registry_fans_in_events_tagged_with_provider() {
        let provider = Arc::new(TestProvider::new());
        let mut registry = ProviderRegistry::default();
        registry.register(provider.clone());
        let mut agg = registry.aggregate_events();

        let meta = provider.meta();
        provider
            .tx
            .send(SessionEvent::Discovered { meta: meta.clone() })
            .unwrap();

        let ev = tokio::time::timeout(std::time::Duration::from_secs(1), agg.recv())
            .await
            .expect("timeout")
            .expect("recv");
        match ev {
            SessionEvent::Discovered { meta: m } => assert_eq!(m.id.provider, "test"),
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn list_all_sessions_aggregates_providers() {
        let mut registry = ProviderRegistry::default();
        registry.register(Arc::new(TestProvider::new()));
        registry.register(Arc::new(TestProvider::new()));
        assert_eq!(registry.list_all_sessions().await.len(), 2);
        assert!(registry.get("test").is_some());
        assert!(registry.get("codex").is_none());
    }
}
