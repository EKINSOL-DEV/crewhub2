# World styles

Status: implemented on the demo branch (2026-10-01; round two and the performance rounds on 2026-10-02; casts on
2026-10-05). One style
exists, Greenhouse. External loading, a style
marketplace and a style editor are **not built**; this document describes the contract a future plugin would
implement.

A world style is the look of CrewHub World's 3D scene: the town, the buildings, their rooms and furniture, the
ticket objects, the drone and the light. It is a swappable package behind one seam. The figures that stand for
agents (the robots) are a **cast**, swappable apart from the style: see [Casts](#casts) at the end. The 2D interface
around the scene does not belong to a style; it follows the crewhub-loops design system
([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).

## The seam

| Piece | Where | What |
| --- | --- | --- |
| Contract | `packages/world-style` (`@crewhub/world-style`) | Types only: `WorldStyle`, `StyleManifest`, `ModelKey`, `ModelOptions`, `LightingPreset`, `ResolvedStyle`. No implementation, no colours. |
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
| `lighting` | A `LightingPreset` per theme, `day` and `lamplight`, and optionally the drift lights `dawn`, `dusk` and `night`: sky, ground and key/fill lights, exposure, the blob shadows' opacity, the lamps' `glow`, the warm light `pools`, how far into the `evening` the light is (0 by day, 1 with every lamp lit) and the `air` behind the diorama with its `airTint` (the share of the theme's own air it replaces). |

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
| `floor` | A room floor. | `size`, `variant`: `wood`, `oak` (dark planks), `tile`, `sage` (sage tiles), `concrete`, `mist` (cool cells), `dim` (an empty room) or none (cream cells) |
| `room.sign` | The small floor plaque where a room's HTML label stands. | |
| `building.flag`, `building.planks` | The project flag (half-mast when archived), planks across a boarded-up door. | `accent`, `variant`, `size` |
| `building.<piece>` | The rest of the shell: `slab` (the cream block under the rooms), `partition` and `door-frame` (inside walls and their openings), `apron` and `loading-door` (dispatch's truck bay), `wall-lamp` (by a door, with a light pool), `bike`, `name-sign` (the building's name painted over the front door), `silhouette` (far-detail furniture stand-ins by `variant`), `ivy`, `closed-sign`, `dust-sheet` and `chair-stack` (archived buildings), `floor-shade` (the soft shade along a room's walls, `size` the room). | `size`, `accent`, `variant`, `text` (the name sign's words) |
| `emblem.<icon>` | The loops project icon as a sculpture: `home`, `inbox`, `bot`, `spark`, `users`, `star`, `folder`. | `accent` |
| `post-office`, `town-hall` | The civic buildings, each with an open forecourt at its front for the robots that stand there. | |
| `civic.<landmark>` | The town's landmarks and their parts: `square` (with the fountain), `cafe`, `bus-stop`, `greenhouse`, `windmill`, `welcome-sign`, `clock-post`, `duck`, and pieces such as `fountain`, `park-bench`, `planter`, `flower-bed`, `cafe-table`, `menu-board`, `notice-board`, `parcel-stack`. | |
| `town.<piece>` | Town dressing: `paving` (`cobble` or `flag`), `hedge`, `flower-bed`, `pond`, `bridge`, `fence`, `lantern`, `crossing`, `wear`, `contact-shadow`, trees (`oak`, `birch`, `pine`, `fruit-tree`, `bush`) and their autumn keys (`oak-autumn`, `birch-autumn`, `bush-autumn`: separate keys, not a variant, so a style that lacks them gets the placeholder only for those), `stream` (a stretch of water on its bank; `variant: "cut"` square-ends it at the diorama's edge, `"fall"` is the little waterfall down the side), `grass`, `flowers`, `wildflowers`, `lily`, `bench`, `signpost`, `bike-rack`, `mailbox`, `gate`, `hanging-basket`, `market-stall`, `bandstand`, `bus` (the town bus waiting at its stop), `washing-line`, `puddle` (a film of water by a lantern, reflecting it in the evening), `pumpkin`, `hay-bale`, `sheep`, `leaf-pile`, `bunting`, `chapel`, `cottage`, `cottage-timber`, and the empty plots' `swing`, `slide`, `sandpit`, `picnic-blanket`, `shed`, `veg-bed`. | `size`, `variant`, `seed` |
| `decor.<piece>` | Room dressing that never blocks movement: rugs, pendant lamps, clocks, whiteboards, pin boards, wall art, screens, window boxes, meeting chairs, desk chairs (`desk-chair`), desk books and plants, the dispatch roller door, the partition art (`frame-hill`, `frame-botanical`, `frame-trio`, `calendar`, `pin-strip`, `ledge-plant`, `small-clock`), the painted pallet bay (`floor-bay`), and October's `pumpkin`, `apple-bowl` and `sofa-throw`. | |
| `mailbox`, `letter`, `letter.flagged` | The lobby mailbox; a letter; a letter the postman could not deliver. | |
| `furniture.<definition id>` | Builtin props and interior furniture, each with a definition, so it blocks movement: `desk`, `plant`, `bench`, `lamp`, `sofa`, `table`, `shelf`, `workdesk`, `lead-desk`, `rack`, `planning-table`, `review-pile`, `pallet`, `mailbox`, `meeting-table`, and the room dressing's `lounge-sofa`, `coffee-table`, `bookshelf`, `armchair`, `coffee-counter`, `round-table`, `planter`, the room signatures `reception-desk`, `drafting-table`, `review-desk`, `crate-stack` and `parcel-cart`, October's `autumn-vase` and the rest. | `seed` |
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
`civic.square` (its four lamps and a wash under the string lights), `civic.cafe` (the terrace and two counter
lanterns), and the post office's and town hall's window spills. A pool of kind `"screen"` is a monitor's cool glow on
the desk and the floor before it (`furniture.workdesk`, `lead-desk` and `desk`). Pools follow the evening factor, so they
show from dusk, and only on Pretty. This is a Greenhouse detail, not part of the contract.

### Ambient life

The town's gentle motion is drawn from eight keys: `town.bird`, `town.butterfly`, `town.firefly`, `town.mote`,
`town.window-glow`, `town.ripple`, `town.steam` and `town.cloud-shadow`. Each is one mesh on shared geometry and
nothing animates itself: `apps/world/src/world/ambientLife.ts` instances them (one draw call each) and moves the
instances.

- Forward is +x. A bird flaps when scaled in y; a butterfly folds when scaled in z.
- Glows are additive, and their instance colour sets their brightness, so the renderer fades one by darkening it.
- `town.firefly` is a billboard: its shader lays the quad out in view space round the instance's centre, so it faces
  the camera from any side (the instance's x scale sizes it).
- Cloud shadows: when the environment handle has `setCloudShadows`, the renderer sends the clouds there instead of
  drawing `town.cloud-shadow` decals, and the style dims its key light under them on every lit material, so a passing
  cloud darkens roofs, walls and robots as well as the grass. Greenhouse injects this into each kit material's shader
  (`cloudShadows` in `shaders.ts`; the hook is named in `userData.lightHook` so the far-robot crowd may batch it).
- Where they gather comes from the town dressing (flower beds, hedges, the pond) and from the landmarks' `LifeSpot`
  markers (chimney, cups, lit windows).
- They show only with the Ambient setting on or reduced, Pretty graphics and no reduced motion. They move only while
  the playback runs.

A style that leaves these keys out simply gets the registry's placeholder, so a third-party style should either cover
them or accept plain crates drifting by. Covering them is the expected choice.

### Figure kit, environment, materialise

- `figureKit(cast)` returns the `FigureKit` a cast draws its figures with: the style's shapes, shared materials,
  contact shadow and alert halo, with the cast's own colours per theme. The figures themselves (the robots, the
  sprouts) are not the style's: they are a cast, see [Casts](#casts). Optional; a style without it gets the cast
  registry's plain reference kit.
- `environment(scene, renderer, theme)` adds the lights, tone mapping and background for a theme and returns a handle
  with `setTheme`, `setShadowReach(reach, center?)`, `setQuality(quality)`, the optional
  `setCloudShadows(clouds)` and `dispose`. The UI's light theme is
  `day`, the dark theme is `lamplight` (a deep blue-green evening: warm lamp light, lit windows, glowing desk and
  pendant lamps, warm pools of light). The renderer fits the shadow to what the camera frames: the ground the
  entered building's view shows gets a close, crisp shadow (fitted again after a zoom or pan), the town a cheaper,
  softer one.
- The day-night drift: `setDayPhase(phase)` takes the time of day as a fraction of one day (0 the morning, through
  dusk and the evening, back through dawn at 1) or `null` for the theme's fixed look, and returns true when the light
  changed. The renderer derives the phase from the source clock (`world/dayClock.ts`: one day is one 16-minute loop of
  the demo script) a few times a second, behind the viewer's "Day and night" setting (`state/daynight.ts`: on by
  default in demo mode, off in live mode); reduced motion and Fast keep the theme's look. The theme stays the base:
  Greenhouse runs the light theme through a warm dusk into a gentle evening and back through a pink dawn, and deepens
  lamplight into a cool night and back (`daylight.ts`). `evening` is the shared factor (0 by day, 1 with every lamp
  lit) that lamps, lit windows, pools, fireflies and the floor's sun shafts follow; `air` is the backdrop's tint (the
  renderer mixes it into the theme's `--world-air` on the scene's own element: a warm dawn, a rosy dusk, a blue-green
  evening); `shadowVersion` counts the sun's
  visible moves, so a renderer redraws a hand-refreshed shadow map only then. The HTML chrome follows the theme only.
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
  - The format has a `wedge` part since round two: a pie slice of an upright cylinder or cone, `sweep` degrees wide,
    starting on the part's +x axis and turning as a positive y rotation turns, with its cut faces closed. A style's
    parts renderer must draw it (Greenhouse: `wedgeGeometry` in `parts.ts`). The format is described in
    [prop-format.md](../skills/prop-builder/references/prop-format.md).
  - Small parts may be drawn at lower detail; they read the same. Greenhouse draws a box whose bevel is 1.2 cm or less
    as a plain box, a sphere of 5 cm or less with 8 x 6 segments, and a cylinder of 4 cm or less with 10 sides, and its
    kit box takes only the bevel segments the bevel actually gets.

## What batches, and what a style must do for it

The renderer batches what repeats, style-agnostically: it never knows a style's materials, only what three.js shows of
them. A style keeps its world cheap by keeping its materials batchable.

- **Static merging per look** (`apps/world/src/world/mergeStatic.ts`). Static meshes (a building's shell, the interior
  furniture and decor, the town's one-off dressing) merge per material, and plain materials that differ only by colour
  merge into one mesh per *look*: roughness, metalness, side, flat shading, depth and polygon-offset settings, shadow
  casting and the lighting hook. Each vertex carries its source material's index (one byte), and the merged material
  reads the colour from the source materials' own `Color` objects, so a theme change, a lamplight swatch or the drift
  shows at once.
  - To batch, a material is a `MeshStandardMaterial` that is opaque, untextured, without vertex colours, wireframe or
    alpha test, and without an emissive colour of its own. Glowing, transparent, textured and pattern-shader materials
    still merge, but per material.
  - Its only shader change may be a lighting-only hook, set as `onBeforeCompile` and named in `userData.lightHook`
    (Greenhouse's cloud shadows). Any other `onBeforeCompile` keeps the material out of the palette.
  - Change colours in place (`material.color.set(...)`), never by swapping materials: the merged palettes hold the
    source materials' colour objects.
- **Instanced twins** (`instancedMaterial.ts`). An instanced mesh draws a cached twin of the style's material that
  shares its colour objects and uniforms and reads its numbers (opacity, emissive strength, roughness, metalness,
  visibility, version) through to the source, plus an instanced depth material for the shadow pass. So one material may
  be drawn plain in one place and instanced in another without three re-resolving its program at every switch. A style
  that instances meshes itself should do the same (Greenhouse: `kit.material(name, { instanced: true })`).
- **The far robot crowd** (`robotCrowd.ts`). Robots seen from the town are copied into one instanced mesh per part and
  look, the part's colour riding as an instance colour on a white copy of its material. Plain kit materials (with at
  most the named lighting hook) batch; parts that cannot (a translucent proxy's own copies, a halo shader) draw
  themselves. A cast should therefore keep its far parts on the kit's plain shared materials and keep a faint glow of
  its own for the `near` look, as the classic bots do.
- **Town dressing** (`instanceStatic.ts`). Repeated pieces are instanced one mesh per part and material and culled by
  12 m ground cells; a kind with fewer than about 2,000 triangles in all is merged instead. Model groups the bakers empty
  are removed, so they cost nothing per frame; a group with `userData.animate` stays.
- **Matrices only for what moved** (`matrixPass.ts`). TownScene updates world matrices itself, instead of three.js
  recomposing every object every frame: an object's local matrix is recomposed only when its position, rotation
  (quaternion) or scale changed since the last frame, and world matrices are multiplied only below a change. Nothing
  needs declaring as static or moving: an animation that writes `position`, `rotation`, `quaternion` or `scale` in
  place keeps updating (robot parts, the windmill's sails, a door). A part whose `matrix` or `matrixWorld` is written
  directly sets `matrixAutoUpdate = false` (for `matrix`) and `matrixWorldNeedsUpdate = true` after each write, as in
  plain three.js; a one-draw change in `onBeforeRender` (the back walls' collapse) also sets `matrixWorldNeedsUpdate`
  so the next pass restores the matrix.

## How Greenhouse implements it

Data first, code where it needs code.

| Data (`style.json`, `models/*.json`) | Code (`src/`) |
| --- | --- |
| The manifest, palette, swatches and the lighting presets (`day`, `lamplight`, and the drift's `dawn`, `dusk` and `night`). The `defaultCast` names the cast whose figures stand for agents (`classic-bots`). | `figureKit.ts`: the kit casts draw with (the parts renderer, the shared materials under the cast's own colour names, the blob shadow and the halo shader). The robots themselves are data in `packages/cast-classic-bots`. |
| About a hundred parts-JSON models: the ticket looks, tags, letters, mailbox, pallets, trophy, banner, desk lamps, quiet clock, error crate, drone body, cart, truck, beacon and rule props; the room dressing (`furniture.*` and `decor.*`); the town's trees, flowers, benches, signposts, gates and playground pieces (`town.*`); the landmarks' smaller parts, the bus stop, the clock post and the duck (`civic.*`). | `shaders.ts`: the floor patterns (with sun shafts that fade at night), glass, halo, paving, grass, pond ripple and the soft decals for contact shadows and lamp pools. |
| A variant is a file `<key>.<variant>.json` (`ticket.tag.urgent.json`, `desk-lamp.dim.json`). | `shell.ts`: the building shell (walls, glass wall, rims, partitions, door frames, slab, front door, flag, planks, ivy, sign, apron, loading door). |
| A model tagged `accent-<material>` draws that material's parts in the caller's accent colour. | `town.ts`: the ground, lawns, paving, hedges, flower beds, pond, bridge, fence, lanterns, crossings and wear. |
| | `civic.ts`: the post office, town hall, square, café, greenhouse, windmill and welcome sign. They are assembled from rounded boxes, roofs and the `civic.*` data parts, and baked into one mesh per material once per kit. The fountain's water and the windmill's sails stay live. |
| | `life.ts`: the ambient life (bird, butterfly, firefly, mote, window glow, ripple, steam, cloud shadow) with its soft additive glow shader. `civic.ts` marks the post office chimney, the café's cups and every landmark window as `LifeSpot`s, kept through baking. |
| | `pieces.ts`: pieces that stretch or repeat (floors, emblems, straps, bands, stickers, focus frame). |
| | `furniture.ts`: the Greenhouse furniture with a glowing screen; a plant's leaves are plain meshes on a theme-following `tint` material, so the renderer batches them across plants (desk, plant, bench, lamp, sofa, table, shelf, workdesk, lead desk). |
| | `index.ts`: the code hooks on data models (the drone's rotor blades, the fountain's water) and the lamp pools. |

Every model file passes `validatePropModel` (`packages/style-greenhouse/test/models.test.ts`). Small decorations get
the validator's coverage warning (the parts cover little of a 1 x 1 footprint); that is expected and not an error.
Converting the older code furniture (desk, sofa, shelf and the rest) to parts-JSON is not done yet. The large
landmarks stay code: a building 8 or 10 units across exceeds the format's limits (a footprint of at most 3.6 units,
part sizes of at most 3, 64 parts).

## What a third-party style must provide

- A `WorldStyleFactory` with a manifest: id, name, semver version, description, `coveredKeys`, a colour for every
  palette name and a lighting preset for `day` and `lamplight` (`dawn`, `dusk` and `night` are optional: without them
  the style keeps its theme's look through the day).
- The `WorldStyle` methods: `model`, `figureKit` (optional), `parts`, `color`, `setTheme`, `environment`, `materialise`, `dispose`.
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

## Casts

Status: implemented on the demo branch (2026-10-05). A cast is the set of figures that stand for agents, the postman
and the town-hall agents. It is swappable apart from the style, through its own contract and registry. Loading a cast
from outside the repository and an agent choosing its own figure are **not built**.

| Piece | Where | What it is |
| --- | --- | --- |
| Contract and runtime | `packages/world-cast` (`@crewhub/world-cast`) | The types (`Cast`, `FigureHandle`, `FigureKit`, the two data formats), the validators, the generic figure runtime (`createCast`), a plain reference kit and the contract check. It knows no style and no cast. |
| A cast | `packages/cast-<id>` | `cast.json`, `figure.json` and an `index.ts` of a few lines that exports them as `cast`. Code only where data cannot say it. |
| Registry | `apps/world/src/world/castRegistry.ts` | Casts register by manifest; `extends` resolves here; a choice resolves to a cast id. |
| Registration | `apps/world/src/world/cast.ts` | The only module outside the cast packages that imports a cast: one import and one `registerCast` line each. |

### Which cast a building wears

The first registered cast of: the building's own (`castId` on its plot in the town document), the viewer's choice
(Settings, kept in this browser as `crewhub-world.cast`), the town document's `castId`, the style's `defaultCast`. An
id nobody registered falls back to the next in that order, with one note in the text view. The text view names the
active cast once and the frame rate overlay shows the cast in view. Changing the cast in Settings swaps every figure
where it stands or walks, without a reload. The casting room at `/cast-preview` shows every registered cast in one
sample room, in every role and state.

### What the world asks of a figure

Renderers talk only to a `FigureHandle`: `setState`, `setDetail("near" | "far")`, `setHighlight`, `update(seconds)`
(never called under reduced motion), `anchors` and `dispose`. One pure function (`figureState.ts`) derives the state
from what the world model already says; the reducer and the projection know nothing of casts.

- **Role**: `lead`, `worker`, `design`, `analyst`, `postman` (the post office), `operator` (a town-hall agent without
  a role of its own), `unknown` (no fact produces it yet; the casting room shows it).
- **Activity**: `working`, `idle`, `done`, `blocked`, `stale` (a stale snapshot), `walking` (wins over the rest).
- **Flags**: `waiting` (the ticket on its desk waits on a person), `alert` (its building has a stall), `proxy` (the
  echo of an agent that works elsewhere), `carrying` (the postman's letters).
- **Anchors**, in the figure's own space at scale 1: `label` (the name pill and bubbles), `carry` (letters ride
  here), `ground` (the radius the blob shadow, halo and selection ring size to) and `height`.
- **Accent**: the building's project colour goes to every figure of that building; the cast decides who wears it.

### The two data formats

`cast.json` (`crewhub-cast/1`) is the manifest. Hex colours live here and nowhere else in a cast:

```json
{
  "format": "crewhub-cast/1",
  "id": "pegs",
  "name": "Pegs",
  "version": "1.0.0",
  "description": "A wooden peg with a round head.",
  "colors": { "wood": { "day": "#bf9873", "lamplight": "#bf9873" }, "pale": { "day": "#f2ecdc", "lamplight": "#e8dcc0" } },
  "budget": { "nearTriangles": 600, "farTriangles": 400, "nearMeshes": 4, "farMeshes": 2 }
}
```

`figure.json` (`crewhub-figure/1`) is the figure: joints, parts on joints, a still pose and a small motion per
activity, looks per state, colourways and anchors.

```json
{
  "format": "crewhub-figure/1",
  "joints": [
    { "id": "body", "position": [0, 0.1, 0] },
    { "id": "head", "parent": "body", "position": [0, 0.7, 0] }
  ],
  "parts": [
    { "id": "peg", "joint": "body", "shape": "cylinder", "size": [0.2, 0.6, 0.25], "position": [0, 0.3, 0], "color": "slot:coat" },
    { "id": "knob", "joint": "head", "shape": "sphere", "size": [0.22, 0.22, 0.22], "position": [0, 0, 0], "color": "pale" },
    { "id": "nose", "joint": "head", "shape": "sphere", "size": [0.03, 0.03, 0.03], "position": [0, 0, 0.22], "color": "accent", "detail": "near" },
    { "id": "crown", "joint": "head", "shape": "cone", "size": [0.1, 0.12, 0.1], "position": [0, 0.26, 0], "color": "pale", "roles": ["lead"] }
  ],
  "poses": {
    "working": { "head": { "rotation": [12, 0, 0] } },
    "blocked": { "head": { "rotation": [0, 0, -14] } },
    "waiting": { "head": { "rotation": [0, 0, 18] } }
  },
  "motions": {
    "always": [{ "joint": "head", "channel": "scale.y", "wave": "blink", "amplitude": -0.1, "period": 5, "seeded": true }],
    "walking": [{ "joint": "body", "channel": "offset.y", "wave": "bounce", "amplitude": 0.04, "period": 0.8, "seeded": true }]
  },
  "looks": { "waiting": { "parts": { "knob": { "glow": 0.5 } } } },
  "colorways": { "coat": { "lead": "soft:accent", "others": ["wood", "pale"] } },
  "halo": "slot:coat",
  "anchors": { "label": [0, 1.15, 0], "carry": [0, 0.4, 0.3], "ground": 0.25, "height": 1.05 }
}
```

- **Parts** use the shapes, sizes and units of `crewhub-prop/1`. A part may be limited to `roles`, `activities`,
  `waiting`, `carrying` or `detail: "near"` (dropped, with its shadow, seen from the town). `glow` makes it emissive:
  a strength in its own colour, or a glow colour name.
- **Colours** are a cast colour name, a style palette name, `soft:<name>` (half-way to the style's cream),
  `slot:<name>` (a colourway: the lead's colour, a role's, else one of `others` seeded by the agent key), or `accent`
  and `soft:accent` (the project colour; without a project, the slot's seeded colour). `alert` and `stale` are
  reserved: every kit resolves them (a cast's own colour of that name wins); a stale figure fades towards `stale`.
- **Poses** are still: rotations in degrees, offsets in world units, scales. `waiting` and `carrying` layer over the
  activity's pose (not while walking). Under reduced motion the still pose is all a viewer sees, so it must read.
- **Motions** are waves on joint channels: `sine`, `bounce`, `lift`, `blink`, `glance`. `always` runs in every
  activity. `seeded` motions run on the figure's own clock, so two figures never move in step; `sided` seeds a
  glance's side; `rests` fades a motion while the activity's glance swells (typing in bursts). A stale figure and a
  proxy stand still.
- **Looks** recolour or light parts while they hold, layered: `near` (seen from close by; the far crowd, a proxy and
  a stale figure do without), the activity, `waiting`, `alert`, then `hover` or `selected`.
- **`halo`** is the colour of the style's ground halo while the figure is blocked or waits on a person; while `alert`
  the halo shows in the style's alert colour.
- The proxy (translucent, no shadow, still) and the stale figure (greyed, still) are the runtime's own treatment of
  any figure: a cast does not draw them.

A cast that sets `extends` in its manifest re-dresses another cast: its `figure.json` is a `crewhub-figure-patch/1`
that recolours, drops and adds parts and may replace poses, motions, looks, colourways and anchors. The rig is the
base's. The registry applies the patch; the cast never imports its base.

### Adding a cast

1. Copy a cast folder to `packages/cast-<id>` and give it its id and name in `package.json` and `cast.json`.
2. Edit `cast.json` (colours, budget) and `figure.json`. `index.ts` stays as it is:
   `import figure from "../figure.json" with { type: "json" }` and `export const cast = { manifest, figure }`.
3. Add `"@crewhub/cast-<id>": "0.0.0"` to `apps/world/package.json`, run `npm install`, and add one import and one
   `registerCast` line to `apps/world/src/world/cast.ts`.
4. Run `npm test`. The cast shows in Settings and in the casting room.

Nothing else changes: not the renderer, not the reducer, not another cast. Where data cannot say a shape or a motion,
the factory may add `extend`: a function that gets the built figure's joints, parts and kit once per figure and may
return `update`, `setState` and `dispose`. A cast drawn wholly in code gives `create(kit)` instead of `figure`.

### What a cast may not do

A test enforces the first three (`apps/world/test/castBoundary.test.ts`), the design-system check the fourth, and the
contract test the budgets (`apps/world/test/castContract.test.ts`, which covers every registered cast).

- Import the renderer, the world model, a style or another cast. A cast imports only `@crewhub/world-cast`,
  `@crewhub/world-engine`, `@crewhub/world-style` (types) and `three`, and draws only through the `FigureKit`.
- Be imported by anything but the registration module.
- Call the network or a model. The model-call scanner covers cast packages like every other.
- Put hex colours in code. Colours are names; hex lives in `cast.json`.
- Break its budget. The manifest states triangles and meshes per figure, near and far; the contract test builds
  every role in every state with the reference kit and holds the cast to them. Far figures must be made only of the
  kit's plain opaque materials, so the renderer's crowd draws a hundred of them in a few instanced calls. For
  reference, the classic bots: 3,552 triangles and 28 meshes near at most (the postman), 2,392 and 12 far.
- Decide meaning. Roles, states and where a figure stands come from the world model; a cast only draws them. Status
  is never colour alone: a pose, a part or the halo carries it too.
- Draw a human, or copy a franchise's characters.

### Later, not built: an agent choosing its own figure

An agent could describe the figure it wants in a ticket, the way a prop is asked for today: a character builder next
to the prop builder, producing a `crewhub-figure-patch/1` on the building's cast that the validator and the contract
check accept before it is shown. It costs model tokens, so it would be off by default; the default stays a plain,
seeded pick from the cast (the colourways above), which costs nothing.
