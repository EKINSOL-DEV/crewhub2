//! Docs panel reads (M3 T3, D-M3-7 / G5).
//!
//! The webview has no `fs` permission — these three read-only functions are
//! the ONLY way project docs reach the UI, and every resolved path goes
//! through [`PathPolicy::validate`] against the project's docs root
//! (`docs_path`, falling back to `folder_path`). Whitelisted extensions,
//! depth/count/size caps; symlinks are resolved then revalidated, so a link
//! escaping the root is skipped (tree) or rejected (reads). There are no
//! write commands at all (M3-R5).

use crate::security::paths::{Access, PathPolicy};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Max directory depth listed (entries directly in the root are depth 1).
pub const DOC_TREE_MAX_DEPTH: usize = 6;
/// Max entries returned by [`list_doc_tree`]; the walk stops once reached.
pub const DOC_TREE_MAX_ENTRIES: usize = 2000;
/// Markdown read cap (bytes).
pub const DOC_FILE_MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Image read cap (bytes).
pub const DOC_IMAGE_MAX_BYTES: u64 = 8 * 1024 * 1024;

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];
const IMAGE_EXTENSIONS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("svg", "image/svg+xml"),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DocEntry {
    /// Path relative to the docs root, `/`-separated.
    pub rel_path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DocImage {
    pub media_type: String,
    pub base64: String,
}

fn extension(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_lowercase())
}

fn is_markdown(path: &Path) -> bool {
    extension(path).is_some_and(|e| MARKDOWN_EXTENSIONS.contains(&e.as_str()))
}

fn image_media_type(path: &Path) -> Option<&'static str> {
    let ext = extension(path)?;
    IMAGE_EXTENSIONS
        .iter()
        .find(|(e, _)| *e == ext)
        .map(|(_, mt)| *mt)
}

fn read_policy(root: &Path) -> anyhow::Result<PathPolicy> {
    let mut policy = PathPolicy::default();
    policy.allow(root, Access::Read);
    Ok(policy)
}

/// Resolve `rel_path` under `root` through the path policy. Rejects absolute
/// paths, `..` traversal and symlink escapes (validate canonicalizes).
fn resolve(root: &Path, rel_path: &str) -> anyhow::Result<PathBuf> {
    let rel = Path::new(rel_path);
    if rel.is_absolute() {
        anyhow::bail!("doc path must be relative: {rel_path}");
    }
    Ok(read_policy(root)?.validate(&root.join(rel), Access::Read)?)
}

/// The whitelisted doc tree under `root`: markdown + images + the directories
/// containing them, depth- and count-capped, sorted dirs-first per level.
pub fn list_doc_tree(root: &Path) -> anyhow::Result<Vec<DocEntry>> {
    let policy = read_policy(root)?;
    let canon_root = policy.validate(root, Access::Read)?;
    let mut out = Vec::new();
    walk(&policy, &canon_root, Path::new(""), 1, &mut out)?;
    Ok(out)
}

fn walk(
    policy: &PathPolicy,
    dir: &Path,
    rel: &Path,
    depth: usize,
    out: &mut Vec<DocEntry>,
) -> anyhow::Result<()> {
    if depth > DOC_TREE_MAX_DEPTH {
        return Ok(());
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            // skip dot-entries (.git, .obsidian, …) and anything that fails
            // resolved-symlink revalidation
            p.file_name()
                .map(|n| !n.to_string_lossy().starts_with('.'))
                .unwrap_or(false)
                && policy.validate(p, Access::Read).is_ok()
        })
        .collect();
    entries.sort_by_key(|p| (!p.is_dir(), p.file_name().map(|n| n.to_os_string())));

    for path in entries {
        if out.len() >= DOC_TREE_MAX_ENTRIES {
            return Ok(());
        }
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let entry_rel = rel.join(&*name);
        let rel_str = entry_rel.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            if depth < DOC_TREE_MAX_DEPTH {
                out.push(DocEntry {
                    rel_path: rel_str,
                    name: name.into_owned(),
                    is_dir: true,
                });
                walk(policy, &path, &entry_rel, depth + 1, out)?;
            }
        } else if is_markdown(&path) || image_media_type(&path).is_some() {
            out.push(DocEntry {
                rel_path: rel_str,
                name: name.into_owned(),
                is_dir: false,
            });
        }
    }
    Ok(())
}

/// Read one markdown file (≤ 2 MB) below the docs root.
pub fn read_doc_file(root: &Path, rel_path: &str) -> anyhow::Result<String> {
    let path = resolve(root, rel_path)?;
    if !is_markdown(&path) {
        anyhow::bail!("not a markdown file: {rel_path}");
    }
    let size = std::fs::metadata(&path)?.len();
    if size > DOC_FILE_MAX_BYTES {
        anyhow::bail!("doc file too large: {rel_path} ({size} bytes, cap {DOC_FILE_MAX_BYTES})");
    }
    Ok(std::fs::read_to_string(&path)?)
}

/// Read one image (≤ 8 MB) below the docs root, base64-encoded for the
/// webview's object-URL cache.
pub fn read_doc_image(root: &Path, rel_path: &str) -> anyhow::Result<DocImage> {
    let path = resolve(root, rel_path)?;
    let Some(media_type) = image_media_type(&path) else {
        anyhow::bail!("not a supported image: {rel_path}");
    };
    let size = std::fs::metadata(&path)?.len();
    if size > DOC_IMAGE_MAX_BYTES {
        anyhow::bail!("image too large: {rel_path} ({size} bytes, cap {DOC_IMAGE_MAX_BYTES})");
    }
    let bytes = std::fs::read(&path)?;
    Ok(DocImage {
        media_type: media_type.into(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("README.md"), "# hello").unwrap();
        fs::write(root.join("notes.markdown"), "notes").unwrap();
        fs::write(root.join("logo.png"), b"\x89PNG").unwrap();
        fs::write(root.join("script.sh"), "#!/bin/sh").unwrap(); // not whitelisted
        fs::write(root.join(".hidden.md"), "secret").unwrap(); // dot-entry
        fs::create_dir(root.join("guides")).unwrap();
        fs::write(root.join("guides/a.md"), "a").unwrap();
        dir
    }

    fn rel_paths(entries: &[DocEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.rel_path.as_str()).collect()
    }

    #[test]
    fn happy_tree_lists_whitelisted_entries_dirs_first() {
        let dir = fixture();
        let tree = list_doc_tree(dir.path()).unwrap();
        assert_eq!(
            rel_paths(&tree),
            vec![
                "guides",
                "guides/a.md",
                "README.md",
                "logo.png",
                "notes.markdown"
            ]
        );
        assert!(tree[0].is_dir);
        assert_eq!(tree[1].name, "a.md");
    }

    #[test]
    fn tree_respects_depth_cap() {
        let dir = tempfile::tempdir().unwrap();
        let mut p = dir.path().to_path_buf();
        for i in 1..=8 {
            p = p.join(format!("d{i}"));
            fs::create_dir(&p).unwrap();
            fs::write(p.join("f.md"), "x").unwrap();
        }
        let tree = list_doc_tree(dir.path()).unwrap();
        let deepest = tree
            .iter()
            .map(|e| e.rel_path.matches('/').count())
            .max()
            .unwrap();
        // depth cap 6 ⇒ rel paths have at most 5 separators (d1/…/d5/f.md)
        assert_eq!(deepest, DOC_TREE_MAX_DEPTH - 1);
        assert!(!tree.iter().any(|e| e.rel_path.contains("d6")));
    }

    #[test]
    fn tree_respects_entry_count_cap() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..(DOC_TREE_MAX_ENTRIES + 50) {
            fs::write(dir.path().join(format!("f{i:05}.md")), "x").unwrap();
        }
        let tree = list_doc_tree(dir.path()).unwrap();
        assert_eq!(tree.len(), DOC_TREE_MAX_ENTRIES);
    }

    #[cfg(unix)]
    #[test]
    fn tree_skips_symlinks_escaping_the_root() {
        let dir = fixture();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "leak").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.md"), dir.path().join("link.md"))
            .unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linked-dir")).unwrap();
        let tree = list_doc_tree(dir.path()).unwrap();
        assert!(!rel_paths(&tree).iter().any(|p| p.contains("link")));
    }

    #[test]
    fn read_doc_file_happy_and_guards() {
        let dir = fixture();
        assert_eq!(read_doc_file(dir.path(), "README.md").unwrap(), "# hello");
        assert_eq!(read_doc_file(dir.path(), "guides/a.md").unwrap(), "a");

        // traversal
        let err = read_doc_file(dir.path(), "../etc/passwd").unwrap_err();
        assert!(err.to_string().contains("outside"), "got: {err}");
        // absolute
        let err = read_doc_file(dir.path(), "/etc/passwd").unwrap_err();
        assert!(err.to_string().contains("relative"), "got: {err}");
        // extension whitelist
        let err = read_doc_file(dir.path(), "script.sh").unwrap_err();
        assert!(err.to_string().contains("not a markdown"), "got: {err}");
        // size cap
        fs::write(
            dir.path().join("big.md"),
            vec![b'x'; (DOC_FILE_MAX_BYTES + 1) as usize],
        )
        .unwrap();
        let err = read_doc_file(dir.path(), "big.md").unwrap_err();
        assert!(err.to_string().contains("too large"), "got: {err}");
    }

    #[cfg(unix)]
    #[test]
    fn read_doc_file_rejects_symlink_escape() {
        let dir = fixture();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "leak").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.md"), dir.path().join("link.md"))
            .unwrap();
        let err = read_doc_file(dir.path(), "link.md").unwrap_err();
        assert!(err.to_string().contains("outside"), "got: {err}");
    }

    #[test]
    fn read_doc_image_happy_and_guards() {
        let dir = fixture();
        let img = read_doc_image(dir.path(), "logo.png").unwrap();
        assert_eq!(img.media_type, "image/png");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(img.base64)
                .unwrap(),
            b"\x89PNG"
        );
        let err = read_doc_image(dir.path(), "README.md").unwrap_err();
        assert!(err.to_string().contains("not a supported image"));
        fs::write(
            dir.path().join("huge.png"),
            vec![0u8; (DOC_IMAGE_MAX_BYTES + 1) as usize],
        )
        .unwrap();
        let err = read_doc_image(dir.path(), "huge.png").unwrap_err();
        assert!(err.to_string().contains("too large"), "got: {err}");
    }
}
