# @crewhub/demo

A scripted, deterministic, in-memory crewhub-loops behind the `WorldSource` seam
of `@crewhub/loops-client`. With it, the world runs entirely in demo mode, on data
in exactly the shapes crewhub-loops serves. It is pure TypeScript: no React, no
Three.js, no DOM, no network and no model calls. Wall time comes from an injected
scheduler.

```ts
import { browserScheduler, createDemoSource } from "@crewhub/demo";

const source = createDemoSource({ scheduler: browserScheduler() });
const stop = source.start((message) => projection.apply(message));
source.playback.setSpeed(16);
source.playback.seek(5 * 60_000);
source.createPropRequest("a coffee machine"); // build mode, demo only
```

- `src/content.ts`: people, agents, projects, tickets, milestones, releases, lanes.
- `src/store.ts`: the loops state and the read models (`ProjectOut`, `BoardResponse`,
  `Ticket`, `TeamSnapshot`, `WatchdogResponse`, and so on).
- `src/actions.ts`: loops-level changes that append the envelopes of `events.md`.
  They also enforce loops' rules; for example, agents never move a ticket to Done.
- `src/script.ts`: the 16-minute storyline with seeded jitter.
- `src/source.ts`: `createDemoSource`, with playback, loops, seek, heartbeats and
  prop requests.
- [CONTENT.md](CONTENT.md): the content and the storyline, minute by minute.

Everything this package produces is fiction and must be labelled as demo wherever
it is shown.
