# World styles

Status: implemented on the demo branch (2026-10-01). One style exists, Greenhouse. External loading, a style
marketplace and a style editor are **not built**; this document describes the contract a future plugin would
implement.

A world style is the look of CrewHub World's 3D scene: the town, the buildings, their rooms and furniture, the
ticket objects, the robots, the drone and the light. It is a swappable package behind one seam. The 2D interface
around the scene does not belong to a style; it follows the crewhub-loops design system
([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).

## The seam

| Piece | Where | What |
| --- | --- | --- |
| Contract | `packages/world-style` (`@crewhub/world-style`) | Types only: `WorldStyle`, `StyleManifest`, `ModelKey`, `ModelOptions`, `LightingPreset`, `RobotHandle`, `ResolvedStyle`. No implementation, no colours. |
| Greenhouse | `packages/style-greenhouse` (`@crewhub/style-greenhouse`) | The first style. Exports `greenhouseStyle: WorldStyleFactory`. |
| Registration | `apps/world/src/world/style.ts` | The only module outside a style package that imports one. It registers the factories and names the town default. |
| Registry | `apps/world/src/world/styleRegistry.ts` | `registerStyle(factory)`, `getStyle(id)`, `listStyles()`, `styleIdFor(plot)`, `styleFor(plot)`. Nothing in it knows a particular style. |

A test (`apps/world/test/styleBoundary.test.ts`) fails when any other module imports the Greenhouse package or reaches
into its files by a relative path.

### Per-building resolution

There is no global style. A building's style is resolved from its plot: the plot's style id when it is registered,
else the town default (`DEFAULT_STYLE_ID`, `"greenhouse"`). The town-level pieces (ground, lawns, lamps, post office,
town hall, lights) use the town default; each building's shell, rooms, furniture, ticket objects, robots and drone
use the building's resolved style. The registry keeps one instance per id. Tonight no plot sets a style id, so every
building resolves to Greenhouse, and there is no UI to choose one; the Settings card shows a read-only
"Style: Greenhouse" line. The style id becomes part of the town document in phase 5.

## The manifest

Every style declares a manifest (for Greenhouse: `packages/style-greenhouse/style.json`):

| Field | Meaning |
| --- | --- |
| `id` | Stable id, used by plots and the registry (`greenhouse`). |
| `name` | Shown to people (`Greenhouse`). |
| `version` | Semver of the style. |
| `description` | One or two sentences. |
| `coveredKeys` | The semantic model keys the style provides. A test checks it equals what the style actually draws. |
| `palette` | A colour for every palette name (below). |
| `lighting` | A `LightingPreset` per theme: `day` and `lamplight`. |

A style may keep more data in its manifest file. Greenhouse adds `swatches` (named colours internal to the style:
walls, lawn, robot parts) and `lamplightSwatches` (the swatches that change under lamplight).

## Palette names

Model data never holds hex. Colours are named: the 22 `crewhub-prop/1` materials (`timber`, `timber-light`, `chalk`,
`cream`, `paper`, `sage`, `moss`, `leaf`, `leaf-dark`, `soil`, `terracotta`, `clay`, `brass`, `slate`, `graphite`,
`glass`, `lamp-glow`) including the loops project colours (`coral`, `tangerine`, `circle`, `mist`, `ink`). A style
resolves each name (`color(name, theme)`). Renderers pass a project colour as `ModelOptions.accent`; the style decides
where the accent shows (a wall trim, a flag, a banner, the lead robot).

## Semantic model keys

Renderers ask by key; the style decides the look. Every model's origin is its footprint centre on the floor, its front
faces +z, and one world unit is one metre (a grid cell is 0.6).

| Keys | Meaning | Options used |
| --- | --- | --- |
| `ground`, `plot`, `path`, `street-lamp`, `planting` | The town plinth and street, a lawn, a paving slab, a street lamp, a potted plant. | `size`, `seed` |
| `wall`, `wall.glass`, `wall.low` | A tall wall, a framed glass wall, a low wall; they run along x and stretch to `size`. | `size`, `accent`, `variant: "archived"` |
| `door` | The entrance step. | `size` |
| `floor` | A room floor. | `size`, `variant: "dim"` (an empty room) |
| `room.sign` | The small floor plaque where a room's HTML label stands. | |
| `building.flag`, `building.planks` | The project flag (half-mast when archived), planks across a boarded-up door. | `accent`, `variant`, `size` |
| `emblem.<icon>` | The loops project icon as a sculpture: `home`, `inbox`, `bot`, `spark`, `users`, `star`, `folder`. | `accent` |
| `post-office`, `town-hall` | The civic buildings. | |
| `mailbox`, `letter`, `letter.flagged` | The lobby mailbox; a letter; a letter the postman could not deliver. | |
| `furniture.<definition id>` | Builtin props and interior furniture: `desk`, `plant`, `bench`, `lamp`, `sofa`, `table`, `shelf`, `workdesk`, `lead-desk`, `rack`, `planning-table`, `review-pile`, `pallet`, `mailbox`, `meeting-table`. | `seed` |
| `ticket.task`, `ticket.feature`, `ticket.bug`, `ticket.question` | Work objects by ticket kind: a folder, a cardboard box, a crate with a bug stamp, an envelope with a question mark. | |
| `ticket.tag` | A priority tag; `urgent` and `high` differ in shape (two flags, one flag) as well as colour. | `variant`, `accent` |
| `ticket.strap`, `ticket.seal`, `ticket.band` | Blocked (straps), held (tape), a milestone band; they stretch to the ticket. | `size`, `accent` |
| `ticket.sticker`, `ticket.nametag`, `ticket.speech` | A label sticker (`variant: "star"` for a prop request), the name tag of the person a ticket waits on, the comment speech mark. | `accent`, `variant` |
| `pallet` | A full pile wrapped on a pallet; also the pile height in the town view. | |
| `drone`, `cart`, `truck` | The ticket drone, the postman's cart, the Dispatch truck. | `accent` |
| `beacon`, `trophy`, `banner`, `desk-lamp`, `quiet-clock` | The attention beacon, the release trophy and banner, a desk lamp (`variant: "dim"` when a desk's ticket is stalled), the stall clock. | `variant`, `accent` |
| `error-crate` | Stands in for a prop that failed validation. | |
| `sparkle`, `focus-ring` | The celebration and materialise sparkle; the keyboard focus frame around a room or plot. | `size` |

Conventions for models:

- `object.userData.surface` (metres): the height where objects are set down, for furniture whose bounding box is taller
  than its top (desks with a screen). Without it, renderers use the bounding box top.
- `object.userData.animate = (seconds) => void`: a model that moves by itself (the drone's rotors). Renderers call it
  each drawn frame and skip it under reduced motion.

### Robots, environment, materialise

- `robot({ key, accent, role })` returns a `RobotHandle`: `setPosture("focused" | "relaxed" | "raised-hand" |
  "greyed" | "walking")`, `setProxy(bool)` (the translucent echo), `setAlert(bool)` (a lit halo), `update(seconds)`
  (idle motion and the walk; callers skip it under reduced motion), `setDetail("near" | "far")` and `dispose()`.
  "far" is a robot seen from the town: the style may drop small parts and shadows (Greenhouse drops the badge, eyes,
  ears, antenna stem and hands, and casts no shadow) but keeps the silhouette, colours and postures. The style decides the rig; postures carry the
  meaning from the world model.
- `environment(scene, renderer, theme)` adds the lights, tone mapping and background for a theme and returns a handle
  with `setTheme`, `setShadowReach` and `dispose`. The UI's light theme is `day`, the dark theme is `lamplight`
  (warmer, dimmer key light, lit windows and desk lamps, a darker ground).
- `setTheme(theme)` re-colours the style's shared materials; the renderer calls it for every style in use.
- `materialise(object, progress)`: the appear effect from 0 (gone) to 1 (there); running it backwards de-materialises.
  The drone and the truck use it; phase 5's props will too.
- `parts(prop)` draws a validated `crewhub-prop/1` model with the style's materials: one parts renderer for the prop
  builder's props and for the style's own data models.

## How Greenhouse implements it

Data first, code where it needs code.

| Data (`style.json`, `models/*.json`) | Code (`src/`) |
| --- | --- |
| The manifest, palette, swatches and both lighting presets. | `robot.ts`: the soft robot and its posture rig. |
| 27 parts-JSON models: the four ticket looks, both tags, the name tag, letters, mailbox, both pallets, trophy, banner, both desk lamps, quiet clock, error crate, drone body, cart, truck, beacon, rack, planning table, review pile, meeting table. | `shaders.ts`: the floor, glass and halo shaders. |
| A variant is a file `<key>.<variant>.json` (`ticket.tag.urgent.json`, `desk-lamp.dim.json`). | `pieces.ts`: pieces that stretch or repeat (walls, floors, ground, emblems, civic buildings, straps, bands, stickers, focus frame). |
| A model tagged `accent-<material>` draws that material's parts in the caller's accent colour. | `furniture.ts`: the Greenhouse furniture with instanced leaves and a glowing screen (desk, plant, bench, lamp, sofa, table, shelf, workdesk, lead desk). |
| | `index.ts`: the drone's rotor blades (the one code hook on a data model). |

Every model file passes `validatePropModel` (`packages/style-greenhouse/test/models.test.ts`). Small decorations get
the validator's coverage warning (the parts cover little of a 1 x 1 footprint); that is expected and not an error.
Converting the older code furniture (desk, sofa, shelf and the rest) to parts-JSON is not done yet.

## What a third-party style must provide

- A `WorldStyleFactory` with a manifest: id, name, semver version, description, `coveredKeys`, a colour for every
  palette name and a lighting preset for `day` and `lamplight`.
- The `WorldStyle` methods: `model`, `robot`, `parts`, `color`, `setTheme`, `environment`, `materialise`, `dispose`.
- A minimum set of keys is not enforced. `model` returns `null` for a key the style does not cover; the registry then
  draws a neutral placeholder (a plain mist crate, `PLACEHOLDER_MODEL`, drawn by the style's own `parts`) and warns
  once per key. So a style may cover a subset and still render a complete world.

Rules:

- Palette names, never hex, in model data. Hex belongs only in a style's manifest data; the design-system check scans
  `packages/style-*/src` and rejects hex there.
- No semantics in a style: footprints, blocking, approach cells, room roles and the building template come from the
  engine and the app (`buildingTemplate.ts`, `definitions.ts`). A style never decides where something may stand.
- Collision comes from footprints, never from meshes.
- Status is never colour alone: the style draws shapes (two flags for urgent, straps for blocked, a raised hand), and
  the HTML labels carry the words.
