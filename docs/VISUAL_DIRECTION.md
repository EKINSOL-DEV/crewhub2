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
  which face the camera, are low rims (`wall.low`), so the rooms stay visible. The rims carry a timber coping with
  square posts at both ends of every run (the corners and either side of each door), and the glass wall's frame a pale
  cream cap, so a building's outline reads from the town in every camera quarter, even where the back walls give way
  to rims.
- **Rotating the camera.** When the camera turns (`[` and `]`), a tall back wall would stand in front of the rooms,
  so each one has a low stand-in. Each wall mesh decides per draw, from the camera drawing it, which version shows.
  Shadow passes keep the tall walls.
- **Inside.** Rooms are divided by low partitions (`building.partition`, 0.52 high, in their own quieter tone) with
  timber door frames (`building.door-frame`) in every opening. A soft shade fades in from the walls along every room's
  floor (`building.floor-shade`), so walls and floor meet without a hard line.
- **Slab and floors.** Every room stands on `building.slab`, a cream block with a bevelled lip over a warmer side and a
  thin trim in a soft tint of the project colour. Floors sit `FLOOR_RISE` (0.24) above the lawn. Each room kind has its
  own floor, and rooms that share a wall never share a tone:
  - light wood in the lead's office, dark oak in the meeting room and planning;
  - cream tile in the lobby, sage tile in review and design;
  - concrete in storage and dispatch;
  - the studio's cream cells for the workers, cool mist cells for the analysts.
- **The project colour is an accent, never a wall.** It shows on the front door's leaves and awning valance, the
  flag, the name sign, the emblem, a thin soft-tinted slab trim and the lead robot. It is never a band along the wall
  tops: inside a building such a band reads as the saturated ribbon of the old floor plan. The lead wears a soft tint
  of the colour, 45% of the way to cream.
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
  from the home camera; the far desks and tables are muted sage-grey and timber, never black screen boxes. The full
  dressing is drawn only for the entered building. In the evening the greenhouse glass wall glows warm enough to read
  as lit from the town.

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
- **A signature per room kind**, so each reads at a glance with its floor tone: a reception desk with a bell and a
  guest book in the lobby, a drafting table in design, a two-seat review desk with marked proofs and a banker's lamp
  in review, crate stacks in storage, parcel carts by the loading door in dispatch (`furniture.reception-desk`,
  `drafting-table`, `review-desk`, `crate-stack`, `parcel-cart`). Planning, the meeting room and the analysts keep
  their tables and boards.
- **October inside**, seeded per building: autumn branches in a vase by the lobby's way in, a pumpkin on the
  reception desk, a bowl of apples on the coffee counter, a striped throw over a sofa's arm. None goes where tickets
  go.
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

The settlement is as large as what lives in it, and every size is a place of its own
([settlementDressing.ts](../apps/world/src/world/settlementDressing.ts), pure and deterministic; it reads the town plan
of `townPlan.ts`, so it never decides where a lot, a street or a civic spot is, only what stands there). The page
`/tiers-preview?n=7&zones=2` shows any size without the demo.

- **Clearing (no project).** A glade in the woods: the lodge (`town.lodge`), a post box on a flagstone pad
  (`town.post-box`), the welcome sign on a small green and one staked-out plot (`town.staked-plot`) with a sign that
  says what to do next (`town.plot-sign`: "Create a project in crewhub-loops"), joined by one lane. The stakes stand
  on the lot the first building takes.
- **Hamlet (one project).** The building on that lot with its garden, the lodge and the mail hut (`town.mail-hut`)
  close by, the lane and the green.
- **Village (two to four).** One street, the paved square with its fountain, the promenade between the mail hut and
  the lodge with one market stall, bunting over the main street and the entrance road from the south.
- **Town (five to nine).** The town hall and the post office stand where the lodge and the mail hut stood. The café,
  the bus stop with its bus, the park with the pond, the conservatory and the ducks, the orchard and the market
  complete the civic rows.
- **Region (ten and more, or several zones).** Districts joined by roads lined with birches. A stream runs along the
  border between a district and the one south of it, edge to edge, with a bridge where a road crosses; a hedgerow
  runs between a district and the one east of it. Each district road passes under a gate (`town.district-gate`) that
  carries the district's name, colour and mark; a road that runs east to west shows the home camera its gate
  edge-on, so the name also stands on a board beside it. An outer district's first green is its small centre (a
  fountain, benches, lanterns, a notice board, two stalls).
- **Greens.** A block's green is a pocket park by its seed: a meadow, an orchard, an allotment, a playground or a
  picnic lawn. With one zone the blocks therefore read as neighbourhoods, without names.
- **Landmarks arrive with growth** (the plan says which have arrived; the order is the town's own): the bandstand
  behind the promenade, the chapel on the town's axis behind the square, the windmill, the farm corner beside it
  (hay bales, sheep, pumpkins along a fence) and two clusters of cottages round a little yard, each with a footpath
  to the civic lane. Nothing empty waits for them.
- **A building goes up** ([construction.ts](../apps/world/src/world/construction.ts)): when a project joins a
  standing town, scaffolding (`town.scaffolding`) rises on its plot, the building grows inside it and the scaffolding
  comes down. Under reduced motion nothing moves: the scaffolding stands round a plain wrap, then both fade away from
  the finished building.
- **Paths.** A 3.2-wide cobbled lane runs down every street the plan has; crossings get a border of darker setts.
  Garden paths lead from each front door under a timber gate down to the lane. The navigation opens exactly the
  paving the dressing lays (`civicWalkways`), so the postman and walkers keep to it at every tier.
- **Used plots** get a raised lawn, hedges with gaps for the path, flower beds, gate lanterns, a mailbox and trees;
  an archived building's garden has gone wild.
- **The country.** Inside the ground, every lattice lot that holds nothing is a wood, a meadow in flower, a hayfield
  with a few sheep (`town.field` is the paler patch under both) or plain grass, by its place and the town's seed. A
  clearing and a hamlet stand in the woods. A green belt rings the ground; on a region's long edge it is planted more
  loosely, so a region costs no more dressing per building than the fixed town of four did (a test holds this).
- **October by default.** About two oaks, birches or bushes in five turn gold and orange, with fallen leaves under about
  half the turning trees; pumpkins by most garden gates. A district's own season and planting come from its zone's
  style options (see "Style options and zone looks" in [WORLD_STYLES.md](WORLD_STYLES.md)): the dressing places the
  same keys, and the style draws them in the district's look.
- **Whole pieces** (`planPieces`) are drawn one by one, so they can animate: the lodge or the town hall, the post
  box, the mail hut or the post office, the square, the café, the bus stop, the welcome sign (on the green while the
  town is small, at the head of the main street after), the conservatory, the ducks and the windmill.
  - **Hanging baskets** of trailing leaves and flowers hang from the civic rows' lanterns and at every garden gate
    (none on an archived building).
  - **Puddles** lie on the cobbles beside about one lane lantern in four: a soft film of water by day, the lantern's
    warm reflection in the evening (`town.puddle`).
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
  floor and desk lamps, street lanterns, pendants, the square's lamps and the café's lanterns and terrace. Interior
  pools are large enough to read as pools, not spots.
- **The evening's light, everywhere.** Monitors face their seats, away from the camera, so their light shows as a cool
  glow on the desk top and the floor where the chair stands. The post office's and town hall's windows spill onto
  their paving and podium, the square has a warm wash under its string lights, and the pond and the stream catch long,
  soft streaks of lantern light. All follow the evening factor; by day they cost nothing.
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
- **Labels never hide their robot** ([labelLayout.ts](../apps/world/src/world/labelLayout.ts)). Inside a building each
  robot is a box on screen, from just over its head to its feet. The hovered or selected robot's plate is placed
  first, then every robot's own stack just over its head, then the other labels; desk tags, rule and ticket chips and
  pallet counts that would cover a robot step aside to their own side instead of climbing over it, and a room sign over
  a robot fades until the pointer is on it.
- **Quiet when many.** A label pushed more than 72 px from its anchor fades, beyond 160 px (72 on a phone) it hides;
  the picked plate never does. With Details on, a town of more than six buildings keeps its signs as quiet names, and
  only the focused one expands.
- **A label never hides its robot** (`apps/world/src/world/labelLayout.ts`). The robots are the hero of each room.
  - The hovered or selected robot's plate is placed first, then every robot's own stack, each just over its head: the
    name pill stays closest.
  - Desk tags, rule chips and ticket chips that would cover a robot or its stack step aside, to the side their anchor
    is on, rather than up.
  - A room sign over a robot or its stack steps back (faded) instead of pushing the stack away.
- **Quiet when many.** A hanging label pushed more than 72 px from its anchor fades until the pointer is on it, and one
  pushed more than 160 px is hidden (on a phone's narrow canvas, beyond 72 px). With Details on, a town of more than
  six buildings keeps its signs as quiet names; the focused one still expands.
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
  row. On a portrait phone a building or room frame runs under the side controls and lets the diamond's outer tips
  leave the screen, like the home frame, so a focused room fills the tall screen (about 1.3 times larger).
- **Affordances.** The focused or hovered plot gets a warm glow and its building lifts slightly (no lift under
  reduced motion; the glow stays); inside, the hovered or focused room's floor gets a soft wash, and the selected
  agent a ring under its feet. Waiting tags have their own shape, so they are not mistaken for robot name pills, and
  tags step clear of room signs.

### Finding your way at scale

Built for the scale-and-zones round (`apps/world/src/world/wayfinding.ts`, pure and tested; the spec addendum "Scale
and zones" has the design).

- **Zoom levels.** Region, district, building, room. A town with one district has no district level: its home view
  is the town. The breadcrumb names every level you are in; the level one step out is a button (Escape presses it)
  and the levels above it are plain crumbs to click. Escape steps room, building, district, home. Entering a district
  frames its ground; **H** frames the level you are in.
- **Zoomed out, the world summarises.** The scene sets `data-detail` on the labels host from the screen pixels per
  world unit (`labelDetail`), with a little hysteresis:
  - `districts` (a region from far): one card per district, hung above the corner of its ground that is highest on
    the screen so it never covers a building. It says the district's name, its buildings and agents, the work in
    hand, and what needs a person. Building signs are hidden.
  - `buildings`: the building signs return and a district keeps only its name and beacon.
  - `close`: as before.
- **One beacon.** A district's card carries one beacon (a warning mark with a count, never colour alone) when
  anything inside waits on a person, needs attention or is stalled. A building that needs a person carries the same
  mark as a pin over its roof at every distance; close by the pin says what it wants. Archived buildings ask for
  nobody. The beacon breathes; it holds still under reduced motion. On a phone, from far, only the districts'
  beacons show.
- **The jump list.** The search button beside the breadcrumb, **/** and **Cmd/Ctrl+K** open a searchable list of
  districts, projects, agents and the two civic buildings. The focus stays in the field; arrows move, Enter flies the
  camera there (at once under reduced motion), Escape closes. With nothing typed, what needs a person comes first.
  An agent's jump lands in its room with the agent selected. On a phone this is the main way around a region.
- **The text view groups by district** and offers the same jumps: a "Go to" button per district and "Go inside" per
  building, with each building's sections under its district.
- **Far districts are cheap.** Below `DISTANT_PX` screen pixels per world unit (a region's overview) a building is
  its shell and the instanced crowd: the furniture silhouettes and the piles are not drawn, and a figure that
  neither walks nor changes is left alone (the matrix pass skips it, `restMatrices`; the crowd draws it from the
  parts it found once, and the renderer does not walk it). Interiors are still only built when a building is hovered,
  focused or entered.
- **Between districts** a figure that changes building is not walked across the region. It takes a bus that is not
  drawn: it steps off where the district road enters the new district and walks to the door from there
  (`NavWorld.arrival`). The postman keeps walking. A drawn bus with stops and a timetable is not built.

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
