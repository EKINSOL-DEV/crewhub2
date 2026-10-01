# Visual direction

## Intent

Create a place someone wants to keep open while their agents work. Aim for a
cohesive, crafted miniature world with expressive inhabitants and tactile
interaction. Choose a strong art direction and carry it through geometry,
materials, lighting, motion, interface, typography, and sound if later added.

Astra has creative freedom. The old world and its assets are not design constraints.
The first implemented world style is Greenhouse: an ivory and sage miniature studio,
warm timber, glass architecture, botanical details, and soft robots in sage,
apricot, and lavender. It is a style, one swappable package behind a seam, not the
product; see [WORLD_STYLES.md](WORLD_STYLES.md). The world itself is a town of
buildings, one per crewhub-loops project, with rooms by role.
The orthographic isometric home keeps spatial relationships stable; free orbit,
focus, and automatic wall fading provide visibility when needed.

## Scenes and interface

2D UI uses the crewhub-loops design system: Archivo and the Ekinsol palette, in
light and dark. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) records it. The botanical
scene keeps its own materials and lighting, independent of the UI palette.

- Every room has distinguishable characters and meaningful places for them to
  work, wait, and present a result.
- A clear overview camera and a satisfying focus/return interaction. Motion must
  remain interruptible, avoid occlusion, and keep the selected character visible.
- A restrained interface that appears when useful. Put activity, selection, and
  results in context; avoid filling the scene with permanent labels and controls.
- A compact way to run deterministic demonstration scenarios, visibly labeled
  as simulated. The live integration must be replaceable at the data boundary.

## The world as built

Status: the Greenhouse art pass on the demo branch (2026-10-01). The art direction is the old Greenhouse room: soft
toon materials, warm timber, chalk walls, framed glass, planted details and soft robots. The 2D kit governs only the
HTML around the scene.

### Buildings

A building is a diorama on a slab, not a floor plan.

- **Walls.** The north side is the greenhouse glass wall (`wall.glass`, 1.75 high): a chalk knee wall, panes about
  1.1 wide between slim green mullions, a transom and a top beam. The west side is a tall chalk wall (`wall`) with a
  skirt, a ledge and framed windows. Chalk pilasters close the ends of every tall wall. The south and east sides,
  which face the camera, are low rims (`wall.low`), so the rooms stay visible.
- **Rotating the camera.** When the camera turns (`[` and `]`), a tall back wall would stand in front of the rooms,
  so each one has a low stand-in. Each wall mesh decides per draw, from the camera drawing it, which version shows.
  Shadow passes keep the tall walls.
- **Inside.** Rooms are divided by low sage-cream partitions (`building.partition`) with timber door frames
  (`building.door-frame`) in every opening.
- **Slab and floors.** Every room stands on `building.slab`, a cream block with a bevelled lip and a thin
  project-colour trim. Floors sit `FLOOR_RISE` (0.24) above the lawn. The floor pattern follows the room:
  - wood in the lead's office and the meeting room;
  - tile in the lobby;
  - concrete in storage and dispatch;
  - the studio's cream cells elsewhere.
- **The project colour is an accent, never a wall.** It shows on the front door's leaves and awning valance, the
  flag, the slab trim, the emblem and the lead robot. The lead wears a soft tint of the colour, 45% of the way to
  cream.
- **Archived buildings** are boarded up and grown with ivy. A closed sign hangs from the awning, the flag is at
  half-mast, and the colours are muted, never black.
- **Size.** The largest building is 33 x 28 cells (19.8 x 16.8 units) on a 24-unit plot. Role rooms grow in 6 x 6
  modules with two desks each.
- **Outside.** A painted name sign in the project colour over every entrance (hidden behind the closed sign on an
  archived building), window boxes under the west windows, planters by the door, wall lamps by the door and the
  loading door, a bike and a doormat. In lamplight the windows glow warm and some twinkle.
- **From the town.** Every building shows a merged silhouette of its furniture and dressing, so it reads as furnished
  from the home camera; the full dressing is drawn only for the entered building.

### Rooms

Rooms are dressed by kind ([roomDressing.ts](../apps/world/src/world/roomDressing.ts)). The dressing is pure,
deterministic and seeded per building, so a building always dresses the same way and neighbours differ.
`dressRooms` places the pieces into the free zones of the building template (`dressingZones`), preferring the north
and west walls, whose fronts face the camera.

- **`furniture.*` pieces block movement** and have a definition. A piece is placed only where doors, approach cells,
  seats, piles, signal spots and the floor in front of desks stay free. A flood fill then checks that everything
  reachable before is still reachable. The dressing steps aside for a person's own placed props.
- **`decor.*` pieces never block** (`roomDecor`). They include:
  - rugs and pendant lamps over desks and tables;
  - wall art, only on the tall north and west walls;
  - leaning prints in rooms without a tall wall, a station clock in the lobby;
  - chairs around the meeting table, books or a plant on some desks;
  - the roller door in dispatch's loading opening.
- **Room by room:**
  - **Lead's office:** a sofa corner with a coffee table, a floor lamp, a rug and a bookshelf.
  - **Lobby:** a coffee counter, a water cooler, armchairs, a round table and a planter either side of the way in.
  - **Role rooms:** plants between the desks and a pendant over each desk.
  - **Planning:** a pin board and a map wall.
  - **Review:** a reading corner.
  - **Design** and **analyst:** a mood wall and a chart wall.
  - **Dispatch:** roller shelves and a hand truck.
- Dressing pieces carry only the tag `dressing`, so the director never sends agents to a sofa. The dressing is drawn
  only for the entered building.
- **Personal desks.** Each workstation gets a small set of things seeded by who sits there (a mug, a photo frame,
  sticky notes, headphones, a plant, books), on the left half of the desk; tickets keep the right half.
- **The glass wall** has a ledge of potted plants, hanging plants and a few blinds half down.
- **Pendant lamps** show their cords and ceiling roses only when a room is in focus; from the building camera the
  shades hang alone. In lamplight table lamps and a candle warm the review corner and the lead's coffee table.

### The town

The town is a small green town of hedged gardens, not beige squares
([townDressing.ts](../apps/world/src/world/townDressing.ts), pure and deterministic).

- **Paths.** A 3.2-wide cobbled lane runs down every street, including the outer ring and an entrance road from the
  south edge. Garden paths lead from each front door under a timber gate down to the lane, and crossings get a border
  of darker setts. The town's navigation grid opens only paved cells (`townOpenCells`), so the postman and walkers
  keep to the lanes and garden paths.
- **Used plots** get a raised lawn, hedges with gaps for the path, flower beds, gate lanterns, a mailbox and trees.
- **Empty plots** each have a character by index (`plotUse`): a meadow, an orchard, an allotment, a playground or a
  picnic lawn.
- **Around the town:**
  - a park with a pond, an arched bridge and lilies, and an orchard by the town hall;
  - lanterns every 9 units along the streets, street trees, benches, signposts and bike racks;
  - a green belt of trees around the edge, with grass tufts and wild flowers on the open grass.
- **Landmarks** (`civic.*`) are drawn whole, so they can animate:
  - **The civic row:** the post office, the town hall, the square between them with its fountain, the café and the
    bus stop.
  - **Reserved spots** (`landmarks()`): the welcome sign by the entrance road, the windmill behind the orchard, the
    greenhouse conservatory by the pond, the clock post by the square and three ducks on the pond. A landmark appears
    only once the style covers its key, so the spot reserved for `civic.water-tower` stays empty.
- **Animation.** The fountain's water and the windmill's sails animate only on frames that are drawn anyway, never
  under reduced motion, and never keep the render loop running.
- **Batching.** Repeated dressing pieces are instanced (`instanceStatic.ts`), and one-off pieces are merged per
  material.
- **Gardens.** Each used plot has its own front garden, chosen by the building's slug: a lawn with a tree, a small
  terrace, a vegetable patch or a bike shelter. The archived building's garden is overgrown, with tall grass, wild
  flowers and a leaf pile.
- **A floating diorama.** The town stands on a layered earth slab with a bevelled lip and a contact shadow; the tree
  belt, rocks and tall grass break the edge line.
- **Evening.** String lights hang over the square and the café terrace, the post office and the greenhouse have lit
  windows, and lanterns stand by the pond's bridge.
- **Town life** ([ambientLife.ts](../apps/world/src/world/ambientLife.ts)): drifting cloud shadows, birds crossing the
  town view, butterflies by the flower beds in the day, fireflies by the pond and hedges and twinkling windows in
  lamplight, ripples and steam. It follows the Ambient setting, stops under reduced motion, is left out on Fast, and
  never keeps the render loop running at speed 0.
- **Characters.** The postman wears a cap and a satchel with letters, the ticket drone throws a soft shadow and a
  short sparkle trail (none under reduced motion), and the delivery truck has a shadow and headlights that glow in
  lamplight.

### Light and the lamplight evening

- **Day** keeps the old room's light: a hemisphere fill, a warm key light with soft shadows, a cool fill and ACES tone
  mapping. The key light's shadow follows what the camera frames: a crisp 2048 map over the entered building, and a
  softer 1024 map over the town.
- **Lamplight**, the dark theme, is a warm blue-green evening:
  - a dusk sky over a deep teal ground, and a warm key light and fill;
  - walls that read as cream lit from inside;
  - emissive lamps, screens, eyes and windows that glow more strongly;
  - glass walls that become lit windows;
  - the floor's sun shafts fade out.
- **Warm pools.** A lamp listed in the style's `LIGHT_POOLS` throws a warm pool of light on the ground in lamplight:
  floor and desk lamps, street lanterns, pendants, the square's lamps and the café's lanterns and terrace.
- **Contact shadows.** Soft blob decals sit under every building (`town.contact-shadow`) and every robot, in both
  quality settings.
- **Air.** The canvas is transparent over a soft radial gradient with a gentle vignette (`--world-air` and
  `--world-air-edge`).

### Graphics quality

Settings has a **Graphics** choice: **Pretty** (the default) or **Fast**. It is kept per browser
(`crewhub-world.quality`).

| | Pretty | Fast |
| --- | --- | --- |
| Shadow maps | On | Off; the key light casts no shadow |
| Pixel ratio | Up to 2 | 1 |
| Warm lamp pools | In lamplight | None |
| Grass tufts and wild flowers | Drawn | Left out |
| Contact shadows | Drawn | Drawn |
| Town life (clouds, birds, butterflies, fireflies, twinkling windows) | Drawn | Left out |

### Calm labels and the camera

- **Labels.** By default each robot shows a name pill (a status dot and its name) and at most one bubble, chosen in
  this order: a question, a raised hand, the first alert, a fresh "done". Each building in town shows one quiet name
  sign.
- **Revealed rooms.** A room's labels (room sign, update and caption cards, status tags, name tags, pallet counts,
  rule chips) show only when the room is revealed: under the pointer, keyboard-focused or zoomed to. Hanging labels
  that would overlap nudge upwards instead of piling up.
- **Details (D).** The Details toggle in the toolbar, also the **D** key, shows every label everywhere. It is kept per
  viewer (`crewhub-world.details`), and pressing D announces the new state. The text view and the live regions keep
  everything regardless.
- **Frame rate (F).** Settings, next to Graphics, and the **F** key show a small fixed box under the toolbar (bottom
  left on a phone): fps over the last second, frame time mean and p95 and the CPU work per frame over two seconds,
  draw calls, triangles, geometries and textures in memory, the JS heap where the browser tells, and the Graphics
  setting. Off by default, kept per viewer (`crewhub-world.fps`). The loop draws on demand, so a resting town reads
  "idle", not 0 fps. The same numbers are `window.__worldPerf` for the measurement scripts.
- **Camera.** The camera frames its subject in the free part of the canvas, clear of the HTML chrome. Entering a
  building fills the canvas with it, entering a room frames that room, and home frames the used plots and the civic
  row.
- **Affordances.** The focused or hovered plot gets a warm glow and its building lifts slightly (no lift under
  reduced motion; the glow stays); inside, the hovered or focused room's floor gets a soft wash, and the selected
  agent a ring under its feet. Waiting tags have their own shape, so they are not mistaken for robot name pills, and
  tags step clear of room signs.

## State expressed through behavior

| Meaning | Possible visual expression | Required truthfulness |
| --- | --- | --- |
| Idle | Relaxed posture or small idle action | No claim that work is happening |
| Working | Focused movement at a work surface | Describe only known activity |
| Needs input | Turning toward the viewer or a raised hand | Provide a readable attention label |
| Completed | A result placed nearby and a short celebration | Trigger only on explicit completion evidence |
| Disconnected | A quiet connection indicator | Preserve the last known state as stale |

These are examples, not prescribed character designs. Do not invent a concrete
tool call, progress percentage, or generated result from a generic status event.
A crewhub-loops lane that reads `idle` does not automatically mean a task
succeeded.

## Feel and accessibility

Use purposeful easing, immediate selection feedback, and natural variation in
idle behavior. Avoid constant motion that competes with work. Keep text legible
and character silhouettes recognizable at overview scale.

Support keyboard selection and focus, touch without hover dependency, visible
focus indicators, text alternatives for status, and reduced motion. Audio is off
by default. If graphics are unavailable, provide a simple readable session view.

## Performance and evidence

The first slice capped presentation at 30 fps to control idle graphics cost; since the performance rounds
(2026-10-02) the cap is 60 fps, and the loop still draws on demand and rests when nothing moves. This is a code limit, not a measured performance guarantee. Record browser, hardware, viewport,
device pixel ratio, and scene size when measuring. Start with three characters;
also check a busier scene before increasing scope.

Bound device pixel ratio, reuse assets, budget draw calls, stop unnecessary work
when hidden, and offer a lower rendering quality. Do not assume that moving from
a Tauri webview to a browser guarantees faster graphics.

Review the result at a desktop viewport and a touch-sized viewport. Capture stills
and a short interaction recording where tooling permits. Clearly report when an
actual tablet or target browser has not been tested. Build success alone is not
visual acceptance.
