# Loops client

The crewhub-loops wire types (transcribed from `docs/integrators/` in crewhub-loops at `053b5f47`), hand-written
runtime validators, the event allowlist, the `WorldSource` seam, and the two sources' contract: the demo
(`packages/demo`) and the live source here.

- `src/source.ts`: `WorldSource`, `LoopsSnapshot`, `SourceMessage`, `ConnectionStatus` (the live chip's states).
- `src/hostSource.ts`: `createHostSource(options)` reads the world's own host (`apps/host`) at `/world-api`: one
  snapshot, then SSE events by `seq`; a `reset` or a `seq` gap re-snapshots (`catching-up`); heartbeats keep it
  `live`; 40 s of silence is `stale`; the host's `status` says `loops-down` or `unauthorized`. `probeHost(baseUrl?,
  timeoutMs?)` answers `GET /world-api/health` or `null`. The only file in the browser that may fetch
  (`scripts/scan-model-calls.ts`). `options.timings` shortens the clocks for tests.
- `src/validate.ts`: unknown keys are dropped; a ticket `kind` or `status` and an event `type` the package does not
  know warn once per value and pass through (so `grill`, CL-245, or the next addition never drops a snapshot).

No React, no Three.js, no DOM. Tests: `node --test packages/loops-client/test/*.test.ts` (the host-source tests
start their own server on `127.0.0.1` port 0).
