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
- **Glow sparingly**: a bulb or a screen gets `"emissive": true`, usually with `lamp-glow` or `glass`.
- Colours are **only** the named materials. Never write a hex colour: the validator rejects it.

## Units, axes and sizes

- One grid cell is **0.6** world units (think metres). A 1 × 1 prop has 0.6 × 0.6 of floor; parts may use x and z
  from -0.4 to 0.4 (0.3 plus the 0.1 overhang).
- The prop's origin is the **centre of the footprint on the floor**. y is up. `position` is the **centre** of each
  part, so a box of height 0.8 standing on the floor has `position[1] = 0.4`.
- **The front faces +z.** Put the working side (drawers, a seat, the side you use) toward +z, and approach cells at
  `z = depth` (the row just in front).
- Real-world scale helps: a table top is about 0.75 to 0.85 high, a seat about 0.45 to 0.55, a door-height shelf
  about 1.8, a floor lamp about 1.9. A robot is about 1.1 tall.
- Sizes per shape: box `[w, h, d]`; cylinder `[radiusTop, height, radiusBottom]`; sphere `[rx, ry, rz]` (radii,
  not diameters); cone `[radius, height, 0]`; torus `[radius, tube, 0]`, lying flat. Every used value is between
  0.01 and 3; unused values are 0.
- Rotations are degrees in XYZ order. Rotation changes a part's bounds: a tilted leg may dip below the floor, so
  lift it a little.

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

   Post exactly one `json` block per comment: the world takes the first one. Put any notes (what you assumed) in
   the text above the block. Do not move the ticket to Done: a person does that, and that is when the prop enters
   the world's catalogue.

   **Why a comment and not an attachment:** the world follows the crewhub-loops event stream. Posting a comment
   emits a `comment.created` event, so the world learns about the prop at once. Adding an attachment emits nothing
   the stream can deliver (`attachment.added` is accepted as a filter but never emitted), so a world following the
   stream would never see an attached file.

## Checklist before you post

- [ ] The validator exits 0 on the file you are posting (not an older copy).
- [ ] The footprint matches the real object; the front faces +z; approach cells are where someone would stand.
- [ ] Soft, rounded, warm materials; loops colours only as small accents; no hex anywhere.
- [ ] Between about 5 and 30 parts, each one doing visible work.
- [ ] One fenced `json` block in the comment, the ticket moved to Review, not Done.
