//! Session handoff to external tools (EKI-80, M2 plan D-M2-8).
//!
//! Security model: the webview never gets shell access. The IPC layer
//! validates the project path against [`crate::security::paths::PathPolicy`]
//! and calls [`execute`], which maps a closed [`HandoffTarget`] enum to a
//! FIXED argv (no user-controlled program or flags — the path is the only
//! variable, always passed as a trailing argument) and runs it Rust-side via
//! `std::process`. No `shell` capability is granted to any window.

use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum HandoffTarget {
    Terminal,
    Iterm,
    Warp,
    Vscode,
    RevealInFinder,
}

/// The exact command line for a target (macOS `open` semantics).
pub fn argv(target: HandoffTarget, path: &Path) -> Vec<String> {
    let path = path.display().to_string();
    let open_app = |app: &str| vec!["open".into(), "-a".into(), app.into(), path.clone()];
    match target {
        HandoffTarget::Terminal => open_app("Terminal"),
        HandoffTarget::Iterm => open_app("iTerm"),
        HandoffTarget::Warp => open_app("Warp"),
        HandoffTarget::Vscode => open_app("Visual Studio Code"),
        HandoffTarget::RevealInFinder => vec!["open".into(), "-R".into(), path],
    }
}

/// Which targets are usable on this machine. `app_dirs` is injectable for
/// tests; production passes [`default_app_dirs`]. Terminal and Finder ship
/// with macOS and are always offered; the rest by app-bundle presence.
pub fn detect_targets(app_dirs: &[PathBuf]) -> Vec<HandoffTarget> {
    let has = |bundle: &str| app_dirs.iter().any(|d| d.join(bundle).exists());
    let mut out = vec![HandoffTarget::Terminal, HandoffTarget::RevealInFinder];
    if has("iTerm.app") {
        out.push(HandoffTarget::Iterm);
    }
    if has("Warp.app") {
        out.push(HandoffTarget::Warp);
    }
    if has("Visual Studio Code.app") {
        out.push(HandoffTarget::Vscode);
    }
    out
}

pub fn default_app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/Applications")];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
    }
    dirs
}

/// Run the handoff. `path` MUST already be validated by the path policy
/// (canonicalized, inside a registered project root).
pub fn execute(target: HandoffTarget, path: &Path) -> anyhow::Result<()> {
    let argv = argv(target, path);
    std::process::Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .with_context(|| format!("handoff: failed to run {argv:?}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// D-M2-8 AC: every target maps to a FIXED argv — the only variable part
    /// is the validated path, always a trailing argument.
    #[test]
    fn argv_snapshot_per_target() {
        let p = Path::new("/projects/demo");
        assert_eq!(
            argv(HandoffTarget::Terminal, p),
            vec!["open", "-a", "Terminal", "/projects/demo"]
        );
        assert_eq!(
            argv(HandoffTarget::Iterm, p),
            vec!["open", "-a", "iTerm", "/projects/demo"]
        );
        assert_eq!(
            argv(HandoffTarget::Warp, p),
            vec!["open", "-a", "Warp", "/projects/demo"]
        );
        assert_eq!(
            argv(HandoffTarget::Vscode, p),
            vec!["open", "-a", "Visual Studio Code", "/projects/demo"]
        );
        assert_eq!(
            argv(HandoffTarget::RevealInFinder, p),
            vec!["open", "-R", "/projects/demo"]
        );
    }

    #[test]
    fn detect_targets_by_bundle_presence() {
        let dir = tempfile::tempdir().unwrap();
        // nothing installed -> the always-available pair
        assert_eq!(
            detect_targets(&[dir.path().to_path_buf()]),
            vec![HandoffTarget::Terminal, HandoffTarget::RevealInFinder]
        );
        std::fs::create_dir(dir.path().join("iTerm.app")).unwrap();
        std::fs::create_dir(dir.path().join("Visual Studio Code.app")).unwrap();
        assert_eq!(
            detect_targets(&[dir.path().to_path_buf()]),
            vec![
                HandoffTarget::Terminal,
                HandoffTarget::RevealInFinder,
                HandoffTarget::Iterm,
                HandoffTarget::Vscode
            ]
        );
    }
}
