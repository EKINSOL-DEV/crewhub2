//! Fenced persona block in a project's `CLAUDE.md` (G9, EKI-32).
//!
//! Same discipline as the hooks installer (`hooks/installer.rs`): everything
//! CrewHub writes is identifiable, install/update is idempotent, and removal
//! restores the user's content **byte-identical** — proven by round-trip
//! tests. Provenance is encoded in the start marker so removal knows whether
//! we created the file or inserted a separating newline:
//!
//! ```text
//! <!-- crewhub:persona:start [created-file|added-newline] -->
//! ...persona...
//! <!-- crewhub:persona:end -->
//! ```

use anyhow::{bail, Context};
use std::path::Path;

const START_PREFIX: &str = "<!-- crewhub:persona:start";
const END_MARKER: &str = "<!-- crewhub:persona:end -->";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provenance {
    /// Block appended to existing content ending in a newline (or empty file).
    Plain,
    /// We inserted one `\n` before the block (file had no trailing newline).
    AddedNewline,
    /// The file did not exist; we created it for the block.
    CreatedFile,
}

fn start_marker(p: Provenance) -> &'static str {
    match p {
        Provenance::Plain => "<!-- crewhub:persona:start -->",
        Provenance::AddedNewline => "<!-- crewhub:persona:start added-newline -->",
        Provenance::CreatedFile => "<!-- crewhub:persona:start created-file -->",
    }
}

/// `(user content with our block removed, recorded provenance)`;
/// `None` when no block is present. Errors on a malformed fence.
fn strip_block(text: &str) -> anyhow::Result<Option<(String, Provenance)>> {
    let Some(start) = text.find(START_PREFIX) else {
        return Ok(None);
    };
    let marker_line_end = text[start..]
        .find("-->")
        .map(|i| start + i + "-->".len())
        .filter(|_| text[start..].starts_with(START_PREFIX));
    let Some(marker_line_end) = marker_line_end else {
        bail!("malformed persona start marker");
    };
    let provenance = match &text[start..marker_line_end] {
        m if m.contains("created-file") => Provenance::CreatedFile,
        m if m.contains("added-newline") => Provenance::AddedNewline,
        _ => Provenance::Plain,
    };
    let Some(end_rel) = text[marker_line_end..].find(END_MARKER) else {
        bail!("persona block has a start marker but no end marker; refusing to modify");
    };
    let mut block_end = marker_line_end + end_rel + END_MARKER.len();
    if text[block_end..].starts_with('\n') {
        block_end += 1; // the newline we always write after the end marker
    }
    let mut before = text[..start].to_string();
    if provenance == Provenance::AddedNewline && before.ends_with('\n') {
        before.pop(); // the separator newline we inserted at install time
    }
    before.push_str(&text[block_end..]);
    Ok(Some((before, provenance)))
}

fn read_optional(path: &Path) -> anyhow::Result<Option<String>> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).with_context(|| format!("reading {}", path.display())),
    }
}

/// Write or update the fenced persona block. Idempotent: re-materializing the
/// same content is a byte-level no-op.
pub fn materialize(path: &Path, content: &str) -> anyhow::Result<()> {
    let existing = read_optional(path)?;
    let (base, previous) = match &existing {
        None => (String::new(), None),
        Some(text) => match strip_block(text)? {
            Some((base, prov)) => (base, Some(prov)),
            None => (text.clone(), None),
        },
    };
    let provenance =
        if existing.is_none() || (previous == Some(Provenance::CreatedFile) && base.is_empty()) {
            Provenance::CreatedFile
        } else if base.is_empty() || base.ends_with('\n') {
            Provenance::Plain
        } else {
            Provenance::AddedNewline
        };
    let sep = if provenance == Provenance::AddedNewline {
        "\n"
    } else {
        ""
    };
    let body = content.trim_end_matches('\n');
    let new = format!(
        "{base}{sep}{}\n{body}\n{END_MARKER}\n",
        start_marker(provenance)
    );
    if existing.as_deref() == Some(new.as_str()) {
        return Ok(()); // idempotent: no rewrite, no mtime churn
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    std::fs::write(path, new).with_context(|| format!("writing {}", path.display()))
}

/// Remove exactly our block. User content is restored byte-identical; a file
/// we created (and that holds nothing else) is deleted again.
pub fn remove(path: &Path) -> anyhow::Result<()> {
    let Some(text) = read_optional(path)? else {
        return Ok(()); // no file, nothing installed
    };
    let Some((restored, provenance)) = strip_block(&text)? else {
        return Ok(()); // nothing of ours: leave the user's file alone
    };
    if provenance == Provenance::CreatedFile && restored.is_empty() {
        std::fs::remove_file(path).with_context(|| format!("removing {}", path.display()))
    } else {
        std::fs::write(path, restored).with_context(|| format!("writing {}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn file(dir: &tempfile::TempDir) -> PathBuf {
        dir.path().join("CONTEXT.md")
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    #[test]
    fn round_trip_restores_user_content_byte_identical() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        let original = "# My project\n\nRules I wrote myself.\n";
        std::fs::write(&path, original).unwrap();

        materialize(&path, "You are a meticulous reviewer.").unwrap();
        let installed = read(&path);
        assert!(installed.starts_with(original));
        assert!(installed.contains("meticulous reviewer"));
        assert!(installed.contains("crewhub:persona:start"));

        remove(&path).unwrap();
        assert_eq!(read(&path), original);
    }

    #[test]
    fn round_trip_without_trailing_newline_is_byte_identical() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        let original = "no trailing newline";
        std::fs::write(&path, original).unwrap();

        materialize(&path, "persona").unwrap();
        assert!(read(&path).contains("added-newline"));
        remove(&path).unwrap();
        assert_eq!(read(&path), original);
    }

    #[test]
    fn missing_file_is_created_then_deleted_on_remove() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        materialize(&path, "persona").unwrap();
        assert!(read(&path).contains("created-file"));
        remove(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn rematerialize_is_idempotent_and_update_replaces_only_our_block() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        std::fs::write(&path, "user text\n").unwrap();

        materialize(&path, "v1").unwrap();
        let first = read(&path);
        materialize(&path, "v1").unwrap();
        assert_eq!(read(&path), first, "same content must be a no-op");

        materialize(&path, "v2\n").unwrap(); // trailing newline normalized
        let second = read(&path);
        assert!(second.starts_with("user text\n"));
        assert!(second.contains("\nv2\n"));
        assert!(!second.contains("v1"));
        // still exactly one block
        assert_eq!(second.matches(START_PREFIX).count(), 1);

        remove(&path).unwrap();
        assert_eq!(read(&path), "user text\n");
    }

    #[test]
    fn user_content_after_the_block_survives() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        std::fs::write(&path, "before\n").unwrap();
        materialize(&path, "persona").unwrap();
        // user appends below our block
        let mut text = read(&path);
        text.push_str("after\n");
        std::fs::write(&path, &text).unwrap();

        materialize(&path, "persona 2").unwrap();
        let updated = read(&path);
        assert!(updated.starts_with("before\nafter\n") || updated.contains("after\n"));

        remove(&path).unwrap();
        assert_eq!(read(&path), "before\nafter\n");
    }

    #[test]
    fn malformed_fence_is_refused_and_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        let broken = "x\n<!-- crewhub:persona:start -->\nno end marker\n";
        std::fs::write(&path, broken).unwrap();
        assert!(materialize(&path, "p").is_err());
        assert!(remove(&path).is_err());
        assert_eq!(read(&path), broken);
    }

    #[test]
    fn remove_without_install_is_a_noop() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(&dir);
        remove(&path).unwrap(); // no file
        assert!(!path.exists());
        std::fs::write(&path, "{not ours}").unwrap();
        remove(&path).unwrap();
        assert_eq!(read(&path), "{not ours}");
    }
}
