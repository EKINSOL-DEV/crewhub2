# prop-builder eval, 2026-10-02 (after the wedge part)

The same six requests as the [first run](../2026-10-01/RESULTS.md) and the [art-pass run](../2026-10-01-art/RESULTS.md),
plus two requests that call for the new `wedge` part (a pie slice of a cylinder or cone, `sweep` degrees wide).

Test subject: Sonnet 5.5, one fresh agent per request, using only `skills/prop-builder/SKILL.md` and `references/`.
There is no crewhub-loops server, so each agent wrote its file here instead of posting a comment. Every file was
validated with `npm run prop:validate`.

| # | Request | File | Runs to green | Failed-run errors | Warnings | Footprint, blocking, height | Shapes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | a coffee machine | `coffee-machine.json` | 2 | run 1: `parts[10].size[1]: must be between 0.01 and 3` (a torus tube of 0.008) | none | 1 x 1, blocks, 1.19 | box, cylinder, torus |
| 2 | a whiteboard with three sticky notes | `whiteboard-sticky-notes.json` | 1 | none | coverage 15% (expected for a wall piece) | 2 x 1, decor on the wall, 0.48 to 1.12 | box |
| 3 | a bug crate | `bug-crate.json` | 1 | none | none | 1 x 1, blocks, 0.38 | box, sphere |
| 4 | a server rack | `server-rack.json` | 1 | none | none | 1 x 1, blocks, 1.23 | box, cylinder |
| 5 | a potted cactus for the desk corner | `potted-cactus.json` | 1 | none | none | 1 x 1, desk piece (walkable), 1.04 before the world shrinks it | cylinder, torus, sphere |
| 6 | a delivery truck | `delivery-truck.json` | 1 | none | none | 2 x 3, blocks, 0.87 | box, cylinder, sphere |
| 7 | a striped garden parasol over a small round table | `garden-parasol.json` | 1 | none | none | 1 x 1, blocks, 1.36 | cylinder, **wedge**, sphere |
| 8 | a pie chart poster for the analyst room wall | `pie-chart-poster.json` | 1 | none | coverage 10% (expected for a wall piece) | 2 x 1, decor on the wall, 0.62 to 1.38 | box, **wedge** |

Totals: eight props, nine validator runs, one failure (a torus tube below the 0.01 minimum). Both wedge requests
passed on the first run and used the wedge as the skill describes: alternating cone slices for the parasol, and slices
stood up with `rotation: [90, start, 0]` for the pie chart.

- **Rendered in `/props-preview?group=eval`** next to the two earlier runs: all 20 files are valid, with no page errors.
- **Heights stay at room scale** (the rack 1.23, the truck 0.87), as in the art-pass run.

## Skill feedback, and what changed afterwards

| Feedback | Change to SKILL.md |
| --- | --- |
| The 0.01 minimum also bites on a torus tube and tiny radii, not only on thin boxes. | The sizes bullet now says the minimum includes a torus's tube and the radii of tiny spheres. |
| A wedge's point: is `radiusTop` 0 the top? | The parasol line says so, with a complete wedge part to copy. |
| Standing a wedge up for a pie chart, `size[1]` becomes its thickness along z. | Said in the pie-chart line. |
| The validator's ok line does not print the height range or the shapes. | Unchanged: the ok line stays short; the skill asks for the height in the comment. |
| No example of a wall poster, a vehicle or a desk piece in `references/examples/`. | Unchanged for now; the scale table and the desk and wall sections cover them. Worth an example each later. |
| Which rotation lays a cylinder on its side (a wheel)? | Unchanged: `rotation: [0, 0, 90]`, as the agent inferred; candidate for a line in the next pass. |
