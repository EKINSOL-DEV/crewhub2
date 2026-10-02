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

Status: the Greenhouse art pass on the demo branch (2026-10-01) and its second round in the night to 2026-10-02 (beauty
round two and the performance rounds). The art direction is the old Greenhouse room: soft toon materials, warm timber,
chalk walls, framed glass, planted details and soft robots. The 2D kit governs only the HTML around the scene.

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
  half-mast, and the colours are muted, never black. Inside, desks stand under pale dust sheets, chairs are stacked
  four high and crates wait (`building.dust-sheet`, `building.chair-stack`), so an archived building reads as closed
  up, not empty.
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
  - rugs, kept inside their room with a small margin (`rug()` clamps each one by its measured size and turn);
  - pendant lamps over tables only (coffee tables, round tables, the meeting table), never over a desk or the planning
    table, where a shade would hang between the camera and a robot; every desk keeps its own desk lamp;
  - wall art on the tall north and west walls, and small pieces made for the 0.6-high partitions (below);
  - a swivel chair (`decor.desk-chair`) at every desk, occupied or empty, the lead's a little larger; a robot stands in
    front of its chair, so it reads as seated;
  - a station clock in the lobby, chairs around the meeting table, books or a plant on some desks;
  - flat dressing on the status rooms' open floors: a runner under the planning table, a painted pallet bay
    (`decor.floor-bay`) where an overflowing pile's pallet stands;
  - the roller door in dispatch's loading opening.
- **Partition art.** The low partitions between rooms carry small hanging pieces made for their height: a landscape, a
  botanical print, a trio of frames, a calendar, a pin strip, a plant on a bracket, a small clock
  (`decor.frame-hill`, `frame-botanical`, `frame-trio`, `calendar`, `pin-strip`, `ledge-plant`, `small-clock`). Each
  room kind has its own list, rotated and started by a seed, so neighbours differ. At most two pieces on a room's north
  and west edges and one on the others (one more in the lead's office), with gaps, two cells clear of every doorway, and never behind a seat, so art
  never hangs behind a robot's head. Partitions carry art on both faces; a face shows only while it is turned to the
  camera (like the tall back walls), so the hidden face costs nothing.
- **Reading nooks.** The emptiest 3 x 3 stretch of a large room (60 cells or more, not the lobby or the workers room)
  gets a nook: an armchair, a side table, a reading or floor lamp, sometimes a plant, on a round rug. Storage and
  dispatch get a big planter there instead. Everything goes through the room planner, so reachability holds.
- **Room by room:**
  - **Lead's office**, the homeliest room: the lead's desk on a big round rug, a sofa corner with a coffee table, a
    floor lamp and a bookshelf, a small meeting corner (a low table on a round rug with two armchairs facing the
    camera) and a group of plants.
  - **Lobby:** a coffee counter, a water cooler, armchairs, a round table and a planter either side of the way in.
  - **Role rooms:** plants between the desks and a chair at each desk.
  - **Planning:** a pin board and a map wall; tall boards stand on the north or west wall, never between the camera
    and a desk.
  - **Review:** a reading corner.
  - **Design** and **analyst:** a mood wall and a chart wall; the chart board's pie is made of real `wedge` slices.
  - **Dispatch:** roller shelves and a hand truck.
- Dressing pieces carry only the tag `dressing`, so the director never sends agents to a sofa. The dressing is drawn
  only for the entered building.
- **Personal desks.** Each workstation gets a small set of things seeded by who sits there (a mug, a photo frame,
  sticky notes, headphones, a plant, books), on the left half of the desk; tickets keep the right half.
- **The glass wall** has a ledge of potted plants, hanging plants and a few blinds half down.
- **Pendant lamps** show their cords and ceiling roses only when a room is in focus; from the building camera the
  shades hang alone. In lamplight table lamps and a candle warm the review corner and the lead's coffee table.

### Robots and their work, the hero of every room

However richly a room is dressed, the eye goes to the robots and their tickets first.

- **Idle life, inside a building** (near robots only; the town's far crowd stays still and instanced). Every robot keeps
  its own seeded beat of 6.5 to 10.5 seconds, so neighbours never move in step:
  - at work it types in bursts, and once a beat rests its hands and glances up and aside, then goes back to work;
  - idle, it shifts its weight from foot to foot, tilts its head and now and then looks round the room;
  - waiting for a person, it waves, bobs on its toes and tilts its head, asking;
  - it blinks, and its antenna nods. Greyed and proxy robots stay still, and so does everything under reduced motion.
- **A lit face at work.** A working robot's face screen catches the glow of its desk screen (the `face-glow` swatch):
  a faint teal by day, a faint warm amber in the evening, following the day-night light. The visor stays dark enough
  that the bright eyes read on it.
- **A faint light of its own.** Inside a building the robot's colour carries a little glow (0.06 of the lamps'), barely
  there by day and stronger as the evening dims the rooms, so robots separate from the furniture in lamplight.
- **Standing on the floor.** A soft contact shadow under every robot, in both quality settings.
- **Tickets at prop size.** Ticket objects are as large as the props they sit on, so the work reads first among the
  books, mugs and plants of a desk.
- **Nothing in front of the hero.** No pendant over a desk, no tall board between the camera and a desk, no partition
  art behind a seat.
- **Hover and focus** stay soft: the card, the ring under the selected robot, the room's wash.

### The town

The town is a small green town of hedged gardens, not beige squares
([townDressing.ts](../apps/world/src/world/townDressing.ts), pure and deterministic).

- **Paths.** A 3.2-wide cobbled lane runs down every street, including the outer ring and an entrance road from the
  south edge. Garden paths lead from each front door under a timber gate down to the lane, and crossings get a border
  of darker setts. The town's navigation grid opens only paved cells (`townOpenCells`), so the postman and walkers
  keep to the lanes and garden paths.
- **Used plots** get a raised lawn, hedges with gaps for the path, flower beds, gate lanterns, a mailbox and trees.
- **Empty plots** each have a character by index (`plotUse`): a meadow, an orchard, an allotment, a playground or a
  picnic lawn. Their pieces gather into groups, not a sprinkle: the meadow is a copse of trees with bushes at their
  feet, a bench facing it and a spiral drift of wild flowers; the picnic lawn has three shade trees with the blankets
  in their shade; picnic lawn and playground get a flower-bed border along the lane with a gap to walk in; the allotment
  has a washing line.
- **Around the town:**
  - a park with a pond, an arched bridge and lilies, and an orchard by the town hall;
  - a meandering stream along the southern edge, under a timber bridge for the entrance road, with reeds, stones and
    lilies on its banks; where it reaches the diorama's edge it spills over in a little waterfall on each side
    (`town.stream`, `variant: "cut"` and `"fall"`). Nothing is planted in its band;
  - autumn among the green, for it is October: about one oak, birch or bush in five turns gold and orange
    (`town.oak-autumn`, `town.birch-autumn`, `town.bush-autumn`, chosen by a seeded noise, so the same trees turn every
    time), with fallen leaves under about half the turning trees;
  - an October farm corner by the windmill: hay bales, six sheep and pumpkins along a fence; pumpkins by most garden
    gates and a pumpkin patch in the allotment;
  - lanterns every 9 units along the streets, street trees, benches, signposts and bike racks;
  - a green belt of trees around the edge, with grass tufts and wild flowers on the open grass.
- **Landmarks** (`civic.*`) are drawn whole, so they can animate:
  - **The civic row:** the post office, the town hall, the square between them with its fountain, the café and the
    bus stop. A paved promenade runs behind the café from the post office lot through the square to the town hall lot,
    with flower beds along its north side, gaps to step through and a lantern at each end; walkers use it like any
    other paving. Three market stalls stand along it east of the square, and behind them a bandstand with bunting sits
    on the lawn, a flagstone path up to its steps and benches facing it. Trees frame the town hall, and two shade
    trees with a bench face the promenade east of the square. The town bus waits in a paved lay-by beside its stop,
    off the lane.
  - **Hanging baskets** of trailing leaves and flowers hang from the civic row's lanterns and at every garden gate
    (none on the archived building).
  - **Puddles** lie on the cobbles beside about one lane lantern in four: a soft film of water by day, the lantern's
    warm reflection in the evening (`town.puddle`). The café's awning and parasols are striped cream and leaf green; the parasols are made of `wedge`
    parts, the pie slices of the prop format. The post office and the town hall have windows in their back walls too,
    since the camera turns.
  - **Reserved spots** (`landmarks()`): the welcome sign by the entrance road, the windmill behind the orchard (inside
    the 1440-wide home view), the
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
  - **Cloud shadows fall on buildings.** A passing cloud dims the key light on everything under it, roofs, walls, desks
    and robots as well as the grass, where the sun puts its shadow.
  - **Fireflies are billboards:** a cream core in a soft lantern-light halo that faces the camera from any side, so they
    stay visible when the camera turns; up close they stay specks of a few pixels, never orbs.
  - Through the evening (below), clouds, butterflies, motes and birds thin out, fireflies come out one by one, landmark
    windows brighten slowly and pond ripples dim at night.
- **Lamplight grass** mottles more strongly and warms in soft, large patches of dry grass and clover, so the dark
  town is not one flat green.
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
  `--world-air-edge`). The air follows the time of day (below): a pale warm dawn, a rosy amber dusk, a deep
  blue-green night; by day and in plain lamplight it is the theme's own. Only the scene's backdrop changes; the HTML
  chrome keeps the theme's tokens.

### The day-night drift

With **Day and night** on (Settings, after Graphics: Drifts or Still, kept as `crewhub-world.daynight`; on by default
in demo mode, off in live mode), the light moves through a day over one loop of the demo script, 16 minutes of source
time. It follows the demo clock, never the wall clock: it pauses, seeks and speeds up with the playback, and every loop
starts from the same morning.

- **Light theme:** the morning and day; a warm dusk around the release (about 10:00 of the script); a gentle evening
  that keeps the daylight walls but lights the lanterns, windows and pools; a pink dawn; then day again.
- **Lamplight theme:** lamplight deepens into a cool night under a high moon and comes back. The two themes stay in
  step: when the light theme is in its evening, the dark theme is in deep night.
- **The sun moves** from the east at dawn to a low western sun at dusk, so the shadows lengthen and swing. Dusk and dawn
  lawns stay a soft golden green, never olive; the warmth sits in the dusk key light.
- **One evening factor** (0 by day, 1 with every lamp lit) drives the lamps' glow, lantern heads, string lights, lit
  windows, the glass sheen, light pools, contact shadows, the floor's sun shafts, the robots' lit faces and the town
  life.
- **Calm.** The light changes only when the mix moves, the sun's shadow only after a step of about half a degree. At 1x
  and 4x the light follows the clock exactly; at 16x it keeps a 4x pace and falls behind the clock (a seek snaps it to
  the clock), so a dusk never flickers past in seconds, and fireflies and butterflies fade in and out instead of
  popping. Reduced motion and Fast keep the theme's fixed look.

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
| Day-night drift and its air | With the setting | The theme's fixed look |

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

### What keeps it calm

Round two added a lot of life; these rules keep it a place to leave open while agents work.

- **Slow and seeded.** Idle motions, the drift and the town life are slow, small and seeded per robot or per place,
  never in step and never flashing. One day takes a 16-minute loop; a robot glances once in several seconds.
- **Still when asked.** Reduced motion stops every idle motion, the town life and the drift; Fast keeps the theme's
  fixed look and leaves the town life out.
- **Nothing runs for nothing.** The loop draws only while something moves (at most 60 fps) and rests otherwise; the
  drift redraws only when its light moved; animations ride on frames that are drawn anyway.
- **Charm in groups.** New dressing gathers into copses, borders, nooks and drifts, keeps paths, doorways, seats and the
  space in front of desks clear, and never stands between the camera and a robot.
- **The theme is the base.** The drift shades the theme; the HTML chrome follows the theme only, and status is never
  colour alone.

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
