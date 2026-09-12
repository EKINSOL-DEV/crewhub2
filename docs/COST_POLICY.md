# Cost policy

## Default: zero model calls for presentation

World rendering, character animation, pathfinding, camera movement, attention
signals, session discovery, status mapping, and ordinary tool labels must use
deterministic application logic. Demo mode requires no account, key, network
service, or running harness.

Opening the app, entering a room, selecting a character, reconnecting the bridge,
or leaving a tab open must never start an agent or request inference.

Existing sessions still incur their normal provider usage when they perform work.
The bridge does not make that work free and must not duplicate it. Reuse approved
runtime authentication without extracting browser credentials or claiming an
unavailable subscription entitlement.

## Optional AI features, later

Summaries and conversational flavor are optional and disabled until configured.
Any such feature must define its trigger, model choice, cache key, maximum input,
output and call limits, cancellation behavior, and visible usage reporting.

- Prefer an explicit user request. Do not infer permission for recurring calls
  from permission to connect a session.
- Cache summaries against relevant content revisions and reuse them across views.
- Coalesce bursts of updates. Never call a model per event, character, or frame.
- Bound context and retries; do not silently escalate to a more expensive model.
- Provide feature and global off switches, and a hard request/token budget.
- Use currency estimates only when actual pricing and usage information are
  available. Otherwise say the cost is unknown.
- Keep metrics local by default. No external telemetry in the bootstrap.

## Graphics also have a budget

Reuse geometry and materials, cap rendering resolution, avoid needless state
updates, suspend hidden-tab work, and offer reduced motion and lower quality.
Local graphics can consume battery even when inference costs are zero.

## Acceptance

The prototype and bridge observation path must operate with all model access
disabled. Document any new network endpoint, background loop, model trigger, and
its cancellation path when adding functionality. A visual feature is not an
exception to this policy.
