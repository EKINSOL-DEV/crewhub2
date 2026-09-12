# Local bridge boundary

Reserved for a standalone local background service, initially intended to use
Rust. No executable or network listener is included in this bootstrap.

The future bridge discovers sessions, normalizes runtime events, and routes
explicit commands through adapters. Herdr is the first adapter. It will serve
CrewHub and other clients through an authenticated, documented interface.

Keep the service independent of Tauri. A later desktop companion may install,
start, update, and supervise it. Browser-only development uses mock data and must
not require this service.

Before implementing a listener, follow [architecture](../../docs/ARCHITECTURE.md)
and the [roadmap](../../docs/ROADMAP.md). Do not expose an unauthenticated localhost
control endpoint or allow wildcard browser origins. Design pairing before control
commands become available. Remote access is a separate delivery step.
