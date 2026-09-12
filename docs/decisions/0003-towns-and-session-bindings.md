# 0003: Towns own layout; runtime bindings supply activity

Status: accepted direction; implementation planned.

The user wants the town metaphor restored, with a room per Herdr space and room
capacity growing with tabs/panes. Claude Code and Codex sessions must also fit
without requiring Herdr.

Use CrewHub-owned towns, rooms, workstations, slots, and character identities.
Map a selected Herdr session to a town and its workspaces to rooms by default.
Group directly discovered conversations by project or explicit user assignment.
Rooms may contain different runtimes. A connection or machine is not a mandatory
spatial boundary.

Keep source observations separate from canonical runtime conversations. Match
verified native IDs within their runtime/store scope, including pane occupant
generation. Multiple adapters observing one conversation produce one character
and one selected command route. Display names and tab positions are not identity.

Use separate town and interior grids, with stable transforms and atomic growth.
Reserve expansion space; preserve existing furniture and positions. Shrinking and
relocation are explicit layout operations. Start with one detailed room at a time.

Preserve The Greenhouse art direction. Final UI components follow the user's
forthcoming design system. Observation and normal presentation require no model
calls. Direct adapter support is conditional on verifying actual existing-session
access; a supported conversation-launch API alone does not establish it.

The [town implementation plan](../TOWN_PLAN.md) defines the proposed delivery
sequence and acceptance gates. This decision does not implement those features or
authorize automatic native-session control.
