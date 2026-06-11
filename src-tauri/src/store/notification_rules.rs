//! Notification rules (M3 T5, D-M3-9 / G7).
//!
//! Typed CRUD over the existing `notification_rules` table. The matcher
//! itself is a PURE frontend function (`matchRules` in
//! `stores/notifications.ts`) so M6 can swap the toast sink for the OS sink
//! behind the same rule engine; the backend only stores rules and announces
//! changes via `SettingChanged { key: "notification_rules" }`.

use super::Store;
use serde::{Deserialize, Serialize};

/// Closed trigger list: four M3 task triggers + M4's `run_finished`
/// (T5 — the automation toast rides the same matcher seam) + M6's five
/// attention triggers (D-M6-4; Rust-validated — no CHECK constraint exists,
/// so widening this list is migration-free).
pub const NOTIFICATION_TRIGGERS: &[&str] = &[
    "task_moved",
    "task_blocked",
    "task_assigned",
    "task_mention",
    "run_finished",
    "permission_needed",
    "session_stopped",
    "session_error",
    "meeting_complete",
    "hook_notification",
];

/// The M6 attention triggers seeded for fresh installs behind the wizard's
/// notifications opt-in (D-M6-4: global scope, `sink: "both"`).
pub const ATTENTION_TRIGGERS: &[&str] = &[
    "permission_needed",
    "session_stopped",
    "session_error",
    "meeting_complete",
    "hook_notification",
];

/// Per-rule sink routing values carried in `config_json.sink` (D-M6-4).
pub const NOTIFICATION_SINKS: &[&str] = &["toast", "os", "both"];
/// Closed scopes (mirrors the CHECK constraint in migration 001).
pub const NOTIFICATION_SCOPES: &[&str] = &["agent", "project", "global"];

/// The settings key broadcast on every rules mutation (cheap invalidation —
/// no new DomainEvent variant in M3).
pub const NOTIFICATION_RULES_SETTING_KEY: &str = "notification_rules";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct NotificationRule {
    pub id: String,
    /// agent | project | global
    pub scope: String,
    /// The agent/project id when scope is not global.
    pub scope_id: Option<String>,
    /// task_moved | task_blocked | task_assigned | task_mention
    pub trigger: String,
    pub config_json: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewNotificationRule {
    pub scope: String,
    pub scope_id: Option<String>,
    pub trigger: String,
    pub config_json: Option<String>,
    pub enabled: Option<bool>,
}

fn row_to_rule(r: &rusqlite::Row) -> rusqlite::Result<NotificationRule> {
    Ok(NotificationRule {
        id: r.get("id")?,
        scope: r.get("scope")?,
        scope_id: r.get("scope_id")?,
        trigger: r.get("trigger")?,
        config_json: r.get("config_json")?,
        enabled: r.get::<_, i64>("enabled")? != 0,
    })
}

fn validate(
    scope: &str,
    scope_id: Option<&str>,
    trigger: &str,
    config_json: Option<&str>,
) -> anyhow::Result<()> {
    if !NOTIFICATION_SCOPES.contains(&scope) {
        anyhow::bail!(
            "invalid scope: {scope:?} (valid: {})",
            NOTIFICATION_SCOPES.join(", ")
        );
    }
    if !NOTIFICATION_TRIGGERS.contains(&trigger) {
        anyhow::bail!(
            "invalid trigger: {trigger:?} (valid: {})",
            NOTIFICATION_TRIGGERS.join(", ")
        );
    }
    if scope != "global" && scope_id.is_none_or(str::is_empty) {
        anyhow::bail!("scope {scope:?} requires a scope_id");
    }
    // D-M6-4: when config_json carries a sink, it must be a known one.
    if let Some(raw) = config_json {
        let value: serde_json::Value =
            serde_json::from_str(raw).map_err(|e| anyhow::anyhow!("invalid config_json: {e}"))?;
        if let Some(sink) = value.get("sink") {
            let ok = sink
                .as_str()
                .is_some_and(|s| NOTIFICATION_SINKS.contains(&s));
            if !ok {
                anyhow::bail!(
                    "invalid config_json.sink: {sink} (valid: {})",
                    NOTIFICATION_SINKS.join(", ")
                );
            }
        }
    }
    Ok(())
}

impl Store {
    pub fn create_notification_rule(
        &self,
        new: NewNotificationRule,
    ) -> anyhow::Result<NotificationRule> {
        validate(
            &new.scope,
            new.scope_id.as_deref(),
            &new.trigger,
            new.config_json.as_deref(),
        )?;
        let rule = NotificationRule {
            id: uuid::Uuid::new_v4().to_string(),
            scope: new.scope,
            scope_id: new.scope_id,
            trigger: new.trigger,
            config_json: new.config_json,
            enabled: new.enabled.unwrap_or(true),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO notification_rules (id, scope, scope_id, trigger, config_json, enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                rule.id,
                rule.scope,
                rule.scope_id,
                rule.trigger,
                rule.config_json,
                rule.enabled as i64
            ],
        )?;
        Ok(rule)
    }

    /// All rules, stable insertion order.
    pub fn list_notification_rules(&self) -> anyhow::Result<Vec<NotificationRule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM notification_rules ORDER BY rowid")?;
        let rows = stmt.query_map([], row_to_rule)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn update_notification_rule(
        &self,
        rule: NotificationRule,
    ) -> anyhow::Result<NotificationRule> {
        validate(
            &rule.scope,
            rule.scope_id.as_deref(),
            &rule.trigger,
            rule.config_json.as_deref(),
        )?;
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE notification_rules SET scope=?2, scope_id=?3, trigger=?4, config_json=?5, enabled=?6
             WHERE id=?1",
            rusqlite::params![
                rule.id,
                rule.scope,
                rule.scope_id,
                rule.trigger,
                rule.config_json,
                rule.enabled as i64
            ],
        )?;
        if n == 0 {
            anyhow::bail!("notification rule not found: {}", rule.id);
        }
        Ok(rule)
    }

    pub fn delete_notification_rule(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM notification_rules WHERE id = ?1", [id])? > 0)
    }

    /// Default-rule seeding for fresh installs (M6 T4, D-M6-4): one global
    /// `sink: "both"` rule per attention trigger, written by the wizard's
    /// notifications opt-in. Idempotent: a trigger that already has any rule
    /// is left alone (user edits survive re-runs). Returns created rules.
    pub fn seed_default_notification_rules(&self) -> anyhow::Result<Vec<NotificationRule>> {
        let existing: std::collections::HashSet<String> = self
            .list_notification_rules()?
            .into_iter()
            .map(|r| r.trigger)
            .collect();
        let mut created = Vec::new();
        for trigger in ATTENTION_TRIGGERS {
            if existing.contains(*trigger) {
                continue;
            }
            created.push(self.create_notification_rule(NewNotificationRule {
                scope: "global".into(),
                scope_id: None,
                trigger: (*trigger).to_string(),
                config_json: Some(r#"{"sink":"both"}"#.into()),
                enabled: Some(true),
            })?);
        }
        Ok(created)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn global(trigger: &str) -> NewNotificationRule {
        NewNotificationRule {
            scope: "global".into(),
            scope_id: None,
            trigger: trigger.into(),
            config_json: None,
            enabled: None,
        }
    }

    #[test]
    fn crud_roundtrip_defaults_enabled() {
        let s = Store::open_in_memory().unwrap();
        let mut r = s.create_notification_rule(global("task_moved")).unwrap();
        assert!(r.enabled);
        assert_eq!(s.list_notification_rules().unwrap(), vec![r.clone()]);

        // per-rule mute = the Epic-22 contract
        r.enabled = false;
        let r = s.update_notification_rule(r).unwrap();
        assert!(!s.list_notification_rules().unwrap()[0].enabled);

        assert!(s.delete_notification_rule(&r.id).unwrap());
        assert!(!s.delete_notification_rule(&r.id).unwrap());
    }

    #[test]
    fn scope_and_trigger_vocabularies_are_closed() {
        let s = Store::open_in_memory().unwrap();
        let err = s
            .create_notification_rule(NewNotificationRule {
                scope: "universe".into(),
                ..global("task_moved")
            })
            .unwrap_err();
        assert!(err.to_string().contains("invalid scope"), "got: {err}");

        let err = s
            .create_notification_rule(global("task_vibed"))
            .unwrap_err();
        assert!(err.to_string().contains("invalid trigger"), "got: {err}");

        // non-global scope requires a scope_id
        let err = s
            .create_notification_rule(NewNotificationRule {
                scope: "agent".into(),
                ..global("task_assigned")
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("requires a scope_id"),
            "got: {err}"
        );

        let ok = s
            .create_notification_rule(NewNotificationRule {
                scope: "project".into(),
                scope_id: Some("p1".into()),
                ..global("task_mention")
            })
            .unwrap();
        assert_eq!(ok.scope_id.as_deref(), Some("p1"));

        // update validates too
        let mut bad = ok;
        bad.trigger = "everything".into();
        assert!(s.update_notification_rule(bad).is_err());
    }

    /// M6 T4 (D-M6-4): the five attention triggers validate — and the list
    /// stays closed beyond them.
    #[test]
    fn m6_attention_triggers_are_valid_and_list_stays_closed() {
        let s = Store::open_in_memory().unwrap();
        for trigger in [
            "permission_needed",
            "session_stopped",
            "session_error",
            "meeting_complete",
            "hook_notification",
        ] {
            s.create_notification_rule(global(trigger))
                .unwrap_or_else(|e| panic!("{trigger} must validate: {e}"));
        }
        assert!(s.create_notification_rule(global("session_vibes")).is_err());
    }

    /// D-M6-4: `config_json.sink` is validated against toast|os|both.
    #[test]
    fn sink_routing_in_config_json_is_validated() {
        let s = Store::open_in_memory().unwrap();
        for sink in ["toast", "os", "both"] {
            s.create_notification_rule(NewNotificationRule {
                config_json: Some(format!(r#"{{"sink":"{sink}"}}"#)),
                ..global("permission_needed")
            })
            .unwrap_or_else(|e| panic!("sink {sink} must validate: {e}"));
        }
        let err = s
            .create_notification_rule(NewNotificationRule {
                config_json: Some(r#"{"sink":"carrier-pigeon"}"#.into()),
                ..global("permission_needed")
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("invalid config_json.sink"),
            "got: {err}"
        );
        let err = s
            .create_notification_rule(NewNotificationRule {
                config_json: Some("not json".into()),
                ..global("permission_needed")
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("invalid config_json"),
            "got: {err}"
        );
        // config without a sink stays legal (defaults applied frontend-side)
        s.create_notification_rule(NewNotificationRule {
            config_json: Some(r#"{"note":"x"}"#.into()),
            ..global("task_moved")
        })
        .unwrap();
    }

    /// D-M6-4 seeding: global both-sink rule per attention trigger, idempotent.
    #[test]
    fn default_rule_seeding_is_idempotent_and_respects_user_edits() {
        let s = Store::open_in_memory().unwrap();
        let created = s.seed_default_notification_rules().unwrap();
        assert_eq!(created.len(), ATTENTION_TRIGGERS.len());
        for rule in &created {
            assert_eq!(rule.scope, "global");
            assert!(rule.enabled);
            assert!(rule.config_json.as_deref().unwrap().contains("both"));
        }
        // second run: no duplicates
        assert!(s.seed_default_notification_rules().unwrap().is_empty());
        assert_eq!(
            s.list_notification_rules().unwrap().len(),
            ATTENTION_TRIGGERS.len()
        );
        // a muted user rule for a trigger blocks re-seeding of that trigger
        let mut rules = s.list_notification_rules().unwrap();
        let mut muted = rules.remove(0);
        muted.enabled = false;
        let muted = s.update_notification_rule(muted).unwrap();
        assert!(s.seed_default_notification_rules().unwrap().is_empty());
        let after = s.list_notification_rules().unwrap();
        assert!(!after.iter().find(|r| r.id == muted.id).unwrap().enabled);
    }

    #[test]
    fn update_unknown_rule_is_an_error() {
        let s = Store::open_in_memory().unwrap();
        let err = s
            .update_notification_rule(NotificationRule {
                id: "ghost".into(),
                scope: "global".into(),
                scope_id: None,
                trigger: "task_moved".into(),
                config_json: None,
                enabled: true,
            })
            .unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");
    }
}
