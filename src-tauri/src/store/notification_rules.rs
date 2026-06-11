//! Notification rules (M3 T5, D-M3-9 / G7).
//!
//! Typed CRUD over the existing `notification_rules` table. The matcher
//! itself is a PURE frontend function (`matchRules` in
//! `stores/notifications.ts`) so M6 can swap the toast sink for the OS sink
//! behind the same rule engine; the backend only stores rules and announces
//! changes via `SettingChanged { key: "notification_rules" }`.

use super::Store;
use serde::{Deserialize, Serialize};

/// Closed trigger list for M3 (M3-R7: four task triggers only).
pub const NOTIFICATION_TRIGGERS: &[&str] = &[
    "task_moved",
    "task_blocked",
    "task_assigned",
    "task_mention",
];
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

fn validate(scope: &str, scope_id: Option<&str>, trigger: &str) -> anyhow::Result<()> {
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
    Ok(())
}

impl Store {
    pub fn create_notification_rule(
        &self,
        new: NewNotificationRule,
    ) -> anyhow::Result<NotificationRule> {
        validate(&new.scope, new.scope_id.as_deref(), &new.trigger)?;
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
        validate(&rule.scope, rule.scope_id.as_deref(), &rule.trigger)?;
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
