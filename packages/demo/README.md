# @crewhub/demo

A scripted, deterministic, in-memory crewhub-loops behind the `WorldSource` seam
of `@crewhub/loops-client`. With it, the world runs entirely in demo mode, on data
in exactly the shapes crewhub-loops serves. It is pure TypeScript: no React, no
Three.js, no DOM, no network and no model calls. Wall time comes from an injected
scheduler.

```ts
import { browserScheduler, createDemoApi, createDemoSource } from "@crewhub/demo";

const source = createDemoSource({ scheduler: browserScheduler() });
const stop = source.start((message) => projection.apply(message));
source.playback.setSpeed(16);
source.playback.seek(5 * 60_000);
source.createPropRequest("a coffee machine"); // build mode, demo only
source.sendDm("cr-lead", "Is the pallet done?", crypto.randomUUID()); // the chat, demo only

const api = createDemoApi(source); // the loops chat routes, answered in memory
await api.handle("GET", "/api/dm/threads"); // { status: 200, body: { threads: [...] } }
```

- `src/content.ts`: people, agents, projects, tickets, milestones, releases, lanes.
- `src/store.ts`: the loops state and the read models (`ProjectOut`, `BoardResponse`,
  `Ticket`, `TeamSnapshot`, `WatchdogResponse`, and so on).
- `src/actions.ts`: loops-level changes that append the envelopes of `events.md`.
  They also enforce loops' rules; for example, agents never move a ticket to Done.
- `src/script.ts`: the 16-minute storyline with seeded jitter.
- `src/source.ts`: `createDemoSource`, with playback, loops, seek, heartbeats,
  prop requests and the person's chat (`sendDm`, `markDmRead`). A sent message
  gets its `dm` delivery at once, the postman claims and forwards it, and a
  scripted reply that starts with "(demo reply)" follows eight demo seconds later,
  with `dm.answered`. The person's chat actions stay in the timeline, so they
  survive a seek and carry into the next loop.
- `src/api.ts`: `createDemoApi(source)`, the in-browser fetch layer of the chat
  bubbles. It answers the routes of loops' `bubbles/queries.ts` (feature flag,
  pins, threads, messages, read markers, agents, agent summary) with loops' shapes,
  status codes and error envelope. While the person has never pinned, the default
  head is the lead of the building in view (`setView`), else the crewhub lead.
- [CONTENT.md](CONTENT.md): the content and the storyline, minute by minute.

Everything this package produces is fiction and must be labelled as demo wherever
it is shown.
