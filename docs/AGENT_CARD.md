# The agent card and the follow camera

Click an agent's figure inside a building and a card opens beside it (a bottom sheet on a phone): what the agent is
doing now, from the facts the projection holds. Enter on a selected agent opens it too (the jump list lands with the
agent selected). Escape and a tap outside close it. The card is not modal: the world stays live behind it, and the
figure keeps walking while the card follows its anchor.

The card reads the projection, never the source, so it is the same in demo and live mode: the demo gives what its
script knows, a real crewhub-loops gives more (the lane, the flags). An absent fact is simply not shown; nothing is
invented. In demo mode a ticket has no link, and the footer says the facts are scripted.

## Where the facts come from

`agentCardFacts(model, facts, key)` in `packages/world-model/src/agentCard.ts` (pure, tested) gathers one
`AgentCardFacts` from the world model (the agent's placement, its building, the ticket on its desk) and the facts behind
it:

| Field | From |
| --- | --- |
| `agent`, `building`, `stateWords` | The reducer's `AgentPlacement` (the real one when the agent is in a building), and the text view's sentence: lane status and posture, in words. |
| `work`, `workProject` | The ticket on its desk (`deskTicketKey`), else the in-progress ticket loops assigned to it. |
| `progress` | Its last `ticket.progress` line (a worker's line without the `"<worker>: "` prefix, through `linesOf`). |
| `team` | Its lane in the team snapshot (`GET /api/team`): status, the status line, the lead it works for. |
| `loops` | `GET /api/agents`: role, `isCrewhubLead`, `isCoordinator`, `isOperator`, the herdr session, `projects {lead, member}`. Null for a worker. |
| `lane` | `AgentDetailOut.lane` (`contracts/agents.py`, `AgentLane`), read defensively from the wire (`laneFacts`): kind, model, effort, permission mode, lifecycle, what the probe observed, the drift. The client types keep `lane` as `unknown`; the card never trusts a field it did not check. |
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
| Now | always | Where it is (building, room; "inferred" when it is), the lane chip and posture, a proxy note, the stale note, the status line, the lit alerts. |
| Work | a ticket or a line | The ticket (linked), its status and chips (priority, blocked, held, waiting on, stall), the project, the last progress line with its age. |
| Lane | loops gave a lane or a flag, or it is a worker | Runs on (kind, model, effort), permission mode, lifecycle, what the probe observed, the drift; the loops role and flags, the session; for a worker, whose it is. |
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

Calm-label rules hold: the card replaces the selected agent's nameplate, nothing else changes; the town and the
building keep their quiet signs.
