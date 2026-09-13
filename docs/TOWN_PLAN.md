# CrewHub town implementation plan

Status: accepted product direction; proposed implementation sequence. This change
adds planning documents only. Towns, dynamic rooms, persistence, and live adapters
are not implemented by this plan.

## 1. Outcome and starting point

Build a playful town of rooms that makes an existing crew easy to oversee. A
Herdr session can supply the initial town structure. Claude Code and Codex sessions
can also join without Herdr, including in a room containing both runtimes.

The user has reviewed The Greenhouse positively and wants to establish a design
system before further UI design. Preserve the room's visual direction. Treat its
current panels as provisional, and keep model/engine work independent of the new
design system. User feedback establishes the visual direction; it does not replace
the outstanding device, accessibility, shader, and performance review.

The merged starting point has one 18 × 14 room, three mock companions, procedural
models, shaders, camera controls, prop editing, four-way A*, reservations, and JSON
layout export. Thirteen engine tests pass. The scene and UI still assume a fixed
crew, match sessions by array position, and contain fixed room/camera dimensions.
Layouts are held in memory; the bridge is only a documented boundary.

The agreed scope concerns **Claude Code and Codex sessions**. Cloud hosting and
Claude.ai/ChatGPT conversation import are separate future integrations, with their
own access requirements. No inference is needed to build or organize the town.

## 2. Product model

Use CrewHub-owned identifiers and concepts, with bindings to external sources.
The word `session` must not name both a town and an agent conversation internally.

| CrewHub concept | Meaning | Herdr default mapping | Direct runtime default mapping |
| --- | --- | --- | --- |
| Town | A named work context with a spatial layout | One selected Herdr session | User chooses or creates a town |
| Room | A persistent group with its own interior grid | One space/workspace | Project/repository, or an explicit group |
| Workstation | A cluster of usable slots and props | One tab, with slots for its panes | One conversation's workplace |
| Slot | A seat or equipment position within a workstation | One pane | One session/thread assignment |
| Character | A persistent visual identity | The recognized agent occupying a pane | The agent associated with a conversation |
| Runtime session | The native conversation being represented | Native identity reported by the agent | Claude session ID or Codex thread ID |
| Connection | A route for observing or controlling a runtime | Herdr adapter | Claude Code or Codex adapter |

A shell, server, or log pane becomes equipment, not an invented AI character.
Tabs with multiple agent panes need multiple slots. A character is distinct from
its current session and task; assigning it a new session must not merge histories.

Herdr's hierarchy is session → workspace → tab → pane. Its session is a persistent
server namespace. [Herdr concepts](https://herdr.dev/docs/concepts/).
Claude Code CLI conversations are associated with project directories; other
Claude surfaces maintain separate histories. [Claude sessions](https://code.claude.com/docs/en/sessions).
Codex exposes threads and directory metadata through App Server.
[Codex App Server](https://learn.chatgpt.com/docs/app-server).

### Placement and grouping rules

1. An explicit user assignment takes precedence over automatic grouping.
2. A bound Herdr workspace maps to its existing room even when renamed.
3. A directly connected session with a recognized project can join that project's
   room. Repository names alone are not identity; resolve canonical repository
   metadata and preserve worktree/branch distinctions.
4. Unknown or ambiguous projects appear in an unassigned list, with a suggested
   destination and an explicit assignment action. Do not guess using a model.
5. A direct session does not require a town per provider or machine. Connection
   badges explain where it runs; the user controls the spatial organization.

Example: town `Personal` contains rooms `CrewHub`, `Flowz`, and `Experiments`.
The CrewHub room can contain a Claude session discovered through Herdr and a Codex
thread discovered directly. Manual placement inside CrewHub does not move a native
Herdr tab, rename a project, or change a session's working directory.

## 3. Identity, state, and ownership

Keep three identity layers:

- **Source observation:** connection ID plus native locator and occupant generation.
  A pane ID describes a place; its occupant can change.
- **Canonical runtime session:** runtime kind, persistent runtime/store scope, and
  native conversation ID. Scope survives bridge reconnects but distinguishes
  separate installations or session stores.
- **CrewHub identity:** town, room, workstation, slot, and character IDs independent
  of names, ordering, transport connections, and process IDs.

Merge observations only when their native session identity and scope match, or
when the user explicitly links verified identities. Never deduplicate by display
name, project path alone, or guessed transcript similarity. Without native identity,
keep a provisional binding and expose uncertainty. A pane replacement detaches the
old binding and rechecks identity before any future command.

For Codex, use `thread.id` as conversation identity. `thread.sessionId` can identify
a shared session-tree root across forks, so it must not collapse distinct threads
into one character. [Codex thread lifecycle](https://learn.chatgpt.com/docs/app-server#start-or-resume-a-thread).

Each canonical session has one selected command route. Observation can use several
sources with explicit provenance and freshness. A blocked or unsupported command
must not silently switch routes to bypass a runtime's rules. Proposed command
requests carry session identity, occupant generation, and request identity; an
uncertain delivery outcome is surfaced before any retry.

Separate execution state, attention, outcome, connection freshness, and lifecycle.
For example, disconnected is not idle; waiting for approval is not success; a
stored transcript is not evidence of a running process. A runtime's unseen-finish
indicator is not automatically a successful task outcome. This requires evolving
the mock-only protocol before live mapping, rather than forcing every provider
into its current `completed` state.

The bridge owns observed runtime truth. CrewHub owns layout, visual identities,
assignments, and preferences. Runtime history remains in its source. Completed or
inactive sessions may leave a reserved seat; archived history does not create an
unbounded population. Removing a visual assignment never terminates a native
session.

## 4. Two grids and stable room growth

The town grid places room plots, paths, and doorway connections. Each room keeps
an independent interior grid for furniture, slots, and local routing. An explicit
room transform maps local cells into the town; camera movement never changes it.

Introduce a fixed cell origin for each room. The current renderer centers geometry
using half the current width/depth; blindly increasing those dimensions would move
existing contents. Growth must preserve the world positions of old cells, props,
actors, doors, and reserved movement segments.
Initially grow toward positive x/z within the reserved plot, keeping cell zero
fixed. Expansion on the opposite sides belongs to an explicit relocation/migration
operation until signed local coordinates are deliberately supported.

### Capacity algorithm

Use template-defined workstation footprints, approach cells, shared circulation,
and modest spare capacity. Start by prototyping 4 × 4 expansion modules; their final
dimensions are a tuning choice, not a wire-format rule. Calculate capacity from
valid placements and reachability, not floor area divided by desk count.

For a new tab, pane, or assigned conversation:

1. Reuse a compatible empty slot; otherwise use an existing free module.
2. Build a candidate expansion within the room's reserved town plot.
3. Validate footprints, door clearance, reachability, actors, and active segments.
4. Commit the room and affected town geometry as one revision, or preserve the
   original state and place the assignment in a visible capacity queue.
5. Replan affected routes once. Keep hand-placed props fixed and group bursts of
   source events into one layout update.

Reserve room plots large enough for several growth modules. If a plot is full,
offer a previewed expansion, relocation, or additional room. Never push neighboring
rooms aside automatically or overlap them. Shrink only through an explicit layout
operation with a preview and undo. Removing or idling a session does not shrink a
room. Persist module positions so reloading produces the same town.

The first town only needs camera navigation between rooms. Record doorway/portal
adjacency now; later cross-room walking can route over that small graph and use
local A* inside each room. Continuous town-wide crowd simulation is deferred.

## 5. Camera, oversight, and the design system

Support three scopes: town overview, room overview, and focused character. Each
has an orthographic home framing; optional free orbit remains available. Preserve
selection and a return location when moving between scopes. Compute bounds from
actual plots and room dimensions rather than the initial room's constants.

Town view summarizes activity by room. Show working, needs input/approval, finished
unseen, and stale/disconnected counts with text as well as visual signals. Attention
can jump to the relevant character without losing the user's place. Clearly
distinguish zero activity from unavailable information.

The design-system workstream defines tokens and components for navigation, room
summaries, agent details, source badges, assignment/capacity states, and connection
setup. Specify these states and accessibility needs now; apply Nicky's system once
available. Engine work and mock camera behavior can proceed using the existing
provisional controls. New UI styling is not part of this planning change.

## 6. Storage and extension boundaries

Start with one local browser profile. A versioned `TownDocument` stores town/room
IDs, plots, room layouts, furniture, visual assignments, source references, pinned
seats, and camera preferences in IndexedDB. Keep credentials and transcripts out
of it. Persist only committed changes and provide validated export/import, reset,
and undo for layout edits.

Preserve today's room JSON format. Introduce a separate versioned town envelope
that contains existing room layouts; import a legacy room as a one-room town.
Validate before committing, keep the previous saved revision, and fail without
partial mutation. Source references that cannot reconnect remain visibly unbound.
Cross-device synchronization and multi-user storage are later work.

| Location | Planned responsibility |
| --- | --- |
| `packages/protocol` | Validated runtime records, capabilities, snapshots, events, command results |
| `packages/world-engine` | Interior grids, town plots, capacity planning, transforms, local routes, portal graph |
| `apps/world/src/model` | Town document, source bindings, identity-based projection, persistence and migration |
| `apps/world/src/world` | Data-driven room factories, camera scopes, shaders and detail levels |
| `apps/world/src/features` | Town/room navigation, oversight, assignment and connection flows |
| `apps/bridge` | Independent service, pairing, observations and provider adapters |

Do not introduce all these modules as empty scaffolding. Create them with the
first behavior they own. Extend semantic snapshots with room IDs, usable slots,
doorways, tags, and reachability. Future agent tools should query these records
without interpreting scene pixels.

For generated models later, require a trusted definition with footprint, origin,
orientation, size envelope, approach cells, semantic tags, and an asset reference.
Changing an asset must not silently alter navigation. Generation, asset import,
and optional model calls are outside this sequence's first release.

## 7. Connection strategy

### Herdr first

Onboard an existing Herdr session through the reusable bridge. Preview the town,
workspaces, tabs, panes, agent identities, and unsupported states before applying
the visual bindings. Read the schema from the installed version.

The documented bootstrap is subscribe/acknowledge, buffer, snapshot, then reconcile
buffered events; take a new snapshot after reconnect. Keep exact native references
and version/protocol metadata. [Herdr socket API](https://herdr.dev/docs/socket-api/).

Begin with observation. Verify rename, pane replacement, deletion, disconnect,
restart, duplicate delivery, and snapshot/event races using recorded, redacted
fixtures. Do not let merely opening CrewHub start, resume, or prompt an agent.

### Direct Claude Code and Codex

Each adapter begins with a bounded feasibility check against the installed runtime.
The check must prove observation of an **already-running** session, native identity,
activity/attention fidelity, lifecycle, and the supported route to its output.

| Adapter | Initial approach | Proof required before claiming support |
| --- | --- | --- |
| Claude Code | Documented lifecycle hooks/status integration and supported structured interfaces | Hook installation scope, existing-session activation, reliable IDs, observed vs historical state, and cleanup |
| Codex | Supported App Server thread listing/reading and available status events | Which running sessions the endpoint actually owns/sees, store scope, active event access, and reconnect behavior |

Claude documents hooks and structured interfaces for session data, and warns that
raw transcript entry formats are internal. Do not base the supported adapter on
unversioned transcript scraping. [Claude script interfaces](https://code.claude.com/docs/en/sessions#access-conversations-from-scripts).

Codex documents thread reads without resuming and status notifications for loaded
threads. A second App Server process must not be assumed to mirror another CLI
process's live state. [Codex App Server](https://learn.chatgpt.com/docs/app-server).

Saved-history visibility alone does not pass the live-observation check. If an
existing runtime cannot be observed safely through a supported interface, show
that capability as unavailable and document the integration path needed. Do not
resume the conversation as an observation workaround. Installing hooks or changing
runtime settings is an explicit onboarding action, not a side effect of discovery.

The bridge uses loopback pairing and allowed-origin checks, with runtime-specific
access kept out of the browser. Protocol snapshots include a stream epoch and
revision; bounded buffers and gap recovery prevent stale state from looking live.
Multiple observation clients must not create duplicate commands or model usage.
These rules belong to the bridge regardless of any future Tauri packaging.

## 8. Delivery sequence

Milestones below are implementation proposals, not promises of dates. Each should
land through focused, independently reviewable PRs. Keep the existing demo working
throughout. A runtime feasibility failure blocks that adapter, not the town model.

| Phase | Deliverable | Depends on | Acceptance gate |
| --- | --- | --- | --- |
| M2: Shared model | Town/room/workstation/slot records; canonical sessions and bindings; normalized mock sources; dynamic crew keyed by IDs | Current room | Reordering, removal, duplicate observations and pane replacement cannot show another session's state |
| M3: Growing rooms | Data-driven room templates, stable transforms, slot allocation, atomic growth, local persistence and legacy import | M2 | Capacity changes preserve props and actor positions; invalid growth/import leaves the previous revision intact |
| M4: Mock town | Three-room town, plots/paths, town → room → character camera, room summaries and detail-level switching | M3 | Coherent overview and return flow at desktop/touch sizes; offscreen rooms avoid detailed animation |
| M5: Herdr observation | Standalone bridge, validated protocol, pairing, source preview, native hierarchy and live read-only updates | M2 and M4 | Existing Herdr session drives the town; reconnect and occupant changes are correct; zero inference or runtime commands during observation |
| M6a: Direct Claude Code | Feasibility report followed by observation adapter when proven | M5 shared bridge and identity | A session outside Herdr appears once, updates truthfully, and can share a room with Codex |
| M6b: Direct Codex | Feasibility report followed by observation adapter when proven | M5 shared bridge and identity | Existing visible runtime threads are represented without resume; a thread seen through Herdr remains one session |
| M7: Explicit interaction | On-demand output, focus/open-native where supported, then prompt/interrupt capabilities | M5; direct commands require the relevant M6 adapter | Explicit target and supported route; fresh occupant checks; native approvals preserved; uncertain delivery does not trigger a blind resend |

Design-system integration can join M4 when ready; final UI acceptance depends on
it. Small observation feasibility checks may run before M4 finishes to expose
adapter limits early. M6a and M6b are independent deliverables; do not bundle both
unproven adapters into the first live PR. Tauri, remote access, model generation,
cross-room walking, and autonomous coordination follow only after a useful town
has been demonstrated.

### First implementation PR

Start with M2, keeping The Greenhouse's layout and art intact. Introduce IDs and
bindings, then replace `crew[index]`/`sessions[index]` assumptions and the fixed
three-agent labels with a data-driven projection. Move fixture definitions behind
the same input boundary intended for adapters. Add mock cases for reordered
records, 0/1/3/8 agents, deletion, reconnection, and one session seen through two
sources. Test identity behavior; do not connect a live provider or redesign panels
in this PR. The result must still run with `npm ci && npm run dev`.

## 9. Verification and graphics budget

Keep `npm run check` as the baseline, extending tests when behavior is introduced.

| Risk | Required evidence |
| --- | --- |
| Identity and lifecycle | Duplicate sources, forks, renames, reordered records, recycled panes, reconnect, stale observations, archival |
| Layout stability | Non-square rotation, module growth, plot collision, fixed cell origins, actor reservations, reachable doors/slots, undo |
| Persistence | Export/import round trip, legacy room migration, malformed payload, interrupted save, missing source binding |
| Runtime correctness | Versioned fixtures, subscription gaps, failed observation, source capability limits, explicit target validation |
| User experience | Town/room/focus/return, keyboard and touch, screen-reader overview, reduced motion, disconnected and full-room states |
| Resource use | Documented device/browser/DPR, frame times, memory, hidden-tab behavior, repeated room changes, zero inference during observation |

Test the initial town with three rooms at 3, 8, and 16 assigned sessions. Add an
oversight stress fixture with 12 rooms and 100 sessions. These are test workloads,
not claimed capacity guarantees. Maintain the 30 fps presentation cap and bounded
DPR; aim for frame work within the 33 ms budget on the documented reference device.
Measure before promising support on a particular device.

Keep at most one detailed interior active initially. Town view uses simplified
room silhouettes and summaries, pooling or instancing repeated assets. Offscreen
rooms retain semantic state; their cosmetic walking pauses until the room is
focused again. Runtime status still updates. Use hysteresis around detail-level
thresholds to avoid repeated load/dispose cycles while zooming.

Source updates are event-driven and coalesced; local routes run only when needed.
Optional fallback polling must be bounded, documented, and cancellable. No model
calls for naming, grouping, movement, summaries, attention, or layout generation
are part of this plan. Existing agent work retains its normal provider costs.

## 10. Decisions to settle with evidence

| Decision | Working default | When to settle |
| --- | --- | --- |
| Room module sizes and spare capacity | Template configuration; prototype 4 × 4 modules | M3 layout and readability review |
| Town plot limits and maximum detailed crew | Conservative plots; one detailed room | M4 measurements and 100-session oversight fixture |
| Final UI components | Nicky's forthcoming design system | M4 UI integration |
| Bridge server/storage libraries | Minimal standalone Rust service | M5 implementation, after protocol definition |
| Direct runtime visibility and control | Observation only until proven; capabilities explicit | Separate M6 feasibility checks |
| Cross-device persistence and remote access | Local browser profile and local bridge | Separate later scope |

The immediate implementation objective is a correct shared model, followed by
stable growing rooms and a convincing mock town. Live integrations reuse those
same identities and presentation inputs once their observation paths are proven.
