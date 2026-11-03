# World model

Pure TypeScript that turns crewhub-loops facts into CrewHub World's model: the
projection (facts from a `WorldSource`), the world reducer (buildings, rooms, work
objects, agent placements) and the text description of every fact the scene shows.
No React, no Three.js, no DOM, no network, no model calls. It is told the mode (`ReduceOptions.mode`, demo
or live) but never reads its source.

`src/model.ts` is the contract between this package and the renderer in `apps/world`.
