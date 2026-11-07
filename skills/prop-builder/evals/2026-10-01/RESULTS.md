# prop-builder eval, 2026-10-01

Test subject: Sonnet 5.5, using only `skills/prop-builder/SKILL.md` and `references/` (format reference plus the
examples). No other source file was read (I read `AGENTS.md`; I listed `packages/demo/src/props/` once, which showed
the file names only). There is no crewhub-loops server, so the "post a comment" step was replaced by writing files.
I generated the JSON with a small throwaway script (helpers for centre = bottom + height / 2), then ran
`npm run prop:validate -- <file>` on each file. Every file was run separately.

| # | Request | File | Runs to green | Failed-run errors (first line, verbatim) | Warnings |
| --- | --- | --- | --- | --- | --- |
| 1 | a coffee machine | `evals/2026-10-01/coffee-machine.json` | 1 | none | none |
| 2 | a whiteboard with three sticky notes | `evals/2026-10-01/whiteboard-sticky-notes.json` | 2 | run 1: `skills/prop-builder/evals/2026-10-01/whiteboard-sticky-notes.json: parts[8].size[2]: must be between 0.01 and 3` (also parts[9] and parts[10], same message) | none |
| 3 | a bug crate | `evals/2026-10-01/bug-crate.json` | 1 | none | none |
| 4 | a server rack | `evals/2026-10-01/server-rack.json` | 1 | none | none |
| 5 | a potted cactus | `evals/2026-10-01/potted-cactus.json` | 1 | none | none |
| 6 | a delivery truck | `evals/2026-10-01/delivery-truck.json` | 1 | none | none |
| 7 | a reading nook with a lamp | `packages/demo/src/props/reading-nook.json` | 1 | none | none |
| 8 | a tall fern for the lobby | `packages/demo/src/props/tall-fern.json` | 1 | none | none |

Totals: 8 props, 9 validator runs, 1 failure (my mistake: I gave the marker scribbles a depth of 0.004; the limit of
0.01 is in the skill, I overlooked it). No warnings on any file.

## Skill feedback per request

1. Coffee machine: nothing unclear. Category was a judgement call (`gather`: "kettles, places to meet"); the skill
   has no category for kitchen or appliance things, `gather` fits best.
2. Whiteboard: the error message was clear and named the part and axis. The 0.01 minimum bites exactly on the thin
   details the skill encourages (scribbles, sticky notes, labels). SKILL.md says "between 0.01 and 3" only in the
   sizes bullet; a line under "Few parts" such as "thin details (paper, scribbles, stickers) cannot be thinner than
   0.01" would prevent this first failure.
3. Bug crate: clear. "Storage" fits. The skill does not say how to show "a thing full of things" (I used tilted
   ticket cards sticking out of an open top, like the examples' books and paper).
4. Server rack: clear. Nothing missing. I used a red (`circle`) emissive LED as an accent; the skill says emissive
   is for bulbs and screens, and lists `lamp-glow` or `glass` as usual, so a coloured emissive is an extrapolation,
   validator accepted it.
5. Cactus: clear. Rotated cylinders (arms) work as the skill says; the tip about lifting tilted parts above the
   floor was not needed.
6. Delivery truck: the skill says "respect the skill's limits" indirectly only: nowhere does it state the largest
   footprint in one place for big props (footprint max 6, size max 3 per part, height 3 are in three places). It
   also does not say which way a vehicle faces. The front faces +z "the working side", so I put the cab at -z and
   the loading door at +z with approaches at `z = depth`. A sentence on orientation of things with a front and a
   back (vehicles, chairs) would help. No guidance on whether a large prop such as a truck should have
   `blocksMovement: true`; I chose true.
7. Reading nook: one prop with two objects (chair and lamp) is fine; the skill has no guidance on composite props or
   on footprint for them. I chose 2 x 1. The 25% coverage warning did not fire.
8. Tall fern: the skill says rotations are XYZ degrees but gives no hint how to lean a part toward a direction.
   I derived it (rotation `[0, azimuth, lean]` leans toward the azimuth, centre = start + half length x direction)
   and kept fronds' tips inside +-0.3. The validator's exact bounds after rotation made this safe; a worked
   "leaning part" recipe would save time. The plant examples use random-looking rotations, which hides the rule.

Overall: the skill was sufficient to get 7 of 8 files green on the first run. The format reference and the worked
examples carried most of it. The `crewhub` CLI steps (7) could not be exercised.

## Self-review of the looks (not rendered; judged from the part lists)

| Prop | Reads as the request? | Notes |
| --- | --- | --- |
| Coffee machine | Yes, likely. Cabinet, sage machine body with graphite cap, brass spout, drip tray with a cream mug, glass tank at the back. | 10 parts, in the examples' range. The machine is chunkier than a real one (0.42 x 0.5), which suits the toy style. Indicator lights are tiny (0.016). |
| Whiteboard | Yes. Same construction as the notice board, with a chalk face, a slate frame, a pen tray and a pen. | Sticky notes use tangerine, coral and cream as accents. Scribble lines are 0.01 thick and may look flat. |
| Bug crate | Probably. Open clay crate, timber corners, slats, a label with a red dot, ticket cards and a ladybug on the rim. | The ladybug (one sphere plus a head) may read as a blob. The cards carry the "tickets" idea. |
| Server rack | Yes. Tall graphite cabinet, five slate units with vent strips and LEDs, one red. | Proportions are a bit slim and tall (0.52 x 1.9); the units are flat boxes, so it depends on the LED glow to read as servers. |
| Potted cactus | Yes. Pot with rim, soil, pebbles, a fat body, two arms, a coral flower. | Only 11 parts. No spines or ribs; the flower does the work. Arm joins are plain cylinders into ellipsoids, may look slightly stiff. |
| Delivery truck | Probably yes. Sage cab with glass, chalk cargo box with a tangerine stripe, four wheels with mist hubcaps, headlights, bumpers, rear door handle. | 22 parts. Toy scale: 1.1 wide, 3.1 long, cab top at 1.2. The cab sits at the back of the footprint so the loading end faces +z. The rear door is only a handle and a seam line; no open doors. |
| Reading nook | Yes. Sage armchair with arms, back and a cream seat cushion, tilted back cushion, brass floor lamp with glowing bulb and cream shade. | 14 parts. Lamp shade is the same kind as the floor-lamp example. The chair has no head-rest detail; acceptable. |
| Tall fern | Probably. Terracotta pot, central stem, 14 ellipsoid fronds in three tiers, leaf and leaf-dark alternating. | 19 parts. Tallest point about 1.45. The fronds are thin ellipsoids (0.07 x 0.02), so from above it may look like a spiky star; the tiers give some arching. |
