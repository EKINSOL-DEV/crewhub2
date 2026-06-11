//! Loopback streamable-HTTP MCP server with a per-launch bearer token (T20, EKI-68).
//!
//! Transport: rmcp's `StreamableHttpService` in stateless mode with direct
//! JSON responses (allowed by the MCP Streamable HTTP spec, 2025-06-18) —
//! every POST to `/mcp` is self-contained, so no session bookkeeping and no
//! SSE framing. An axum middleware rejects any request that does not carry
//! `Authorization: Bearer <token>` with 401 before it reaches the MCP layer.

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use rmcp::transport::streamable_http_server::session::never::NeverSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use tokio::sync::oneshot;

use super::tools::CrewHubMcp;
use crate::store::Store;

/// Path the MCP endpoint is served under; registration (T23) points at it.
pub const MCP_PATH: &str = "/mcp";

/// A running MCP server. Dropping it shuts the listener down.
pub struct McpServer {
    port: u16,
    token: String,
    shutdown: Option<oneshot::Sender<()>>,
}

impl McpServer {
    /// Binds `127.0.0.1` on an OS-assigned port, generates a fresh bearer
    /// token, and serves the CrewHub tools.
    pub async fn start(store: Arc<Store>) -> anyhow::Result<Self> {
        let token = generate_token();
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
        let port = listener.local_addr()?.port();

        let service = StreamableHttpService::new(
            move || Ok(CrewHubMcp::new(store.clone())),
            Arc::new(NeverSessionManager::default()),
            StreamableHttpServerConfig::default()
                .with_stateful_mode(false)
                .with_json_response(true),
        );
        let router = axum::Router::new().route_service(MCP_PATH, service).layer(
            axum::middleware::from_fn_with_state(token.clone(), require_bearer),
        );

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        tokio::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        Ok(Self {
            port,
            token,
            shutdown: Some(shutdown_tx),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    /// Full endpoint URL, e.g. `http://127.0.0.1:54321/mcp`.
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}{MCP_PATH}", self.port)
    }
}

impl Drop for McpServer {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

/// Per-launch token: 64 hex chars (~244 bits of randomness), in memory only.
fn generate_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

async fn require_bearer(State(expected): State<String>, req: Request, next: Next) -> Response {
    let presented = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if constant_time_eq(
        presented.as_bytes(),
        format!("Bearer {expected}").as_bytes(),
    ) {
        next.run(req).await
    } else {
        (StatusCode::UNAUTHORIZED, "missing or invalid bearer token").into_response()
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_long_and_unique_per_call() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn constant_time_eq_matches_equality() {
        assert!(constant_time_eq(b"Bearer x", b"Bearer x"));
        assert!(!constant_time_eq(b"Bearer x", b"Bearer y"));
        assert!(!constant_time_eq(b"Bearer x", b"Bearer xx"));
        assert!(!constant_time_eq(b"", b"Bearer x"));
    }
}
