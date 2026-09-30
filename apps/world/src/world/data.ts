import type { Definitions } from "@crewhub/world-engine";

/* The scene palette: the Greenhouse materials, lighting and robot colours, reused for the whole town. This file and
   models.ts are the only scene files that hold colours (hex guard exception); project colours come from the design
   tokens at runtime (see TownScene). */
export const palette = {
  hemisphereSky: "#f7f5df",
  hemisphereGround: "#8c9c8b",
  sun: "#fff0cf",
  fill: "#e1efff",
  plinth: "#c7c7af",
  rim: "#f2ecdc",
  street: "#dad8c2",
  lawn: "#b8c4a2",
  lawnEdge: "#a4ae81",
  step: "#dad8c2",
  chalk: "#e8e4d1",
  /** Boarded-up walls of an archived project. */
  chalkDim: "#aaa596",
  visor: "#283f36",
  eye: "#efffdc",
  ledge: "#c4c7ac",
  skirt: "#b8bfa4",
  mullion: "#728c76",
  timber: "#baa47b",
  pendantCable: "#839079",
  pendantShade: "#d9cbb0",
  pendantGlow: "#fff4cd",
  rug: "#d6cdb3",
  plank: "#9c7b58",
  pole: "#839079",
  emblemPlinth: "#f2ecdc",
  focusRing: "#528b65",
  hoverRing: "#5b8167",
  /** Worker robots: sage, apricot, lavender (the Greenhouse crew). Leads wear their project colour. */
  bots: ["#83a995", "#e6ac7c", "#b5a5d3"],
  /** A project without a loops colour. */
  noProjectColor: "#a5b38e",
} as const;

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
