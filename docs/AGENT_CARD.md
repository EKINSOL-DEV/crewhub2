# The agent card and the follow camera

Click an agent's figure, in a building or in the town (the agents in the town hall, the postman), and a card opens
beside it (a bottom sheet on a phone): what the agent is doing now, from the facts the projection holds. Enter on a
selected agent opens it too (the jump list lands with the agent selected: in its room, or in the town beside its
figure). Escape and a tap outside close it. The card is not modal: the world stays live behind it, and the
figure keeps walking while the card follows its anchor.

The card reads the projection, never the source, so it is the same in demo and live mode: the demo gives what its
script knows, a real crewhub-loops gives more (the lane, the flags). An absent fact is simply not shown; nothing is
invented, and when loops knows nothing the card says so ("No lane", "Team says nothing", "Seen by loops never"). In
demo mode a ticket has no link, and the footer says the facts are scripted. The demo scripts lanes for its agents
(`packages/demo/src/lanes.ts`: desired and observed values, some drift, a closed lane, a needs-login, the pane the
demo's team runs the agent in), so the Lane section shows in demo mode too; the fake crewhub-loops (`packages/loops-fake`)
serves the same lanes and lists its own key as the external bot it is. `node tools/liveshots.mjs --port <port> --card
cr-lead,marky` photographs the card against the fake. On the development crewhub-loops every agent is laneless
and the team snapshot is empty, so there the card says exactly that.

## Where the facts come from

`agentCardFacts(model, facts, key)` in `packages/world-model/src/agentCard.ts` (pure, tested) gathers one
`AgentCardFacts` from the world model (the agent's placement, its building, the ticket on its desk) and the facts behind
it:

| Field | From |
| --- | --- |
| `agent`, `building`, `stateWords` | The reducer's `AgentPlacement` (the real one when the agent is in a building), and the text view's sentence: lane status and posture, in words. |
| `work`, `workProject` | The ticket on its desk (`deskTicketKey`), else the in-progress ticket loops assigned to it. |
| `progress` | Its last `ticket.progress` line (a worker's line without the `"<worker>: "` prefix, through `linesOf`). |
| `team` | Its lane in the team snapshot (`GET /api/team`): herdr's status word, the status line, the lead it works for, text typed and not sent. |
| `teamSession` | The snapshot session that lane sits in: its name and its computer (`TeamSession.computer`, CL-459). |
| `loops` | `GET /api/agents` (`AgentDetailOut` at loops `4cdcd383`): role, `isCrewhubLead`, `isCoordinator`, `isOperator`, `disabled`, `external` (CL-314: a bot on another machine, no lane), `reader` (CL-313: reads tickets only), `notPickedUp`, `needsLoginSince` (CL-329), `lastSeenAt` (when loops last saw its key), the herdr session (`"external:none"` for an external bot), the computer, `projects {lead, member}`. Null for a worker. |
| `lane` | `AgentDetailOut.lane` (`contracts/agents.py`, `AgentLane`), typed on the client and still read defensively (`laneFacts`): kind, session and pane, the desired model, effort, account and permission mode, lifecycle and restarting, what was observed (and by what: the probe, or how loops started it), when, and the drift as loops names it. Null for an external bot and for every agent on the development instance tonight. |
| `homes` | The buildings it belongs to (where it stands, a proxy's home, loops' project membership). |
| `recent` | The last `RECENT_LIMIT` (5) facts that name it, newest first: its progress lines, moves and comments it made, deliveries for it. |

## The registry: a section is one file

`apps/world/src/world/agentCard/registry.ts` lists the sections in the order the card draws them. A section
(`apps/world/src/world/agentCard/sections/<id>.ts`) is:

```ts
interface AgentCardSection {
  id: string;
  title: string;
  when(facts: AgentCardFacts, ctx: CardContext): boolean; // anything to say?
  render(facts: AgentCardFacts, ctx: CardContext): CardRow[]; // what to say
}
```

`render` returns rows, not React: `text` (a labelled fact), `ticket` (key, title, the loops link `/t/<KEY>` on the
host's loops web URL), `chips` (the lane chip, a status chip, a stall, "waiting on"), `quote` (the agent's own
words) and `list` (facts with their age). Sections stay pure and run under `node --test`; `components/AgentCard.tsx`
draws the rows with the kit's primitives (Card, Chip, Button). `renderAgentCard` skips a section whose `when` is
false or whose rows come out empty.

The sections shipped:

| Section | When | Shows |
| --- | --- | --- |
| Now | always | Where it is (building, room, or in a three-room building the hall and the desk: "on the floor at a worker desk"; "inferred" when it is), the lane chip and posture, a proxy note, the stale note ("No team snapshot: no team probe has reported to this crewhub-loops" when none ever came, as on the development instance); **Team says** the team's own status word (an old snapshot's word is "Team said ..., in a snapshot that is old now"; "nothing: not in the team snapshot" when the team does not know the agent, and for an external bot "nothing: an external bot has no pane for the team to watch"), the status line; **Seen by loops** from `lastSeenAt` ("3 min ago", "never", or "Not seen by loops: for 2 h"), with "not known to be working" whenever nothing fresher than 5 minutes says so; the lit alerts. Text, never colour alone. |
| Work | a ticket or a line | The ticket (linked), its status and chips (priority, blocked, held, waiting on, stall), the project, the last progress line with its age. |
| Lane | loops gave a lane or a flag, the team named a computer, or it is a worker | **Set up as** (kind, model, effort) and **Permission mode**: the desired lane. **Seen running**: what was observed, by the probe or from its start, how long ago; then either "No drift: it runs as set up", or a `drift in model, permission mode` chip with one row per field ("model drift: set up as claude-fable-5-1, seen claude-opus-5-5"), in loops' own drift words. "Never seen running" when there is no observation. **Lifecycle** (fixed or closed, "restarting now"), **Session** and pane, **Computer** ("This computer, where loops runs" or "buildbox, remote"). An external bot has no lane and says so: "External bot: no lane, it runs elsewhere" ("; reads only" for a reader); a laneless agent: "No lane: loops has not tied this agent to a pane". **In loops**: the role and flags (CrewHub lead, coordinator, operator, external bot, disabled); attention chips for "needs login, since 40 min ago" and "3 deliveries not picked up for over a day". For a worker, whose it is. |
| Projects | any building or project | Each building with the agent's part in it (leads it, member, works here), and projects loops names that have no building here. |
| Recent | any fact | The last five facts about it, newest first, with their age in source time. |

To add a section: one file under `sections/`, one line in `AGENT_CARD_SECTIONS`, a case in
`apps/world/test/agentCard.test.ts`. A row vocabulary a section needs and does not have is added to `types.ts` and
drawn once in `AgentCard.tsx`.

## The portrait

The card's portrait is the figure itself: `TownScene.portrait(key, canvas)` renders the scene from the figure's front
into a corner of the drawing buffer and copies that square onto the card's 2D canvas, so the cast, the colourway,
the pose and the scene's light and tone mapping are the ones on screen. It is drawn on open and every 1.5 s after
(the figure moves), never while the tab is hidden.

## Follow

The card's **Follow** button, or **Shift+F** with an agent selected (F alone is the frame rate overlay), keeps the
camera on the figure: across rooms, through the door into the town and into another building. `TownScene.follow(key)`
glides the camera's target after the figure every frame (a cut under reduced motion) and settles the zoom at about a
building unless the viewer was already closer; zoom and turn still work under a follow. When the figure crosses a
building's bounds (with a margin against the door) the scene asks the app for that level (`followed(building)`), so
the breadcrumb and the labels follow the figure, while the frame does not jump: the level's usual framing is skipped
under a follow. The breadcrumb shows "Following <name>" with a stop control. A drag, Escape, Shift+F, the stop
control, a jump or entering a building by hand stops following; so does the figure leaving the world.

## Chat

In live mode the card's **Chat** button ("Chat with <name>" to a screen reader) opens the world's Chat panel
(`components/ChatPanel.tsx`): crewhub-loops' own chat, framed from the loops web app the host names, titled "Chat with
<name>". The frame asks loops for that agent's chat (`/?chat=<loops agent id>`, the world's key of a registered agent;
a loops of world/viewer-key cb163004 or later opens it through its dock's own rule, an older loops ignores it), so the
panel also says which chat head to open in loops' dock, what it needs (signed in to loops as a person in this browser,
chat bubbles on), and links to the app as the fallback. The frame's sandbox and the reasons for each token are in `state/chatPanel.ts`.
The panel's close button, or Escape while the focus is outside the frame, returns the focus to the card's button. The
demo's card has no Chat button: the demo's chat is its own scripted dock.

Calm-label rules hold: the card replaces the selected agent's nameplate, nothing else changes; the town and the
building keep their quiet signs.
