# The prop format: `crewhub-prop/1`

This is the authoritative description of a CrewHub World prop file. The TypeScript source is
`packages/world-engine/src/props.ts` (`validatePropModel`), and a drift test checks that the shape, material,
category and limit tables below match it exactly. If you change one, change the other.

A prop file is one JSON object. The validator is strict: every key not listed here is an error.

## The idea: semantics first, looks second

A prop is two things under one id:

1. **What the grid engine knows**: the footprint in cells, whether it blocks movement, and the approach cells
   where a crew member stands to use it. Only these drive where it can be placed, where robots can walk and where
   they stop. Collision comes from the footprint, never from the parts.
2. **What it looks like**: a list of simple parts (boxes, cylinders, spheres, cones, tori), each with a size, a
   position, an optional rotation and a named material. The parts must fit inside the footprint, but they never
   change navigation.

## Units and axes

- World units are metres. **One grid cell is 0.6 wide.** A footprint of `width` × `depth` cells covers
  `width × 0.6` along x and `depth × 0.6` along z.
- The origin of the prop is the **centre of its footprint, on the floor**. y points up and the floor is y = 0.
- x runs along the footprint's width (left to right), z along its depth. **The front of a prop faces +z**:
  put the working side (a screen, the drawers, a seat) toward +z and the approach cells at `z = depth`.
- A part's `position` is the **centre** of the part.
- Rotations are in degrees, applied in XYZ order (three.js Euler `"XYZ"`).

## Top-level keys

| Key | Type | Rule |
| --- | --- | --- |
| `format` | string | exactly `"crewhub-prop/1"` |
| `id` | string | `user:<kebab-slug>` for props you make (`user:reading-lamp`); `builtin:<slug>` is reserved for props that ship with the app. Slug: lowercase letters, digits and single hyphens, at most 40 characters. |
| `name` | string | 1 to 40 characters, what people read ("Reading lamp") |
| `description` | string | 0 to 200 characters, one sentence |
| `category` | string | one of the categories below |
| `tags` | string[] | 0 to 8 kebab-case tags, each at most 24 characters, no duplicates |
| `footprint` | object | `{ "width": 1..6, "depth": 1..6 }`, whole cells |
| `blocksMovement` | boolean | `true` if robots cannot walk through it (almost everything); `false` for a rug or a floor light |
| `approaches` | `{x, z}`[] | 0 to 8 cells where someone stands to use the prop, relative to the footprint's first cell (x 0 is the leftmost column, z 0 the back row). Each is inside the footprint or one cell around it (`x` from -1 to `width`, `z` from -1 to `depth`). A blocking prop's approaches must be outside it. `z = depth` is in front. |
| `parts` | part[] | 1 to 64 parts |
| `provenance` | object | optional; the app adds it: `{ "kind": "ticket", "ticketKey": "CREW-12" }` or `{ "kind": "local" }` |

## Part keys

| Key | Type | Rule |
| --- | --- | --- |
| `shape` | string | one of the shapes below |
| `size` | [n, n, n] | see the shape table; every used value 0.01 to 3; unused values are 0 |
| `position` | [x, y, z] | centre of the part, each between -5 and 5 |
| `rotation` | [x, y, z] | optional, degrees, each between -360 and 360, default `[0, 0, 0]` |
| `material` | string | one of the materials below; hex colours are not allowed |
| `radius` | number | optional, **box only**: corner rounding, 0 to 0.5, default 0.04 (clamped to a third of the smallest side) |
| `emissive` | boolean | optional: the part glows (a bulb, a screen) |

## Shapes

| Shape | `size` | Notes |
| --- | --- | --- |
| `box` | [width x, height y, depth z] | A soft rounded box. The workhorse. |
| `cylinder` | [radiusTop, height, radiusBottom] | Upright. A radius may be 0 (a point) but not both. Different radii give a lampshade or a pot. |
| `sphere` | [radiusX, radiusY, radiusZ] | `[r, r, r]` is a ball; unequal radii give an ellipsoid (a leaf, a cushion, a kettle). |
| `cone` | [radius, height, 0] | Upright, point at the top. |
| `torus` | [radius, tube, 0] | A ring lying flat (the hole looks up), like a rim on a pot. `tube` is at most `radius`. Rotate `[90, 0, 0]` to stand it up facing +z. |

## Materials

Named materials only. They are the Greenhouse palette family plus the five loops project colours. Use the loops
colours sparingly, as accents (a sticky note, a mug), never for whole furniture.

| Material | Looks like |
| --- | --- |
| `timber` | warm oak, table tops and frames |
| `timber-light` | pale oak, shelves and inlays |
| `chalk` | chalk-white wall paint, cabinet fronts |
| `cream` | warm cream, lampshades, ceramics |
| `paper` | off-white paper, labels, stacks |
| `sage` | soft sage green, upholstery, cabinets |
| `moss` | deep moss green, bases and feet |
| `leaf` | bright leaf green |
| `leaf-dark` | dark leaf green |
| `soil` | dark soil in a pot |
| `terracotta` | pale terracotta, plant pots |
| `clay` | light clay, cork, crates |
| `brass` | muted brass, poles, handles |
| `slate` | slate green-grey, legs and metal |
| `graphite` | dark graphite green, lamp arms, screen frames |
| `glass` | pale green glass, see-through |
| `lamp-glow` | warm light; use with `"emissive": true` |
| `coral` | loops coral accent |
| `tangerine` | loops tangerine accent |
| `circle` | loops deep coral-red accent |
| `mist` | light grey |
| `ink` | near-black |

## Categories

| Category | For |
| --- | --- |
| `work` | desks, workbenches, anything a crew member works at |
| `rest` | seats, sofas, beds |
| `gather` | tables, kettles, places to meet |
| `storage` | shelves, cabinets, crates |
| `greenery` | plants |
| `light` | lamps |
| `decoration` | boards, art, rugs, everything else |

## Fitting the footprint

Every part's axis-aligned bounds **after rotation** must lie:

- within the footprint plus a decorative overhang of 0.1 on each side: `|x| ≤ width × 0.3 + 0.1` and
  `|z| ≤ depth × 0.3 + 0.1`, so a 1 × 1 prop may use x and z from -0.4 to 0.4;
- between y = 0 (the floor) and y = 3.

The bounds are exact for every shape, including tilted ones. A part that reaches below the floor is an error, and so is one fully below it.
The parts together must have a volume of at least 0.0005 m³.

**Warning, not error:** if the outline of all parts together covers less than 25% of the footprint area, the
validator warns that the footprint does not match the parts (a small lamp on a 3 × 3 footprint). The prop still
imports, because a deliberately roomy footprint (a reading chair with room around it) is allowed, but usually the footprint
should shrink.

## Limits

The exact numbers the validator uses (`PROP_LIMITS`).

| Limit | Value | Meaning |
| --- | --- | --- |
| `cellSize` | 0.6 | width of one grid cell, world units |
| `footprintMin` | 1 | smallest footprint side, cells |
| `footprintMax` | 6 | largest footprint side, cells |
| `partsMin` | 1 | fewest parts |
| `partsMax` | 64 | most parts |
| `nameMax` | 40 | longest name, characters |
| `descriptionMax` | 200 | longest description, characters |
| `tagsMax` | 8 | most tags |
| `tagMax` | 24 | longest tag, characters |
| `slugMax` | 40 | longest id slug, characters |
| `approachesMax` | 8 | most approach cells |
| `sizeMin` | 0.01 | smallest used size value |
| `sizeMax` | 3 | largest size value |
| `overhang` | 0.1 | how far parts may stick out of the footprint on each side |
| `heightMax` | 3 | highest point of any part |
| `positionMax` | 5 | largest absolute position value |
| `rotationMax` | 360 | largest absolute rotation, degrees |
| `cornerRadiusMax` | 0.5 | largest box corner radius |
| `cornerRadiusDefault` | 0.04 | box corner radius when `radius` is left out |
| `minTotalVolume` | 0.0005 | smallest total volume of all parts, m³ |
| `coverageWarning` | 0.25 | below this share of the footprint covered, the validator warns |

## A complete example

```json
{
  "format": "crewhub-prop/1",
  "id": "user:floor-lamp",
  "name": "Floor lamp",
  "description": "A tall brass reading lamp with a cream shade and a warm bulb.",
  "category": "light",
  "tags": ["lamp", "reading"],
  "footprint": { "width": 1, "depth": 1 },
  "blocksMovement": true,
  "approaches": [],
  "parts": [
    { "shape": "cylinder", "size": [0.19, 0.05, 0.21], "position": [0, 0.025, 0], "material": "moss" },
    { "shape": "cylinder", "size": [0.026, 1.6, 0.026], "position": [0, 0.85, 0], "material": "brass" },
    { "shape": "torus", "size": [0.05, 0.012, 0], "position": [0, 1.02, 0], "material": "brass" },
    { "shape": "sphere", "size": [0.075, 0.075, 0.075], "position": [0, 1.6, 0], "material": "lamp-glow", "emissive": true },
    { "shape": "cylinder", "size": [0.12, 0.33, 0.26], "position": [0, 1.72, 0], "material": "cream" }
  ]
}
```

## Validator messages

`npm run prop:validate -- <file.json> [more.json]` prints one line per problem, as `<file>: <path>: <message>`,
for example `lamp.json: parts[3].size[1]: must be between 0.01 and 3`. Warnings print as
`<file>: warning: <path>: <message>`. Exit code 0 means every file is valid (warnings allowed), 1 means at least
one file is invalid (or not JSON), 2 means a usage error (no file given, an unknown option, a file that cannot be
read).
