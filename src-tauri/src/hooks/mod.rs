//! Hooks bridge: realtime signals from agent-runtime hooks into the engine.
//!
//! # Naming-firewall note (see `engine/mod.rs`)
//!
//! This module emits only provider-neutral types ([`crate::engine::types`]),
//! but its *wire surface* is runtime-specific by nature and documented as the
//! sanctioned exception: hook event names on the socket (`SessionStart`,
//! `PreToolUse`, …) are Claude Code's — [`receiver`] maps them to neutral
//! signal names. These strings are kept to this module and never leak past
//! [`SessionEvent`].
//!
//! [`SessionEvent`]: crate::engine::types::SessionEvent
pub mod receiver;
