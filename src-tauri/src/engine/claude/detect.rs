//! CLI detection probe (M6 T2, D-M6-3/G2). Claude Code-specific by nature —
//! the binary name and its known install locations live HERE, behind the
//! naming firewall; `onboarding.rs` only composes the result.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Settings key holding the detected/chosen CLI path. `ClaudeConfig` reads it
/// at startup ([`super::ClaudeConfig::from_settings`]) — the fix for the
/// "non-PATH install silently dies" path (G2).
pub const CLI_PATH_SETTING: &str = "claude.cli_path";

/// Default `--version` probe budget (D-M6-3).
pub const VERSION_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// Known install locations probed after PATH (D-M6-3, in order).
pub fn known_locations(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".claude/local/claude"),
        home.join(".local/bin/claude"),
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ]
}

/// Find the CLI: a `which`-equivalent walk of `path_env`, then the known
/// locations under `home`. Both injectable for tests.
pub fn find_cli(path_env: Option<&std::ffi::OsStr>, home: &Path) -> Option<PathBuf> {
    let name = format!("claude{}", std::env::consts::EXE_SUFFIX);
    if let Some(paths) = path_env {
        for dir in std::env::split_paths(paths) {
            if dir.as_os_str().is_empty() {
                continue;
            }
            let candidate = dir.join(&name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    known_locations(home).into_iter().find(|p| is_executable(p))
}

/// Run `<bin> --version` with a hard timeout; returns the first stdout line.
/// `None` = ran but said nothing / failed / timed out — the path may still be
/// usable, the wizard just can't show a version.
pub fn probe_version(bin: &Path, timeout: Duration) -> Option<String> {
    let mut child = std::process::Command::new(bin)
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut out = String::new();
                use std::io::Read;
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                let line = out.lines().next()?.trim();
                return (!line.is_empty()).then(|| line.to_string());
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return None,
        }
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn fake_bin(dir: &Path, rel: &str, script: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(unix)]
    #[test]
    fn path_walk_wins_over_known_locations() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let on_path = fake_bin(dir.path(), "bin/claude", "echo 9.9.9");
        fake_bin(&home, ".local/bin/claude", "echo 0.0.1");
        let path_env = std::env::join_paths([dir.path().join("bin")]).unwrap();
        assert_eq!(find_cli(Some(&path_env), &home), Some(on_path));
    }

    #[cfg(unix)]
    #[test]
    fn known_locations_probe_in_documented_order() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let late = fake_bin(&home, ".local/bin/claude", "echo b");
        assert_eq!(find_cli(None, &home), Some(late.clone()));
        // an earlier location wins once present
        let early = fake_bin(&home, ".claude/local/claude", "echo a");
        assert_eq!(find_cli(None, &home), Some(early));
        let _ = late;
    }

    #[cfg(unix)]
    #[test]
    fn nothing_found_on_a_fresh_machine() {
        let dir = tempfile::tempdir().unwrap();
        let empty = std::env::join_paths([dir.path().join("nope")]).unwrap();
        assert_eq!(find_cli(Some(&empty), dir.path()), None);
        // a plain non-executable file is not a hit
        std::fs::create_dir_all(dir.path().join(".local/bin")).unwrap();
        std::fs::write(dir.path().join(".local/bin/claude"), "text").unwrap();
        assert_eq!(find_cli(None, dir.path()), None);
    }

    #[cfg(unix)]
    #[test]
    fn version_probe_reads_first_line() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_bin(dir.path(), "claude", "echo '2.1.0 (Claude Code)'");
        assert_eq!(
            probe_version(&bin, VERSION_PROBE_TIMEOUT),
            Some("2.1.0 (Claude Code)".into())
        );
    }

    #[cfg(unix)]
    #[test]
    fn version_probe_times_out_and_kills() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_bin(dir.path(), "claude", "sleep 5; echo never");
        let started = Instant::now();
        assert_eq!(probe_version(&bin, Duration::from_millis(150)), None);
        assert!(
            started.elapsed() < Duration::from_secs(3),
            "must not wait 5s"
        );
    }

    #[cfg(unix)]
    #[test]
    fn version_probe_failure_exit_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_bin(dir.path(), "claude", "exit 1");
        assert_eq!(probe_version(&bin, VERSION_PROBE_TIMEOUT), None);
    }
}
