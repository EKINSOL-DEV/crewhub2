# prop-builder eval, 2026-10-01 (after the art pass)

The same six requests as the [first run](../2026-10-01/RESULTS.md), re-run after SKILL.md learned:
- the interior scale table;
- blocking furniture versus decor;
- the world's own namespaces (`furniture.*`, `decor.*`, `town.*`, `civic.*`, `building.*`);
- composites, moving parts and light pools in code;
- the touching-parts and tilt rules.

Test subject: Sonnet 5.5, one fresh agent per request, using only `skills/prop-builder/SKILL.md` and `references/`.
There is no crewhub-loops server, so each agent wrote its file here instead of posting a comment. Every file was
validated with `npm run prop:validate`.

| # | Request | File | Runs to green | Failed-run errors | Warnings | Footprint, blocking, height |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | a coffee machine | `coffee-machine.json` | 1 | none | none | 1 x 1, blocks, 0.95 |
| 2 | a whiteboard with three sticky notes | `whiteboard-sticky-notes.json` | 1 | none | coverage 17% (expected for a wall piece) | 2 x 1, decor on the wall, 0.61 to 1.37 |
| 3 | a bug crate | `bug-crate.json` | 1 | none | none | 1 x 1, blocks, 0.56 |
| 4 | a server rack | `server-rack.json` | 1 | none | none | 1 x 1, blocks, 1.21 |
| 5 | a potted cactus | `potted-cactus.json` | 1 | none | none | 1 x 1, blocks, 0.82 |
| 6 | a delivery truck | `delivery-truck.json` | 1 | none | none | 2 x 4, blocks, 1.1 |

Totals: six props, all green on the first run. The first run needed nine validator runs for eight props.
- **Heights now match the room furniture.** The first run's server rack was 1.9 tall and its truck's cab 1.2; this
  run's rack is 1.21 and the truck 1.1.
- **The whiteboard is now a wall piece:** non-blocking, lifted, one cell deep.
- **Rendered in `/props-preview?group=eval`** next to the first run: all 12 files are valid, with no page errors.
- **Gap audit** (parts that touch neither the floor nor another part): one finding. The bug crate's three ticket cards
  stand free inside the open crate.

## Skill feedback, and what changed afterwards

| Feedback | Change to SKILL.md |
| --- | --- |
| The whiteboard is listed under `work` and also counted as decor. | Category and blocking are separate choices; a wall whiteboard is `work` and non-blocking. |
| The coverage warning is unavoidable on thin wall pieces. | It is now stated as expected for wall pieces and small desk pieces. |
| A cactus "for the desk corner": a floor piece or a desk piece? | New "Things for a desk": the world shrinks a desk prop to about 0.3, so build it standing at y = 0. |
| No height for a rack or a vehicle. | Unlisted things take their nearest neighbour's height: a rack like a shelf, a vehicle like the tall wall. Vehicles are `work`. |
| The validator passed a label 2 cm off the body; floating parts rest on hand arithmetic. | The touching rule now says how to check it (bottom = the floor or the top of the part below), with the crate's tickets as an example. |
| "For the lobby" in a ticket body is not a place the world reads. | Unchanged: the world reads a `place:` line or the title, as SKILL.md says. |
