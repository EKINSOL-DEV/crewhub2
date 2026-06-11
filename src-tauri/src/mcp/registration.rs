//! Registers the CrewHub MCP server with the Claude Code CLI (T23, EKI-73).
//!
//! Runs `claude mcp add --transport http crewhub http://127.0.0.1:<port>/mcp
//! --header "Authorization: Bearer <token>"` with the project directory as
//! cwd, so the registration is scoped to that project. The bearer token
//! rotates every app launch, which is why [`refresh`] exists: the lib.rs
//! wiring is expected to call it for each MCP-enabled project at startup.

use std::path::{Path, PathBuf};

use anyhow::Context;

use super::server::MCP_PATH;

/// Name the server is registered under in Claude Code.
pub const SERVER_NAME: &str = "crewhub";

/// How to invoke the Claude Code CLI (mirrors `ClaudeConfig`'s
/// cli_path/extra_env pattern; tests point both at fake-claude).
#[derive(Debug, Clone)]
pub struct McpCliConfig {
    pub cli_path: PathBuf,
    pub extra_env: Vec<(String, String)>,
}

/// Exact argv for `claude mcp add` (binary path excluded).
pub fn add_args(port: u16, token: &str) -> Vec<String> {
    vec![
        "mcp".into(),
        "add".into(),
        "--transport".into(),
        "http".into(),
        SERVER_NAME.into(),
        format!("http://127.0.0.1:{port}{MCP_PATH}"),
        "--header".into(),
        format!("Authorization: Bearer {token}"),
    ]
}

/// Exact argv for `claude mcp remove` (binary path excluded).
pub fn remove_args() -> Vec<String> {
    vec!["mcp".into(), "remove".into(), SERVER_NAME.into()]
}

/// Register the running server for the project at `project_dir`.
pub async fn register(
    cfg: &McpCliConfig,
    project_dir: &Path,
    port: u16,
    token: &str,
) -> anyhow::Result<()> {
    run(cfg, project_dir, add_args(port, token)).await
}

/// Remove the registration for the project at `project_dir`.
pub async fn unregister(cfg: &McpCliConfig, project_dir: &Path) -> anyhow::Result<()> {
    run(cfg, project_dir, remove_args()).await
}

/// Token rotates per launch: drop any stale registration (best effort — it
/// may not exist yet), then add the fresh port + token.
pub async fn refresh(
    cfg: &McpCliConfig,
    project_dir: &Path,
    port: u16,
    token: &str,
) -> anyhow::Result<()> {
    let _ = unregister(cfg, project_dir).await;
    register(cfg, project_dir, port, token).await
}

async fn run(cfg: &McpCliConfig, project_dir: &Path, args: Vec<String>) -> anyhow::Result<()> {
    let output = tokio::process::Command::new(&cfg.cli_path)
        .args(&args)
        .current_dir(project_dir)
        .envs(cfg.extra_env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .with_context(|| format!("spawn {}", cfg.cli_path.display()))?;
    if !output.status.success() {
        anyhow::bail!(
            "`{} {}` failed ({}): {}",
            cfg.cli_path.display(),
            args.join(" "),
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_args_are_exact() {
        assert_eq!(
            add_args(54321, "tok-123"),
            vec![
                "mcp",
                "add",
                "--transport",
                "http",
                "crewhub",
                "http://127.0.0.1:54321/mcp",
                "--header",
                "Authorization: Bearer tok-123",
            ]
        );
    }

    #[test]
    fn remove_args_are_exact() {
        assert_eq!(remove_args(), vec!["mcp", "remove", "crewhub"]);
    }
}
