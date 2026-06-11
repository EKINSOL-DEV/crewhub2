//! Folder picker (M3 T3, D-M3-7 / G4).
//!
//! `tauri-plugin-dialog` is invoked RUST-SIDE only: the webview capability
//! file gains no `dialog:*` permission (same discipline as the M2 handoff
//! shell — see `capabilities/README.md`). The picked path is canonicalized
//! here and becomes a project root via `create_project`, which is what
//! extends the runtime `PathPolicy` (registration is the grant).

use std::path::Path;
use tauri::Runtime;
use tauri_plugin_dialog::DialogExt;

/// Open the native folder picker and return the canonicalized selection
/// (`None` when the user cancels).
pub async fn pick_folder<R: Runtime>(app: &tauri::AppHandle<R>) -> anyhow::Result<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let Some(folder) = rx.await? else {
        return Ok(None);
    };
    let path = folder
        .into_path()
        .map_err(|e| anyhow::anyhow!("folder picker returned a non-path selection: {e}"))?;
    Ok(Some(canonical_dir(&path)?))
}

/// Canonicalize a picked path and insist it is a directory — the same check
/// `create_project` applies, so a stale/odd selection fails here with a
/// readable message instead of registering a broken root.
pub fn canonical_dir(path: &Path) -> anyhow::Result<String> {
    let canon = path
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("folder does not exist: {} ({e})", path.display()))?;
    if !canon.is_dir() {
        anyhow::bail!("not a directory: {}", canon.display());
    }
    Ok(canon.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_dir_resolves_and_requires_directory() {
        let dir = tempfile::tempdir().unwrap();
        let canon = canonical_dir(dir.path()).unwrap();
        assert_eq!(
            canon,
            dir.path().canonicalize().unwrap().display().to_string()
        );

        let err = canonical_dir(&dir.path().join("ghost")).unwrap_err();
        assert!(err.to_string().contains("does not exist"), "got: {err}");

        let file = dir.path().join("f.txt");
        std::fs::write(&file, "x").unwrap();
        let err = canonical_dir(&file).unwrap_err();
        assert!(err.to_string().contains("not a directory"), "got: {err}");
    }
}
