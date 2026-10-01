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
else the town default (`DEFAULT_STYLE_ID`, `"greenhouse"`). The town-level pieces (ground, lawns, paths, the town
dressing, the landmarks, lights) use the town default; each building's shell, rooms, furniture, ticket objects, robots and drone
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
| `lighting` | A `LightingPreset` per theme: `day` and `lamplight`: sky, ground and key/fill lights, exposure, the blob shadows' opacity, the lamps' `glow` and the warm light `pools`. |

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
| `ground`, `plot`, `path`, `street-lamp`, `planting` | The town's diorama slab with a grass top, a raised lawn (`variant: "meadow"` for an empty plot), a paving slab, a street lamp, a potted plant. | `size`, `seed`, `variant` |
| `wall`, `wall.glass`, `wall.low` | The tall chalk back wall with framed windows, the greenhouse glass wall, the low rim on the sides facing the camera; they run along x and stretch to `size`. | `size`, `accent`, `variant: "archived"` |
| `door` | The front door: a chalk portal, door leaves and an awning in the accent, planters, a doormat, steps to the lawn. | `size`, `accent`, `variant` |
| `floor` | A room floor. | `size`, `variant`: `wood`, `tile`, `concrete`, `dim` (an empty room) or none (cream cells) |
| `room.sign` | The small floor plaque where a room's HTML label stands. | |
| `building.flag`, `building.planks` | The project flag (half-mast when archived), planks across a boarded-up door. | `accent`, `variant`, `size` |
| `building.<piece>` | The rest of the shell: `slab` (the cream block under the rooms), `partition` and `door-frame` (inside walls and their openings), `apron` and `loading-door` (dispatch's truck bay), `wall-lamp` (by a door, with a light pool), `bike`, `name-sign` (the building's name painted over the front door), `silhouette` (far-detail furniture stand-ins by `variant`), `ivy` and `closed-sign` (archived buildings). | `size`, `accent`, `variant`, `text` (the name sign's words) |
| `emblem.<icon>` | The loops project icon as a sculpture: `home`, `inbox`, `bot`, `spark`, `users`, `star`, `folder`. | `accent` |
| `post-office`, `town-hall` | The civic buildings, each with an open forecourt at its front for the robots that stand there. | |
| `civic.<landmark>` | The town's landmarks and their parts: `square` (with the fountain), `cafe`, `bus-stop`, `greenhouse`, `windmill`, `welcome-sign`, `clock-post`, `duck`, and pieces such as `fountain`, `park-bench`, `planter`, `flower-bed`, `cafe-table`, `menu-board`, `notice-board`, `parcel-stack`. | |
| `town.<piece>` | Town dressing: `paving` (`cobble` or `flag`), `hedge`, `flower-bed`, `pond`, `bridge`, `fence`, `lantern`, `crossing`, `wear`, `contact-shadow`, trees (`oak`, `birch`, `pine`, `fruit-tree`, `bush`), `grass`, `flowers`, `wildflowers`, `lily`, `bench`, `signpost`, `bike-rack`, `mailbox`, `gate`, and the empty plots' `swing`, `slide`, `sandpit`, `picnic-blanket`, `shed`, `veg-bed`. | `size`, `variant`, `seed` |
| `decor.<piece>` | Room dressing that never blocks movement: rugs, pendant lamps, clocks, whiteboards, pin boards, wall art, screens, window boxes, meeting chairs, desk books and plants, the dispatch roller door. | |
| `mailbox`, `letter`, `letter.flagged` | The lobby mailbox; a letter; a letter the postman could not deliver. | |
| `furniture.<definition id>` | Builtin props and interior furniture, each with a definition, so it blocks movement: `desk`, `plant`, `bench`, `lamp`, `sofa`, `table`, `shelf`, `workdesk`, `lead-desk`, `rack`, `planning-table`, `review-pile`, `pallet`, `mailbox`, `meeting-table`, and the room dressing's `lounge-sofa`, `coffee-table`, `bookshelf`, `armchair`, `coffee-counter`, `round-table`, `planter` and the rest. | `seed` |
| `ticket.task`, `ticket.feature`, `ticket.bug`, `ticket.question` | Work objects by ticket kind: a folder, a cardboard box, a crate with a bug stamp, an envelope with a question mark. | |
| `ticket.tag` | A priority tag; `urgent` and `high` differ in shape (two flags, one flag) as well as colour. | `variant`, `accent` |
| `ticket.strap`, `ticket.seal`, `ticket.band` | Blocked (straps), held (tape), a milestone band; they stretch to the ticket. | `size`, `accent` |
| `ticket.sticker`, `ticket.nametag`, `ticket.speech` | A label sticker (`variant: "star"` for a prop request), the name tag of the person a ticket waits on, the comment speech mark. | `accent`, `variant` |
| `pallet` | A full pile wrapped on a pallet; also the pile height in the town view. | |
| `drone`, `cart`, `truck` | The ticket drone, the postman's cart, the Dispatch truck. | `accent` |
| `beacon`, `trophy`, `banner`, `desk-lamp`, `quiet-clock` | The attention beacon, the release trophy and banner, a desk lamp (`variant: "dim"` when a desk's ticket is stalled), the stall clock. | `variant`, `accent` |
| `crate`, `jar`, `sticker.rocket` | Rule props (plan 6.3): the release crate at Dispatch for a draft release, the bug jar on the lead's desk, the rocket that rides on a ticket labelled `awaiting-deploy`. The trophy and the milestone `banner` are rule props too. | |
| `error-crate` | Stands in for a prop that failed validation, or a placement that no longer fits its room. | |
| `sparkle`, `focus-ring` | The celebration and materialise sparkle; the keyboard focus frame around a room or plot. | `size` |
| `focus-glow`, `focus-fill`, `selection-ring` | Soft affordances: a glow round the focused or hovered plot (inside its hedges), a wash on the focused or hovered room's floor, a ring under the selected agent. Flat and static, so they show the same under reduced motion; only the hovered building's small lift animates. | `size` (glow, fill) |

Conventions for models:

- `object.userData.surface` (metres): the height where objects are set down, for furniture whose bounding box is taller
  than its top (desks with a screen). Without it, renderers use the bounding box top.
- `object.userData.animate = (seconds) => void`: a model that moves by itself (the drone's rotors, the fountain's
  water, the windmill's sails). Renderers call it each drawn frame and skip it under reduced motion.
- `userData.life` on an empty child object (`LifeSpot`: `"steam"` or `"window"`): where steam rises (a chimney, a cup)
  or where a lit window glows (facing the marker's +z). The renderer's ambient life places `town.steam` and
  `town.window-glow` there; a style without spots simply has none.

### Key namespaces

The namespaces separate what a renderer may do with a model. The art pass added four.

| Namespace | Holds | Rule |
| --- | --- | --- |
| `building.*` | The pieces of a building's shell. | Drawn by `buildingView.ts`; static, merged per material. |
| `furniture.*` | Interior furniture that blocks movement. | Needs a definition (footprint, blocking, approaches) in `definitions.ts` or the room dressing's `dressingDefinitions`. |
| `decor.*` | Room dressing that never blocks movement. | No definition; listed by `roomDecor` and never part of the grid. |
| `town.*` | The town's ground, paths and dressing, and its ambient life. | Placed by `townDressing.ts`; repeated pieces are instanced. The life keys are moved by `ambientLife.ts`. |
| `civic.*` | Landmarks and their parts. | Drawn whole by `TownScene` (so they may animate), and only once the style covers the key. |

### Lamp pools

A Greenhouse model can throw a warm pool of light on the ground in lamplight. `LIGHT_POOLS` in
`packages/style-greenhouse/src/keys.ts` maps a key to one pool or a list of pools: a radius and a position in the
model's own frame. The style adds the pool as a decal outside the static batching, so the model files stay
untouched. Today the list covers `furniture.lamp`, `street-lamp`, `desk-lamp`, `town.lantern`, `decor.pendant-lamp`,
`civic.square` (its four lamps) and `civic.cafe` (the terrace and two counter lanterns). Pools show only in lamplight
and on Pretty. This is a Greenhouse detail, not part of the contract.

### Ambient life

The town's gentle motion is drawn from eight keys: `town.bird`, `town.butterfly`, `town.firefly`, `town.mote`,
`town.window-glow`, `town.ripple`, `town.steam` and `town.cloud-shadow`. Each is one mesh on shared geometry and
nothing animates itself: `apps/world/src/world/ambientLife.ts` instances them (one draw call each) and moves the
instances.

- Forward is +x. A bird flaps when scaled in y; a butterfly folds when scaled in z.
- Glows are additive, and their instance colour sets their brightness, so the renderer fades one by darkening it.
- Where they gather comes from the town dressing (flower beds, hedges, the pond) and from the landmarks' `LifeSpot`
  markers (chimney, cups, lit windows).
- They show only with the Ambient setting on or reduced, Pretty graphics and no reduced motion. They move only while
  the playback runs.

A style that leaves these keys out simply gets the registry's placeholder, so a third-party style should either cover
them or accept plain crates drifting by. Covering them is the expected choice.

### Robots, environment, materialise

- `robot({ key, accent, role })` returns a `RobotHandle`: `setPosture("focused" | "relaxed" | "raised-hand" |
  "greyed" | "walking")`, `setProxy(bool)` (the translucent echo), `setAlert(bool)` (a lit halo), `update(seconds)`
  (idle motion and the walk; callers skip it under reduced motion), `setDetail("near" | "far")` and `dispose()`.
  "far" is a robot seen from the town: the style may drop small parts and shadows (Greenhouse drops the badge, eyes,
  ears, antenna stem and hands, and casts no shadow) but keeps the silhouette, colours and postures. The style decides the rig; postures carry the
  meaning from the world model.
- `environment(scene, renderer, theme)` adds the lights, tone mapping and background for a theme and returns a handle
  with `setTheme`, `setShadowReach(reach, center?)`, `setQuality(quality)` and `dispose`. The UI's light theme is
  `day`, the dark theme is `lamplight` (a deep blue-green evening: warm lamp light, lit windows, glowing desk and
  pendant lamps, warm pools of light). The renderer fits the shadow to what the camera frames: the ground the
  entered building's view shows gets a close, crisp shadow (fitted again after a zoom or pan), the town a cheaper,
  softer one.
- `GraphicsQuality` is the viewer's graphics setting, `"pretty"` (the default) or `"fast"`, kept per browser and read
  by renderers from `TownView.quality`. The renderer owns its own settings (shadow maps on or off, the pixel ratio)
  and calls `setQuality` on the environment; the style then drops what it draws only for Pretty (Greenhouse: the key
  light's shadow map and the warm lamp pools). Blob contact shadows under buildings (`town.contact-shadow`) and robots
  stay in both settings.
- `setTheme(theme)` re-colours the style's shared materials; the renderer calls it for every style in use.
- `materialise(object, progress)`: the appear effect from 0 (gone) to 1 (there); running it backwards de-materialises.
  The drone and the truck use it; phase 5's props will too.
- `parts(prop)` draws a validated `crewhub-prop/1` model with the style's materials: one parts renderer for the prop
  builder's props and for the style's own data models.

## How Greenhouse implements it

Data first, code where it needs code.

| Data (`style.json`, `models/*.json`) | Code (`src/`) |
| --- | --- |
| The manifest, palette, swatches and both lighting presets. | `robot.ts`: the soft robot, its posture rig and idle life (blinks, antenna nod, head tilt). |
| About a hundred parts-JSON models: the ticket looks, tags, letters, mailbox, pallets, trophy, banner, desk lamps, quiet clock, error crate, drone body, cart, truck, beacon and rule props; the room dressing (`furniture.*` and `decor.*`); the town's trees, flowers, benches, signposts, gates and playground pieces (`town.*`); the landmarks' smaller parts, the bus stop, the clock post and the duck (`civic.*`). | `shaders.ts`: the floor patterns (with sun shafts that fade at night), glass, halo, paving, grass, pond ripple and the soft decals for contact shadows and lamp pools. |
| A variant is a file `<key>.<variant>.json` (`ticket.tag.urgent.json`, `desk-lamp.dim.json`). | `shell.ts`: the building shell (walls, glass wall, rims, partitions, door frames, slab, front door, flag, planks, ivy, sign, apron, loading door). |
| A model tagged `accent-<material>` draws that material's parts in the caller's accent colour. | `town.ts`: the ground, lawns, paving, hedges, flower beds, pond, bridge, fence, lanterns, crossings and wear. |
| | `civic.ts`: the post office, town hall, square, café, greenhouse, windmill and welcome sign. They are assembled from rounded boxes, roofs and the `civic.*` data parts, and baked into one mesh per material once per kit. The fountain's water and the windmill's sails stay live. |
| | `life.ts`: the ambient life (bird, butterfly, firefly, mote, window glow, ripple, steam, cloud shadow) with its soft additive glow shader. `civic.ts` marks the post office chimney, the café's cups and every landmark window as `LifeSpot`s, kept through baking. |
| | `pieces.ts`: pieces that stretch or repeat (floors, emblems, straps, bands, stickers, focus frame). |
| | `furniture.ts`: the Greenhouse furniture with instanced leaves and a glowing screen (desk, plant, bench, lamp, sofa, table, shelf, workdesk, lead desk). |
| | `index.ts`: the code hooks on data models (the drone's rotor blades, the fountain's water) and the lamp pools. |

Every model file passes `validatePropModel` (`packages/style-greenhouse/test/models.test.ts`). Small decorations get
the validator's coverage warning (the parts cover little of a 1 x 1 footprint); that is expected and not an error.
Converting the older code furniture (desk, sofa, shelf and the rest) to parts-JSON is not done yet. The large
landmarks stay code: a building 8 or 10 units across exceeds the format's limits (a footprint of at most 3.6 units,
part sizes of at most 3, 64 parts).

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
