//! Read-only git awareness (M3 T4, D-M3-5 / G6).
//!
//! Shells out to the `git` CLI with FIXED argv (the `workspace/handoff.rs`
//! precedent: no shell, no interpolation — the validated repo path is only
//! ever the process CWD, never an argument), parses locale-stable porcelain
//! v2, and degrades gracefully: missing binary, not-a-repo and timeouts all
//! surface as [`GitError::Unavailable`] so panels can render "no git info 🤷"
//! instead of an error wall. No write operations exist (master plan Epic 15).

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};

/// Hard wall-clock cap per git invocation (M3-R4).
pub const GIT_TIMEOUT: Duration = Duration::from_secs(2);
/// Per-file patch cap in bytes.
pub const PATCH_FILE_CAP: usize = 256 * 1024;
/// Total patch budget per diff in bytes.
pub const PATCH_TOTAL_CAP: usize = 4 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    /// The graceful-degradation variant: panels hide git UI on this. The
    /// message prefix is a stable contract with `stores/git.ts`.
    #[error("GitUnavailable: {0}")]
    Unavailable(String),
    /// A real failure (e.g. an unknown base ref) — surfaced to the user.
    #[error("git failed: {0}")]
    Command(String),
}

type Result<T> = std::result::Result<T, GitError>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
    pub is_current: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    /// Tracked entries with changes (staged, unstaged or unmerged).
    pub dirty: u32,
    pub untracked: u32,
    pub worktrees: Vec<Worktree>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DiffFile {
    pub path: String,
    /// One-letter porcelain status: A/M/D/R/C/T/U, or "B" for binary.
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub patch: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct GitDiff {
    pub files: Vec<DiffFile>,
    pub truncated: bool,
}

// ---- fixed argv (snapshot-tested, handoff.rs pattern) ----

pub fn status_argv() -> Vec<String> {
    svec(&["status", "--porcelain=v2", "--branch"])
}

pub fn worktree_argv() -> Vec<String> {
    svec(&["worktree", "list", "--porcelain"])
}

/// `kind` is one of `--numstat` / `--name-status` / `--patch`. With no base
/// we diff the working tree against HEAD (staged + unstaged — "what did this
/// session change"); with a base, against `merge-base(base, HEAD)`.
pub fn diff_argv(kind: &str, base: Option<&str>) -> Vec<String> {
    let mut argv = svec(&["diff", kind, "--no-color"]);
    match base {
        Some(base) => {
            argv.push("--merge-base".into());
            argv.push(base.into());
        }
        None => argv.push("HEAD".into()),
    }
    argv
}

pub fn default_base_argv() -> Vec<String> {
    svec(&["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
}

pub fn verify_ref_argv(name: &str) -> Vec<String> {
    svec(&["rev-parse", "--verify", "--quiet", name])
}

fn svec(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| (*s).to_string()).collect()
}

// ---- process runner with timeout ----

fn run_git(cwd: &Path, argv: &[String]) -> Result<String> {
    run_program("git", cwd, argv)
}

fn run_program(program: &str, cwd: &Path, argv: &[String]) -> Result<String> {
    let mut child = std::process::Command::new(program)
        .args(argv)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| GitError::Unavailable(format!("git not runnable: {e}")))?;

    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let out_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let err_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        buf
    });

    let deadline = Instant::now() + GIT_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(GitError::Unavailable(format!(
                    "git timed out after {GIT_TIMEOUT:?} ({})",
                    argv.join(" ")
                )));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(e) => return Err(GitError::Unavailable(format!("git wait failed: {e}"))),
        }
    };
    let stdout = String::from_utf8_lossy(&out_thread.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&err_thread.join().unwrap_or_default()).into_owned();

    if status.success() {
        Ok(stdout)
    } else if stderr.to_lowercase().contains("not a git repository") {
        Err(GitError::Unavailable("not a git repository".into()))
    } else {
        Err(GitError::Command(format!(
            "git {} exited {}: {}",
            argv.first().map(String::as_str).unwrap_or(""),
            status.code().unwrap_or(-1),
            stderr.trim()
        )))
    }
}

/// Refs are the only user-controlled argv element; never let one masquerade
/// as a flag.
fn validate_ref(name: &str) -> Result<()> {
    if name.is_empty() || name.starts_with('-') {
        return Err(GitError::Command(format!("invalid git ref: {name:?}")));
    }
    Ok(())
}

// ---- porcelain parsers (pure, fixture-tested) ----

pub fn parse_status_v2(text: &str) -> GitStatus {
    let mut status = GitStatus {
        branch: String::new(),
        ahead: 0,
        behind: 0,
        dirty: 0,
        untracked: 0,
        worktrees: Vec::new(),
    };
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            status.branch = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    status.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    status.behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") || line.starts_with("u ") {
            status.dirty += 1;
        } else if line.starts_with("? ") {
            status.untracked += 1;
        }
    }
    status
}

/// `git worktree list --porcelain` blocks. `current_path` (canonicalized)
/// marks the worktree the project lives in — longest path-prefix wins, so a
/// session in a nested worktree is labeled with that worktree.
pub fn parse_worktrees(text: &str, current_path: &Path) -> Vec<Worktree> {
    let mut out: Vec<Worktree> = Vec::new();
    for block in text.split("\n\n") {
        let mut path = None;
        let mut branch = None;
        for line in block.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                path = Some(p.trim().to_string());
            } else if let Some(b) = line.strip_prefix("branch ") {
                branch = Some(
                    b.trim()
                        .strip_prefix("refs/heads/")
                        .unwrap_or(b.trim())
                        .to_string(),
                );
            }
        }
        if let Some(path) = path {
            out.push(Worktree {
                path,
                branch,
                is_current: false,
            });
        }
    }
    let current = out
        .iter()
        .enumerate()
        .filter(|(_, w)| current_path.starts_with(&w.path))
        .max_by_key(|(_, w)| w.path.len())
        .map(|(i, _)| i);
    if let Some(i) = current {
        out[i].is_current = true;
    }
    out
}

fn parse_numstat(text: &str) -> Vec<(u32, u32, String, bool)> {
    // additions, deletions, path, is_binary; binary files show "-\t-\tpath"
    text.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let a = parts.next()?;
            let d = parts.next()?;
            let path = parts.next()?.trim();
            // rename numstat paths look like "old => new" or "{a => b}/c"
            let path = path.split(" => ").last().unwrap_or(path);
            let path = path.replace(['{', '}'], "");
            let binary = a == "-";
            Some((a.parse().unwrap_or(0), d.parse().unwrap_or(0), path, binary))
        })
        .collect()
}

fn parse_name_status(text: &str) -> Vec<(String, String)> {
    // (status letter, path) — rename/copy lines carry old\tnew, keep new.
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let code = parts.next()?.trim();
            let last = parts.next_back()?.trim();
            let letter = code.chars().next()?.to_string();
            Some((letter, last.to_string()))
        })
        .collect()
}

/// Split a full `git diff` output into per-file patches keyed by the b-side
/// path of the `diff --git a/<a> b/<b>` header.
fn split_patches(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut current: Option<(String, String)> = None;
    for line in text.lines() {
        if let Some(header) = line.strip_prefix("diff --git ") {
            if let Some(file) = current.take() {
                out.push(file);
            }
            let b_path = header
                .rsplit_once(" b/")
                .map(|(_, b)| b.to_string())
                .unwrap_or_else(|| header.to_string());
            current = Some((b_path, String::new()));
        }
        if let Some((_, patch)) = current.as_mut() {
            patch.push_str(line);
            patch.push('\n');
        }
    }
    if let Some(file) = current.take() {
        out.push(file);
    }
    out
}

// ---- public API ----

/// Branch, ahead/behind, dirty/untracked counts and the repo's worktrees.
pub fn git_status(project_path: &Path) -> Result<GitStatus> {
    let mut status = parse_status_v2(&run_git(project_path, &status_argv())?);
    // worktree listing is best-effort: a failure never hides the status strip
    if let Ok(text) = run_git(project_path, &worktree_argv()) {
        let canon = project_path
            .canonicalize()
            .unwrap_or_else(|_| project_path.to_path_buf());
        status.worktrees = parse_worktrees(&text, &canon);
    }
    Ok(status)
}

/// Working-tree diff (vs HEAD), or vs `merge-base(base, HEAD)` when `base`
/// is given. Per-file patches capped at 256 KB, 4 MB total (`truncated`).
pub fn git_diff(project_path: &Path, base: Option<&str>) -> Result<GitDiff> {
    if let Some(base) = base {
        validate_ref(base)?;
    }
    let numstat = parse_numstat(&run_git(project_path, &diff_argv("--numstat", base))?);
    let name_status = parse_name_status(&run_git(project_path, &diff_argv("--name-status", base))?);
    let patches = split_patches(&run_git(project_path, &diff_argv("--patch", base))?);

    let mut truncated = false;
    let mut budget = PATCH_TOTAL_CAP;
    let files = numstat
        .into_iter()
        .map(|(additions, deletions, path, binary)| {
            let status = if binary {
                "B".to_string()
            } else {
                name_status
                    .iter()
                    .find(|(_, p)| *p == path)
                    .map(|(s, _)| s.clone())
                    .unwrap_or_else(|| "M".into())
            };
            let mut patch = patches
                .iter()
                .find(|(p, _)| *p == path)
                .map(|(_, body)| body.clone())
                .unwrap_or_default();
            if patch.len() > PATCH_FILE_CAP {
                patch.truncate(floor_char_boundary(&patch, PATCH_FILE_CAP));
                truncated = true;
            }
            if patch.len() > budget {
                patch.clear();
                truncated = true;
            } else {
                budget -= patch.len();
            }
            DiffFile {
                path,
                status,
                additions,
                deletions,
                patch,
            }
        })
        .collect();
    Ok(GitDiff { files, truncated })
}

fn floor_char_boundary(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// The diff panel's "vs base" default: `origin/HEAD` when known, else a
/// `main`/`master` probe, else `None` (working-tree-only repos).
pub fn git_default_base(project_path: &Path) -> Result<Option<String>> {
    match run_git(project_path, &default_base_argv()) {
        Ok(name) if !name.trim().is_empty() => return Ok(Some(name.trim().to_string())),
        Err(GitError::Unavailable(e)) => return Err(GitError::Unavailable(e)),
        _ => {}
    }
    for candidate in ["main", "master"] {
        if run_git(project_path, &verify_ref_argv(candidate)).is_ok() {
            return Ok(Some(candidate.to_string()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- pure: argv snapshots (D-M3-5 AC) ----

    #[test]
    fn argv_snapshots_are_fixed() {
        assert_eq!(status_argv(), ["status", "--porcelain=v2", "--branch"]);
        assert_eq!(worktree_argv(), ["worktree", "list", "--porcelain"]);
        assert_eq!(
            diff_argv("--numstat", None),
            ["diff", "--numstat", "--no-color", "HEAD"]
        );
        assert_eq!(
            diff_argv("--patch", Some("origin/main")),
            [
                "diff",
                "--patch",
                "--no-color",
                "--merge-base",
                "origin/main"
            ]
        );
        assert_eq!(
            default_base_argv(),
            ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]
        );
        assert_eq!(
            verify_ref_argv("main"),
            ["rev-parse", "--verify", "--quiet", "main"]
        );
    }

    #[test]
    fn refs_may_not_look_like_flags() {
        let dir = tempfile::tempdir().unwrap();
        let err = git_diff(dir.path(), Some("--output=/tmp/x")).unwrap_err();
        assert!(err.to_string().contains("invalid git ref"), "got: {err}");
    }

    // ---- pure: parsers ----

    #[test]
    fn parses_porcelain_v2_status() {
        let text = "\
# branch.oid 1234abcd
# branch.head feat/x
# branch.upstream origin/feat/x
# branch.ab +2 -1
1 .M N... 100644 100644 100644 aaaa bbbb src/lib.rs
1 M. N... 100644 100644 100644 cccc dddd src/main.rs
2 R. N... 100644 100644 100644 eeee ffff R100 new.rs\told.rs
u UU N... 100644 100644 100644 100644 gggg hhhh conflicted.rs
? scratch.txt
? notes.md
! target/
";
        let s = parse_status_v2(text);
        assert_eq!(s.branch, "feat/x");
        assert_eq!(s.ahead, 2);
        assert_eq!(s.behind, 1);
        assert_eq!(s.dirty, 4);
        assert_eq!(s.untracked, 2);
    }

    #[test]
    fn parses_detached_head_and_clean_tree() {
        let s = parse_status_v2("# branch.oid 1234\n# branch.head (detached)\n");
        assert_eq!(s.branch, "(detached)");
        assert_eq!((s.ahead, s.behind, s.dirty, s.untracked), (0, 0, 0, 0));
    }

    #[test]
    fn parses_worktree_blocks_and_marks_current_by_longest_prefix() {
        let text = "\
worktree /repo
HEAD aaaa
branch refs/heads/main

worktree /repo/.claude/worktrees/feat-x
HEAD bbbb
branch refs/heads/feat-x

worktree /repo-detached
HEAD cccc
detached
";
        let wts = parse_worktrees(text, Path::new("/repo/.claude/worktrees/feat-x/sub"));
        assert_eq!(wts.len(), 3);
        assert_eq!(wts[0].branch.as_deref(), Some("main"));
        assert!(!wts[0].is_current);
        assert!(wts[1].is_current, "longest prefix wins");
        assert_eq!(wts[1].branch.as_deref(), Some("feat-x"));
        assert_eq!(wts[2].branch, None);
    }

    #[test]
    fn splits_patches_per_file() {
        let text = "\
diff --git a/src/a.rs b/src/a.rs
index 111..222 100644
--- a/src/a.rs
+++ b/src/a.rs
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
new file mode 100644
";
        let patches = split_patches(text);
        assert_eq!(patches.len(), 2);
        assert_eq!(patches[0].0, "src/a.rs");
        assert!(patches[0].1.contains("+new"));
        assert_eq!(patches[1].0, "b.txt");
    }

    // ---- fixture repos (skipped when git is absent; CI has it) ----

    fn git_available() -> bool {
        std::process::Command::new("git")
            .arg("--version")
            .output()
            .is_ok()
    }

    fn sh_git(dir: &Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .current_dir(dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed in {dir:?}");
    }

    fn repo_with_commit() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        sh_git(dir.path(), &["init", "-b", "main"]);
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        sh_git(dir.path(), &["add", "."]);
        sh_git(dir.path(), &["commit", "-m", "init"]);
        dir
    }

    #[test]
    fn status_reports_branch_dirty_untracked_and_worktrees() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let dir = repo_with_commit();
        std::fs::write(dir.path().join("a.txt"), "changed\n").unwrap();
        std::fs::write(dir.path().join("new.txt"), "x\n").unwrap();
        // linked worktree OUTSIDE the repo dir, or it would count as untracked
        let wt_parent = tempfile::tempdir().unwrap();
        let wt = wt_parent.path().join("wt-feat");
        sh_git(
            dir.path(),
            &["worktree", "add", wt.to_str().unwrap(), "-b", "feat-x"],
        );

        let s = git_status(dir.path()).unwrap();
        assert_eq!(s.branch, "main");
        assert_eq!(s.dirty, 1);
        assert_eq!(s.untracked, 1);
        assert_eq!(s.worktrees.len(), 2);
        let current: Vec<_> = s.worktrees.iter().filter(|w| w.is_current).collect();
        assert_eq!(current.len(), 1);
        assert_eq!(current[0].branch.as_deref(), Some("main"));

        // and from inside the linked worktree, that one is current
        let s2 = git_status(&wt).unwrap();
        let current: Vec<_> = s2.worktrees.iter().filter(|w| w.is_current).collect();
        assert_eq!(current[0].branch.as_deref(), Some("feat-x"));
    }

    #[test]
    fn diff_reports_working_tree_changes_and_vs_base() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let dir = repo_with_commit();
        std::fs::write(dir.path().join("a.txt"), "one\ntwo\n").unwrap();

        let d = git_diff(dir.path(), None).unwrap();
        assert!(!d.truncated);
        assert_eq!(d.files.len(), 1);
        assert_eq!(d.files[0].path, "a.txt");
        assert_eq!(d.files[0].status, "M");
        assert_eq!(d.files[0].additions, 1);
        assert!(d.files[0].patch.contains("+two"));

        // commit onto a branch, diff vs main via merge-base
        sh_git(dir.path(), &["checkout", "-q", "-b", "feat"]);
        sh_git(dir.path(), &["add", "."]);
        sh_git(dir.path(), &["commit", "-m", "two"]);
        let clean = git_diff(dir.path(), None).unwrap();
        assert!(clean.files.is_empty(), "tree is clean vs HEAD");
        let vs_main = git_diff(dir.path(), Some("main")).unwrap();
        assert_eq!(vs_main.files.len(), 1);
        assert!(vs_main.files[0].patch.contains("+two"));

        // unknown base is a Command error, not Unavailable
        let err = git_diff(dir.path(), Some("no-such-ref")).unwrap_err();
        assert!(matches!(err, GitError::Command(_)), "got: {err}");
    }

    #[test]
    fn oversized_patches_truncate_with_flag() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let dir = repo_with_commit();
        let big: String = (0..40_000).map(|i| format!("line {i}\n")).collect();
        std::fs::write(dir.path().join("a.txt"), big).unwrap();
        let d = git_diff(dir.path(), None).unwrap();
        assert!(d.truncated);
        assert!(d.files[0].patch.len() <= PATCH_FILE_CAP);
    }

    #[test]
    fn default_base_probes_main_without_origin() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let dir = repo_with_commit();
        assert_eq!(
            git_default_base(dir.path()).unwrap().as_deref(),
            Some("main")
        );
    }

    #[test]
    fn ahead_behind_against_a_real_upstream() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let origin = repo_with_commit();
        let dir = tempfile::tempdir().unwrap();
        let clone = dir.path().join("clone");
        sh_git(
            dir.path(),
            &["clone", "-q", origin.path().to_str().unwrap(), "clone"],
        );
        std::fs::write(clone.join("b.txt"), "x\n").unwrap();
        sh_git(&clone, &["add", "."]);
        sh_git(&clone, &["commit", "-m", "local"]);
        let s = git_status(&clone).unwrap();
        assert_eq!((s.ahead, s.behind), (1, 0));
        // clone sets origin/HEAD, so the default base is the remote head
        assert_eq!(
            git_default_base(&clone).unwrap().as_deref(),
            Some("origin/main")
        );
    }

    #[test]
    fn non_repo_and_missing_binary_are_unavailable() {
        if !git_available() {
            eprintln!("skipping: git not on PATH");
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let err = git_status(dir.path()).unwrap_err();
        assert!(matches!(err, GitError::Unavailable(_)), "got: {err}");
        assert!(err.to_string().starts_with("GitUnavailable:"));

        let err = run_program("definitely-not-git-xyz", dir.path(), &status_argv()).unwrap_err();
        assert!(matches!(err, GitError::Unavailable(_)), "got: {err}");
    }
}
