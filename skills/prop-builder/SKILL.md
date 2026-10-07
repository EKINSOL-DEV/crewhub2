---
name: prop-builder
description: Build a prop (a piece of furniture or decoration) for CrewHub World as a validated crewhub-prop/1 parts-JSON file and post it on its ticket. Use when asked to "build a prop", "make a prop", handle a "prop request", or when working a crewhub-loops ticket labelled `prop` (titled "Prop: <thing>").
---

# Prop builder

You turn a prop request into one JSON file that CrewHub World can import: a small 3D object (a lamp, a shelf, a
workbench) made of simple rounded parts, plus the facts the world's grid needs to place it. You never write code
for the world and never need a 3D tool. You write JSON, check it with the validator, fix it until it passes, and
post it on the ticket.

The full format, every key, limit and material, is in [references/prop-format.md](references/prop-format.md).
Read it before you write your first prop. Worked examples, each with the request that led to it, are in
[references/examples/](references/examples/).

## What a prop is

CrewHub World is a small 3D town where AI agents appear as soft robots working in rooms. Rooms are grids of
square cells, each 0.6 wide. A prop stands on that grid.

**Semantics come first; looks come second.** A prop has two halves:

- **What the grid knows**: its `footprint` (how many cells wide and deep), whether it `blocksMovement`, and its
  `approaches` (the cells where a robot stands to use it). These alone decide where the prop can go and where
  robots walk. The world never looks at the shapes to decide collisions.
- **What it looks like**: `parts`, a list of boxes, cylinders, spheres, cones and rings, each with a size, a
  position, maybe a rotation, and a named material. The parts must fit inside the footprint (plus 0.1 of
  decorative overhang on each side) and between the floor (y = 0) and y = 3.

So decide the footprint from what the thing is and how people use it, then make the parts fit it, not the other
way round.

## The look (art direction)

The world has a settled style, the "Greenhouse" style: a botanical miniature studio. Match it.

- **Soft and rounded.** Boxes have rounded corners by default. Chunky, friendly proportions, like good toy
  furniture. No sharp spikes, no thin wires unless the object is one (a lamp pole).
- **Warm timber, chalk and cream** for furniture; sage and moss greens for upholstery, cabinets and feet; brass for
  poles and handles; terracotta pots with leafy plants as planted details.
- **Loops colours as accents only**: `coral`, `tangerine`, `circle`, `mist`, `ink` for a sticky note, a mug, a
  label. Never a whole cabinet in coral.
- **Few parts, well placed, beat many.** A good lamp is 5 parts, a good bookshelf about 25. Aim for the one or two
  details that make the object readable at a glance (the shade on a lamp, the books on a shelf, a handle on a
  drawer). The limit is 64 parts; you will rarely need 30.
- **Thin details still have a thickness of at least 0.01.** Paper, sticky notes, scribbles, labels and screens are
  thin boxes of 0.01 to 0.02, never 0.004: every used size is at least 0.01.
- **Composite props are fine** (a chair with a lamp, a bench with a plant): one prop, one footprint that covers
  both, parts for each object. Pick the category of the main object.
- **Category for appliances and machines**: `gather` for things people meet around (coffee machine, kettle, water
  cooler), `work` for work equipment and vehicles (server rack, printer, whiteboard, a delivery truck), `storage` for
  containers (a crate that collects things). The category says what a thing is; whether it blocks is a separate
  choice (see "Blocking furniture or decor"), so a whiteboard on the wall is `work` and also non-blocking decor.
- **Glow sparingly**: a bulb or a screen gets `"emissive": true`, usually with `lamp-glow` or `glass`.
  Emissive parts glow brighter in the evening (lamplight) theme by themselves. A warm pool of light on the floor
  under a lamp is not something a prop file can ask for (see "Moving parts and light pools" below).
- Colours are **only** the named materials. Never write a hex colour: the validator rejects it.
- **Keep loud colours to about a tenth of the prop.** `coral`, `tangerine`, `circle` and `ink` are for a flower, a
  mug, a sticky note or a label. Outdoor and play pieces follow the same rule: a slide in sage with cream rails, a
  blanket in terracotta and cream, a bike frame in sage. Next to the room's sage, timber and cream furniture, a big
  coral or tangerine surface jumps out.
- **Every part touches something.** A beam rests on its posts, a chair back meets its seat, a flower sits on the soil,
  a sign hangs from its bar, a ticket in an open crate leans on the crate's wall or the one beside it. Even a 4 cm gap
  shows as a floating piece once the prop is lit and casts shadows. Let joining parts overlap a little rather than meet
  exactly. The validator does not check this, so check it yourself: each part's bottom is the floor or the top of the
  part under it (`position[1] - height / 2`), and labels sit flush on the face they belong to.
- **Check which way a slope tilts.** A slide's chute, a ramp or a roof slab is a rotated box. Work out which end goes
  down before you write the rotation (see "Tilting a box about x" below): a rotation with the wrong sign leaves the chute hanging
  in mid-air.

## Units, axes and sizes

- One grid cell is **0.6** world units (think metres). A 1 × 1 prop has 0.6 × 0.6 of floor; parts may use x and z
  from -0.4 to 0.4 (0.3 plus the 0.1 overhang).
- The prop's origin is the **centre of the footprint on the floor**. y is up. `position` is the **centre** of each
  part, so a box of height 0.8 standing on the floor has `position[1] = 0.4`.
- **The front faces +z.** Put the working side (drawers, a seat, the side you use) toward +z, and approach cells at
  `z = depth` (the row just in front). For things with a front and a back of their own, +z is the side a person
  uses: a chair's seat edge, a vehicle's loading door (its cab or nose then points to -z).
- **Interior scale.** The world draws your prop as written, next to robots about 0.7 tall and the room's own furniture.
  Match the room's heights:

  | Thing | Top (about) |
  | --- | --- |
  | A coffee table | 0.38 |
  | A seat (sofa, armchair, chair) | 0.3; backs to 0.5 |
  | A side table | 0.45 |
  | A desk top | 0.56 |
  | A counter or filing cabinet | 0.8 |
  | A water cooler | 0.95 |
  | A reading or floor lamp | 1.1 |
  | A bookshelf or storage shelf | 1.25 |
  | A potted tree | 1.5 |
  | The room's tall wall | 1.1 |
  | The room's glass wall | 1.75 |

  Something not in the table takes the height of its nearest neighbour: a server rack like a shelf (about 1.2), a
  vehicle about the tall wall (1.1). Footprints stay whole 0.6 cells, so interior furniture is a little chunky, like
  toy furniture.
- **Things for a desk.** A prop placed on a desk (`place: desk of cr-dev-2`) is shrunk by the world to fit about 0.3,
  standing on the desk top. Build it as usual, standing at y = 0 on a 1 x 1 footprint, at whatever size reads well;
  the world scales it down. A potted cactus "for the desk corner" is such a desk piece. The worked examples
  in `references/examples/` were made at a larger, real-world scale: the floor lamp is 1.9 and the bookshelf 1.8.
  Borrow their construction, not their heights.
- Sizes per shape: box `[w, h, d]`; cylinder `[radiusTop, height, radiusBottom]`; sphere `[rx, ry, rz]` (radii,
  not diameters); cone `[radius, height, 0]`; torus `[radius, tube, 0]`, lying flat; wedge
  `[radiusTop, height, radiusBottom]` plus `sweep` in degrees. Every used value is between 0.01 and 3 (a cylinder's or
  wedge's radius may be 0), and that includes a torus's tube and the radii of tiny spheres; unused values are 0.
- **Slices with the wedge.** A wedge is a pie slice of a cylinder or a cone. It starts on +x and turns towards -z, so
  `rotation[1]` is its start angle, and a row of wedges with `sweep: 45` at `rotation: [0, 0, 0]`, `[0, 45, 0]`,
  `[0, 90, 0]` and so on closes a full round:
  - parasol or awning-umbrella stripes: cone slices `[0, h, r]` (radiusTop 0, so the point is at the top),
    alternating cream and a colour, for example
    `{ "shape": "wedge", "size": [0, 0.3, 0.6], "position": [0, 1.4, 0], "rotation": [0, 45, 0], "sweep": 45, "material": "sage" }`;
  - a cake with a slice missing: one cylinder wedge with `sweep: 300`, and the slice beside it on a plate;
  - a pie chart on a wall: `rotation: [90, start, 0]` stands a thin slice up facing +z, starting at `start` degrees
    counter-clockwise from three o'clock as seen from the front. Standing up, the wedge's height (`size[1]`) is its
    thickness along z.
  Prefer it over a fan of thin boxes: one wedge per stripe is fewer parts and has no gaps.
- Rotations are degrees in XYZ order. Rotation changes a part's bounds: a tilted leg may dip below the floor, so
  lift it a little.
- **Tilting a box about x** (a slide's chute, a ramp, a sloping roof, an easel): a positive x rotation lowers the
  box's +z end and raises its -z end; a negative one does the opposite. For a slide whose ladder stands at -z and whose
  chute runs down toward +z, the rotation is positive.
- **Leaning a part** (a frond, a tilted leg, an arm of a cactus): use `rotation: [0, azimuth, lean]`. A positive
  `lean` tips the top toward -x; the `azimuth` then turns that direction around the vertical (azimuth 90 tips it
  toward +z, 180 toward +x). The part's `position` is its base point plus half its length along the tilted
  direction.
- **Big props** (a truck, a long bench): the limits are a footprint of at most 6 × 6 cells, every part size at most
  3, and the whole prop between y = 0 and y = 3. Large props usually block movement (`blocksMovement: true`).
  Anything larger than 3.6 × 3.6 (a building, a whole café terrace) is not a prop. The world's own landmarks of that
  size are assembled in code from several props.

## Blocking furniture or decor

Decide this before the footprint. It is the difference between `furniture.*` and `decor.*` in the world's own models.

- **Blocking furniture** stands on the floor and takes up room: a sofa, a shelf, a table, a planter, a water cooler.
  It has `blocksMovement: true` and approach cells where someone uses it. Robots walk around it.
- **Decor** never gets in the way: a rug, a picture or clock on the wall, a pendant lamp, a whiteboard on the wall,
  a small thing on a desk. It has `blocksMovement: false` and no approaches. Robots walk over a rug and under a
  pendant.
- **Wall pieces are decor.** Give them a footprint one cell deep and as wide as the wall stretch they cover, and put
  their parts against the back of the footprint (-z). Lift them to where they hang; a poster's lowest part may be at
  y = 0.5. They are the one kind of prop whose parts do not start at the floor. Because they are thin, the validator's
  coverage warning (parts covering under 25% of the footprint) is expected for wall pieces and small desk pieces;
  leave it.
- A chair that is pulled up to a table is decor in the world's own meeting room, because the table's approach cells
  already reserve the room around it. A chair standing on its own is furniture.

## The world's own models (for style authors)

The world's look is a style package. The Greenhouse style keeps about a hundred of its models in this same format, in
`packages/style-greenhouse/models/<key>.json`. The id is `builtin:greenhouse-<slug>`, and each key is listed in
`style.json`'s `coveredKeys`. If you are asked to add a model to the style rather than a prop on a ticket, the file name
is its key, and the key's namespace says where the world uses it:

| Namespace | What | Blocking |
| --- | --- | --- |
| `furniture.*` | Room furniture the world places and walks around (sofa, bookshelf, coffee counter, planter). | Yes, with a definition in the app |
| `decor.*` | Room dressing that never blocks: rugs, wall art, clocks, pendant lamps, whiteboards, desk books. | No |
| `town.*` | The town's dressing: trees, bushes, flowers, benches, signposts, gates, playground pieces. | Placed by the town, off the paths |
| `civic.*` | Landmarks and their parts: the bus stop, the clock post, a duck, the square's benches and planters, café tables. | Placed by the town |
| `building.*` | Pieces of a building's shell, mostly drawn in code (walls, slab, ivy); a few small ones are data (the bike). | Part of the building |

Lessons from building these:

- **Composites.** A café table with its parasol and two chairs, a bus shelter with its bench and sign, and a flower bed
  with its tree are each one prop. Bigger things (a café with a kiosk and two of those tables) are put together in
  code from several props.
- **Moving parts and light pools.** Turning sails, rippling water and spinning rotors move in code, not in the file. The
  style adds them and marks the moving meshes `userData.live = true`, so the world's static batching leaves them alone.
  A warm pool of light under a lamp is added in code too, through `LIGHT_POOLS` in the style's `src/keys.ts` (a
  radius and a position per lamp). So a prop file stays still and only marks its bulbs `emissive`. If a lamp should
  throw a pool, say so in your notes.
- **Look at it lit.** The style's own models can be viewed one by one, in day and in lamplight, at
  `/props-preview?group=style` (`&only=civic.` narrows it). Floating parts, a loud colour and a wrong tilt are easy to
  miss in the numbers and obvious in the picture.

## Naming

- `id`: `user:` plus a kebab-case slug of the thing: `user:reading-lamp`, `user:tool-chest`. Lowercase letters,
  digits and single hyphens.
- `name`: short, human, sentence case, at most 40 characters: "Reading lamp".
- `description`: one sentence of at most 200 characters, saying what it looks like.
- `category`: one of `work`, `rest`, `gather`, `storage`, `greenery`, `light`, `decoration`.
- `tags`: up to 8 kebab-case words that help someone find it (`lamp`, `reading`).
- Save the file as `<slug>.json`.

## Steps

1. **Read the request.** A prop request is a crewhub-loops ticket titled `Prop: <thing>` with the label `prop`; the
   body says what the thing is and sometimes where it goes. Read it with `crewhub ticket show <REF> --json` (and
   `crewhub ticket comments <REF> --json` for follow-ups). If you were asked directly, the request is the message.
   Where a request is vague, choose sensibly and say what you chose in your comment; do not stop to ask.
   The world places the prop where the request names it, by a `place:` line in the ticket body (`place: lobby`,
   `place: review room`, `place: desk of cr-dev-2`) or else a room after "for", "in" or "at" in the title
   (`Prop: a tall fern for the lobby`), and otherwise in the building's storage, so keep that line or phrase intact.
2. **Decide the footprint and category.** How many cells does the real object need (a stool: 1 × 1, a bookshelf:
   2 × 1, a workbench: 3 × 2)? Does it block movement (almost always yes)? Where does someone stand to use it
   (approach cells, usually `z = depth`)? Decorations and plants usually have no approaches.
3. **Sketch the parts from the floor up.** Feet or base first, then the body, then the top, then the details that
   make it readable. For each part write down its size and compute its centre: `y = bottom + height / 2`. Keep
   every part inside the footprint box.
4. **Write the JSON** following [references/prop-format.md](references/prop-format.md). Start from the closest
   example in [references/examples/](references/examples/).
5. **Validate**: from the CrewHub World repository root run

   ```sh
   npm run prop:validate -- path/to/<slug>.json
   ```

   Each problem prints as `<file>: <path>: <message>`, for example
   `lamp.json: parts[3].size[1]: must be between 0.01 and 3` (the fourth part's height). Exit code 0 means valid.
6. **Fix until green.** Fix the named part, run the validator again, repeat. Also read any `warning:` line: a
   footprint much larger than the parts usually means the footprint should shrink.
7. **Attach the result to the ticket as a comment** whose body contains the JSON in one fenced `json` block, then
   **move the ticket to Review**:

   ````sh
   cat > comment.md <<'EOF'
   Prop ready: Reading lamp (1 x 1, light). Validated with `npm run prop:validate`.

   ```json
   { ...the whole prop file... }
   ```
   EOF
   crewhub ticket comment <REF> --body-file comment.md
   crewhub ticket move <REF> review
   ````

   Post exactly one `json` block per comment. The world uses the most recent `json` block on the ticket, so a
   corrected prop posted later replaces an earlier one. Put any notes (what you assumed) in
   the text above the block. Do not move the ticket to Done: a person does that, and that is when the prop enters
   the world's catalogue.

   **Why a comment and not an attachment:** the world follows the crewhub-loops event stream. Posting a comment
   emits a `comment.created` event, so the world learns about the prop at once. Adding an attachment emits nothing
   the stream can deliver (`attachment.added` is accepted as a filter but never emitted), so a world following the
   stream would never see an attached file.

## Checklist before you post

- [ ] The validator exits 0 on the file you are posting (not an older copy).
- [ ] The footprint matches the real object; the front faces +z; approach cells are where someone would stand.
- [ ] Blocking furniture or decor decided; decor has `blocksMovement: false` and no approaches.
- [ ] Heights match the interior scale table, not real-world heights.
- [ ] Soft, rounded, warm materials; loops colours only as small accents (about a tenth); no hex anywhere.
- [ ] Every part touches another part or the floor (wall pieces excepted); slopes tilt the right way.
- [ ] Between about 5 and 30 parts, each one doing visible work.
- [ ] One fenced `json` block in the comment, the ticket moved to Review, not Done.
