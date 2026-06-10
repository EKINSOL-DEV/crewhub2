//! Provider-agnostic session engine.
//!
//! # Seam rules (master plan §4.2 D2; M1 plan §1)
//!
//! 1. **Naming firewall**: only `engine/claude/**` may reference Claude Code concepts.
//!    Everything else in this module — and all IPC/UI code — is provider-neutral.
//! 2. **Capability flags, not provider checks**: consumers branch on [`provider::ProviderCaps`],
//!    never on a provider's identity.
//! 3. **One event stream**: all providers emit [`types::SessionEvent`] through the registry fan-in.
//! 4. **Provider-scoped ids**: [`types::SessionId`] pairs `{provider, id}` so providers never collide.
//!
//! Adding a runtime (e.g. Codex) = implement [`provider::SessionProvider`] in a new
//! submodule and register it in `lib.rs`. No core, IPC, or UI changes.
pub mod provider;
pub mod types;
