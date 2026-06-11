//! Fenced, idempotent management of CrewHub's hook entries in the agent
//! runtime's settings file (Claude Code's `~/.claude/settings.json`; path
//! injectable — see the naming-firewall note in [`crate::hooks`]).
//!
//! Everything CrewHub adds is identifiable without markers around user data:
//! - one top-level marker key [`MANAGED_KEY`] holding version + provenance,
//! - hook entries whose `command` starts with the absolute path to the
//!   `crewhub-signal` binary.
//!
//! `uninstall` removes exactly those, restoring the user's file byte-identical
//! to its pre-install content for files in canonical form (pretty-printed,
//! the form `install` itself writes). Non-canonical user formatting survives
//! install/uninstall JSON-equal but re-serialized. Corrupted JSON is never
//! touched: both operations refuse with an error.
//!
//! IPC commands exposing install/uninstall/status land with the debug panel
//! wiring (M1 T24 lane).

use anyhow::{bail, Context};
use serde_json::{json, Map, Value};
use std::path::PathBuf;

/// Top-level settings key marking a CrewHub-managed installation.
pub const MANAGED_KEY: &str = "//crewhub-managed";

/// Hook events CrewHub wires up, with their matcher (None = all matches).
const EVENTS: &[(&str, Option<&str>)] = &[
    ("SessionStart", None),
    ("PreToolUse", Some("Edit|Write|MultiEdit|Bash")),
    ("PostToolUse", None),
    ("Stop", None),
    ("SubagentStop", None),
    ("Notification", None),
];

pub struct HookInstaller {
    settings_path: PathBuf,
    /// Absolute path to the `crewhub-signal` binary; every command we install
    /// starts with it, which is what tags an entry as ours.
    signal_bin: PathBuf,
}

impl HookInstaller {
    pub fn new(settings_path: impl Into<PathBuf>, signal_bin: impl Into<PathBuf>) -> Self {
        Self {
            settings_path: settings_path.into(),
            signal_bin: signal_bin.into(),
        }
    }

    /// Install (or refresh) our hook entries. Idempotent: a second install is
    /// a byte-level no-op. Missing file → minimal one is created. Corrupted
    /// JSON → error, file untouched.
    pub fn install(&self) -> anyhow::Result<()> {
        let root = self.read_settings()?.unwrap_or_default();
        let root = self.installed_form(root)?;
        self.write(&root)
    }

    /// Pure preview (M6 T1, D-M6-1): `(before, after)` — the settings file's
    /// current text and the exact text `install` would write. Touches nothing
    /// on disk; the wizard renders a real diff from this. Corrupted JSON →
    /// error, same refusal as `install`.
    pub fn preview(&self) -> anyhow::Result<(String, String)> {
        let before = match std::fs::read_to_string(&self.settings_path) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => {
                return Err(e).with_context(|| format!("reading {}", self.settings_path.display()))
            }
        };
        let root = self.read_settings()?.unwrap_or_default();
        let after = to_canonical(&self.installed_form(root)?);
        Ok((before, after))
    }

    /// The post-install settings map: strip any prior managed entries, then
    /// add ours fresh. Shared by [`Self::install`] and [`Self::preview`] so
    /// the preview is byte-exact by construction.
    fn installed_form(&self, mut root: Map<String, Value>) -> anyhow::Result<Map<String, Value>> {
        let prefixes = self.signal_prefixes(&root);
        strip_managed(&mut root, &prefixes);

        let signal = self.signal_bin.display().to_string();
        let created_hooks_key = !root.contains_key("hooks");
        let hooks_value = root.entry("hooks").or_insert_with(|| json!({}));
        let Value::Object(hooks) = hooks_value else {
            bail!(
                "\"hooks\" in {} is not an object; refusing to modify",
                self.settings_path.display()
            );
        };
        let mut created_events: Vec<Value> = Vec::new();
        for (event, matcher) in EVENTS {
            if !hooks.contains_key(*event) {
                created_events.push(json!(event));
                hooks.insert((*event).to_string(), json!([]));
            }
            let Some(Value::Array(groups)) = hooks.get_mut(*event) else {
                bail!(
                    "\"hooks\".\"{event}\" in {} is not an array; refusing to modify",
                    self.settings_path.display()
                );
            };
            let mut group = Map::new();
            if let Some(matcher) = matcher {
                group.insert("matcher".into(), json!(matcher));
            }
            group.insert(
                "hooks".into(),
                json!([{ "type": "command", "command": signal }]),
            );
            groups.push(Value::Object(group));
        }
        root.insert(
            MANAGED_KEY.into(),
            json!({
                "version": 1,
                "signal": signal,
                // Provenance so uninstall removes only structure WE created.
                "created": { "hooks_key": created_hooks_key, "events": created_events },
            }),
        );
        Ok(root)
    }

    /// Remove exactly our entries. No-op when nothing of ours is present.
    pub fn uninstall(&self) -> anyhow::Result<()> {
        let Some(mut root) = self.read_settings()? else {
            return Ok(()); // no file, nothing installed
        };
        let prefixes = self.signal_prefixes(&root);
        if !strip_managed(&mut root, &prefixes) {
            return Ok(()); // nothing of ours: leave the user's file alone
        }
        self.write(&root)
    }

    /// Status query: is our managed block present? Corrupted file → error.
    pub fn is_installed(&self) -> anyhow::Result<bool> {
        Ok(self
            .read_settings()?
            .is_some_and(|root| root.contains_key(MANAGED_KEY)))
    }

    /// Command prefixes that tag an entry as ours: the configured binary path
    /// plus the path recorded at install time (survives binary relocation).
    fn signal_prefixes(&self, root: &Map<String, Value>) -> Vec<String> {
        let mut prefixes = vec![self.signal_bin.display().to_string()];
        if let Some(recorded) = root
            .get(MANAGED_KEY)
            .and_then(|m| m.get("signal"))
            .and_then(Value::as_str)
        {
            if !prefixes.iter().any(|p| p == recorded) {
                prefixes.push(recorded.to_string());
            }
        }
        prefixes
    }

    fn read_settings(&self) -> anyhow::Result<Option<Map<String, Value>>> {
        let text = match std::fs::read_to_string(&self.settings_path) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(e).with_context(|| format!("reading {}", self.settings_path.display()))
            }
        };
        let value: Value = serde_json::from_str(&text).with_context(|| {
            format!(
                "{} is not valid JSON; refusing to modify it",
                self.settings_path.display()
            )
        })?;
        match value {
            Value::Object(map) => Ok(Some(map)),
            _ => bail!(
                "{} root is not a JSON object; refusing to modify it",
                self.settings_path.display()
            ),
        }
    }

    fn write(&self, root: &Map<String, Value>) -> anyhow::Result<()> {
        let bytes = to_canonical(root);
        if std::fs::read(&self.settings_path).is_ok_and(|current| current == bytes.as_bytes()) {
            return Ok(()); // idempotent: no rewrite, no mtime churn
        }
        if let Some(parent) = self.settings_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating {}", parent.display()))?;
        }
        std::fs::write(&self.settings_path, bytes)
            .with_context(|| format!("writing {}", self.settings_path.display()))
    }
}

/// The canonical serialization `install` writes and `uninstall` restores.
fn to_canonical(root: &Map<String, Value>) -> String {
    let mut out = serde_json::to_string_pretty(&Value::Object(root.clone()))
        .expect("settings serialize cannot fail");
    out.push('\n');
    out
}

/// Remove the marker key and every hook entry tagged as ours; drop emptied
/// groups, plus event arrays / the hooks object **only if we created them**
/// (per recorded provenance). Returns whether anything changed.
fn strip_managed(root: &mut Map<String, Value>, signal_prefixes: &[String]) -> bool {
    let provenance = root.remove(MANAGED_KEY);
    let mut changed = provenance.is_some();
    let created = provenance.as_ref().and_then(|p| p.get("created"));
    let created_hooks_key = created
        .and_then(|c| c.get("hooks_key"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let created_events: Vec<&str> = created
        .and_then(|c| c.get("events"))
        .and_then(Value::as_array)
        .map(|events| events.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    if let Some(Value::Object(hooks)) = root.get_mut("hooks") {
        let event_keys: Vec<String> = hooks.keys().cloned().collect();
        for key in event_keys {
            let Some(Value::Array(groups)) = hooks.get_mut(&key) else {
                continue;
            };
            for group in groups.iter_mut() {
                if let Some(Value::Array(commands)) = group.get_mut("hooks") {
                    let before = commands.len();
                    commands.retain(|hook| !is_ours(hook, signal_prefixes));
                    changed |= commands.len() != before;
                }
            }
            // A group whose hook list we emptied was one we added wholesale.
            groups.retain(|group| {
                group
                    .get("hooks")
                    .and_then(Value::as_array)
                    .is_none_or(|hooks| !hooks.is_empty())
            });
            if groups.is_empty() && created_events.contains(&key.as_str()) {
                hooks.remove(&key);
            }
        }
        if hooks.is_empty() && created_hooks_key {
            root.remove("hooks");
        }
    }
    changed
}

fn is_ours(hook: &Value, signal_prefixes: &[String]) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .is_some_and(|command| signal_prefixes.iter().any(|p| command.starts_with(p)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const SIGNAL: &str = "/Applications/CrewHub.app/Contents/MacOS/crewhub-signal";

    fn setup() -> (tempfile::TempDir, HookInstaller) {
        let dir = tempfile::tempdir().unwrap();
        let installer = HookInstaller::new(dir.path().join("settings.json"), SIGNAL);
        (dir, installer)
    }

    fn settings_path(dir: &tempfile::TempDir) -> PathBuf {
        dir.path().join("settings.json")
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    fn parse(path: &Path) -> Value {
        serde_json::from_str(&read(path)).unwrap()
    }

    /// Pre-install fixture in the canonical form the installer writes.
    fn canonical(value: Value) -> String {
        let mut out = serde_json::to_string_pretty(&value).unwrap();
        out.push('\n');
        out
    }

    fn user_settings_with_hooks() -> Value {
        json!({
            "model": "opus",
            "env": { "FOO": "bar" },
            "hooks": {
                "PreToolUse": [
                    { "matcher": "Bash", "hooks": [
                        { "type": "command", "command": "/usr/local/bin/my-linter --check" }
                    ]}
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": "say done" } ] }
                ]
            }
        })
    }

    fn our_commands(value: &Value, event: &str) -> usize {
        value["hooks"][event]
            .as_array()
            .map(|groups| {
                groups
                    .iter()
                    .flat_map(|g| g["hooks"].as_array().cloned().unwrap_or_default())
                    .filter(|h| h["command"].as_str().is_some_and(|c| c.starts_with(SIGNAL)))
                    .count()
            })
            .unwrap_or(0)
    }

    #[test]
    fn missing_file_creates_minimal_settings_with_all_events() {
        let (dir, installer) = setup();
        installer.install().unwrap();
        let value = parse(&settings_path(&dir));
        assert!(value.get(MANAGED_KEY).is_some());
        for (event, _) in EVENTS {
            assert_eq!(our_commands(&value, event), 1, "missing {event}");
        }
        assert_eq!(
            value["hooks"]["PreToolUse"][0]["matcher"],
            "Edit|Write|MultiEdit|Bash"
        );
        assert!(installer.is_installed().unwrap());
    }

    #[test]
    fn install_is_idempotent() {
        let (dir, installer) = setup();
        std::fs::write(settings_path(&dir), canonical(user_settings_with_hooks())).unwrap();
        installer.install().unwrap();
        let first = read(&settings_path(&dir));
        installer.install().unwrap();
        assert_eq!(read(&settings_path(&dir)), first);
        let value = parse(&settings_path(&dir));
        for (event, _) in EVENTS {
            assert_eq!(our_commands(&value, event), 1, "duplicated {event}");
        }
    }

    #[test]
    fn uninstall_restores_user_file_byte_identical() {
        let (dir, installer) = setup();
        let original = canonical(user_settings_with_hooks());
        std::fs::write(settings_path(&dir), &original).unwrap();

        installer.install().unwrap();
        assert_ne!(read(&settings_path(&dir)), original);
        let installed = parse(&settings_path(&dir));
        // User entries coexist with ours inside the same event arrays.
        assert!(installed["hooks"]["PreToolUse"]
            .as_array()
            .unwrap()
            .iter()
            .any(|g| g["hooks"][0]["command"] == "/usr/local/bin/my-linter --check"));

        installer.uninstall().unwrap();
        assert_eq!(read(&settings_path(&dir)), original);
        assert!(!installer.is_installed().unwrap());
    }

    #[test]
    fn uninstall_restores_file_without_hooks_key_byte_identical() {
        let (dir, installer) = setup();
        let original = canonical(json!({ "theme": "dark" }));
        std::fs::write(settings_path(&dir), &original).unwrap();

        installer.install().unwrap();
        assert!(parse(&settings_path(&dir)).get("hooks").is_some());
        installer.uninstall().unwrap();
        assert_eq!(read(&settings_path(&dir)), original);
    }

    #[test]
    fn corrupted_json_is_refused_and_untouched() {
        let (dir, installer) = setup();
        let corrupt = "{ \"hooks\": [oops";
        std::fs::write(settings_path(&dir), corrupt).unwrap();

        assert!(installer.install().is_err());
        assert_eq!(read(&settings_path(&dir)), corrupt);
        assert!(installer.uninstall().is_err());
        assert_eq!(read(&settings_path(&dir)), corrupt);
        assert!(installer.is_installed().is_err());
    }

    #[test]
    fn uninstall_without_install_leaves_file_alone() {
        let (dir, installer) = setup();
        // Deliberately NOT canonical: proves we don't even rewrite it.
        let original = "{\"model\":\"opus\"}";
        std::fs::write(settings_path(&dir), original).unwrap();
        installer.uninstall().unwrap();
        assert_eq!(read(&settings_path(&dir)), original);
        assert!(!installer.is_installed().unwrap());
    }

    /// M6 T1 (D-M6-1): preview returns the exact before/after text — `after`
    /// is byte-equal to what install writes — and never touches the file.
    #[test]
    fn preview_matches_install_output_and_writes_nothing() {
        let (dir, installer) = setup();
        let original = canonical(user_settings_with_hooks());
        std::fs::write(settings_path(&dir), &original).unwrap();

        let (before, after) = installer.preview().unwrap();
        assert_eq!(before, original);
        assert_eq!(
            read(&settings_path(&dir)),
            original,
            "preview must not write"
        );

        installer.install().unwrap();
        assert_eq!(
            read(&settings_path(&dir)),
            after,
            "preview's after = install's bytes"
        );
    }

    #[test]
    fn preview_on_missing_file_has_empty_before() {
        let (dir, installer) = setup();
        let (before, after) = installer.preview().unwrap();
        assert!(before.is_empty());
        assert!(!settings_path(&dir).exists());
        installer.install().unwrap();
        assert_eq!(read(&settings_path(&dir)), after);
    }

    #[test]
    fn preview_refuses_corrupted_json() {
        let (dir, installer) = setup();
        std::fs::write(settings_path(&dir), "{ nope").unwrap();
        assert!(installer.preview().is_err());
    }

    #[test]
    fn missing_file_uninstall_is_a_noop() {
        let (dir, installer) = setup();
        installer.uninstall().unwrap();
        assert!(!settings_path(&dir).exists());
        assert!(!installer.is_installed().unwrap());
    }
}
