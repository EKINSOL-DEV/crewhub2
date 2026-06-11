//! Permission "allow always" rules — provider-neutral matching logic.
//!
//! Persisted by higher layers as JSON (settings key `perm.rules`); this module
//! is pure so every provider shares one rule semantics.

use serde::{Deserialize, Serialize};

/// Settings key the rules are persisted under (single source of truth;
/// written ONLY through the typed IPC commands — M2 Appendix B).
pub const SETTINGS_KEY: &str = "perm.rules";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PermissionRule {
    /// None = applies to every agent.
    pub agent_id: Option<String>,
    /// Tool pattern: exact name, or prefix ending in `*` (e.g. `mcp__crewhub__*`).
    pub tool_pattern: String,
}

impl PermissionRule {
    fn matches(&self, agent_id: Option<&str>, tool: &str) -> bool {
        let agent_ok = match &self.agent_id {
            None => true,
            Some(a) => Some(a.as_str()) == agent_id,
        };
        if !agent_ok {
            return false;
        }
        match self.tool_pattern.strip_suffix('*') {
            Some(prefix) => tool.starts_with(prefix),
            None => tool == self.tool_pattern,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PermissionRules {
    pub rules: Vec<PermissionRule>,
}

impl PermissionRules {
    pub fn allows(&self, agent_id: Option<&str>, tool: &str) -> bool {
        self.rules.iter().any(|r| r.matches(agent_id, tool))
    }

    pub fn from_json(json: &str) -> Self {
        serde_json::from_str(json).unwrap_or_default()
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{\"rules\":[]}".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(v: Vec<(&str, Option<&str>)>) -> PermissionRules {
        PermissionRules {
            rules: v
                .into_iter()
                .map(|(p, a)| PermissionRule {
                    agent_id: a.map(str::to_string),
                    tool_pattern: p.into(),
                })
                .collect(),
        }
    }

    #[test]
    fn exact_and_prefix_patterns() {
        let r = rules(vec![("Bash", None), ("mcp__crewhub__*", None)]);
        assert!(r.allows(None, "Bash"));
        assert!(!r.allows(None, "BashOutput"));
        assert!(r.allows(None, "mcp__crewhub__create_task"));
        assert!(!r.allows(None, "mcp__other__x"));
    }

    #[test]
    fn agent_scoping() {
        let r = rules(vec![("Write", Some("bot-1"))]);
        assert!(r.allows(Some("bot-1"), "Write"));
        assert!(!r.allows(Some("bot-2"), "Write"));
        assert!(!r.allows(None, "Write"));
    }

    #[test]
    fn json_roundtrip_and_garbage_tolerance() {
        let r = rules(vec![("Edit", None)]);
        assert_eq!(PermissionRules::from_json(&r.to_json()), r);
        assert_eq!(
            PermissionRules::from_json("not json"),
            PermissionRules::default()
        );
    }
}
