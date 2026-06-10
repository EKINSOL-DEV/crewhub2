//! Security primitives.
//!
//! House rule: every IPC command that takes a filesystem path MUST call
//! [`paths::PathPolicy::validate`] before touching disk. Reviewers reject violations.
pub mod paths;
