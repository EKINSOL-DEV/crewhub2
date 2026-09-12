# Browser world

This workspace contains the runnable development fixture. Start it from the
repository root with `npm run dev`.

`src/mock.ts` produces a deterministic snapshot. `src/App.tsx` displays it and
cycles its status when requested. There is no socket connection, model access,
agent execution, persistent session store, or background polling.

The next build should replace the fixture with the room described in
[the visual brief](../../docs/VISUAL_DIRECTION.md). Select and add the rendering
dependencies at that milestone. Keep browser code independent of Tauri and bridge
implementation details; consume the shared application contract.
