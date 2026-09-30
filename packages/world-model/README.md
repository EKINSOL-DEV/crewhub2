# World model

Pure TypeScript that turns crewhub-loops facts into CrewHub World's model: the
projection (facts from a `WorldSource`), the world reducer (buildings, rooms, work
objects, agent placements) and the text description of every fact the scene shows.
No React, no Three.js, no DOM, no network, no model calls. It never knows whether its
source is the demo or a future host.

`src/model.ts` is the contract between this package and the renderer in `apps/world`.
