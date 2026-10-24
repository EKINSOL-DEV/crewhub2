/* Prop semantics: footprints, blocking, tags and approach cells of the builtin props. Style-free: a style decides
   how a prop looks (`furniture.<id>`), never where it may stand. The building's interior furniture is in
   buildingTemplate.ts (`interiorDefinitions`). */
import type { Definitions } from "@crewhub/world-engine";

export const definitions: Definitions = {
  desk: {
    id: "desk",
    label: "Workstation",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["work", "inspect-output"],
    approaches: [{ x: 1, z: 2 }],
  },
  plant: {
    id: "plant",
    label: "Bird of paradise",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["decoration", "greenery"],
    approaches: [],
  },
  bench: {
    id: "bench",
    label: "Oak bench",
    footprint: { width: 3, depth: 1 },
    blocksMovement: true,
    tags: ["rest"],
    approaches: [{ x: 1, z: 1 }],
  },
  lamp: {
    id: "lamp",
    label: "Floor lamp",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["light"],
    approaches: [],
  },
  sofa: {
    id: "sofa",
    label: "Soft landing",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["rest", "gather"],
    approaches: [{ x: 1, z: -1 }],
  },
  table: {
    id: "table",
    label: "Coffee table",
    footprint: { width: 2, depth: 2 },
    blocksMovement: true,
    tags: ["gather"],
    approaches: [],
  },
  shelf: {
    id: "shelf",
    label: "Library",
    footprint: { width: 1, depth: 3 },
    blocksMovement: true,
    tags: ["storage"],
    approaches: [{ x: 1, z: 1 }],
  },
};
