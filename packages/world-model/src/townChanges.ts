/**
 * What a restore or an import would change, in plain words (spec addendum "the world database, second slice"): the
 * difference between the town as it is and the town a file or a backup holds, as a reader would list it: zones added,
 * removed, renamed or re-marked, assignments, plots added, removed or moved, props placed, taken away or moved, user
 * props, rules, the style and the cast. Empty when nothing would change. Pure.
 */
import type { TownDocument, PlacedProp } from "./townDocument.ts";
import type { TownZone } from "./zones.ts";

const MAX_NAMED = 3;

/** "a, b and c", or "a, b, c and 4 more". */
function listed(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMED);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length <= 1 ? (shown[0] ?? "") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function zoneName(zone: TownZone | undefined, id: string): string {
  const name = zone?.name?.trim();
  return name ? `"${name}"` : id === "default" ? "no zone" : `"${id}"`;
}

const sameSite = (a: PlacedProp, b: PlacedProp): boolean => JSON.stringify(a.at) === JSON.stringify(b.at) && a.cell.x === b.cell.x && a.cell.z === b.cell.z && a.rotation === b.rotation;

/** The lines of what `after` changes against `before`; none when the two towns are the same for a reader. */
export function townChanges(before: TownDocument, after: TownDocument): string[] {
  const lines: string[] = [];

  if (before.styleId !== after.styleId) lines.push(`The town's style changes from ${before.styleId} to ${after.styleId}.`);
  if ((before.castId ?? null) !== (after.castId ?? null)) lines.push(after.castId ? `The town's cast becomes ${after.castId}.` : "The town's cast follows the style again.");
  if (JSON.stringify(before.styleOptions ?? {}) !== JSON.stringify(after.styleOptions ?? {})) lines.push("The town's style options change.");

  const zonesBefore = new Map((before.zones ?? []).map((z) => [z.id, z]));
  const zonesAfter = new Map((after.zones ?? []).map((z) => [z.id, z]));
  const added: string[] = [];
  const removed: string[] = [];
  for (const [id, zone] of zonesAfter) if (!zonesBefore.has(id)) added.push(zoneName(zone, id));
  for (const [id, zone] of zonesBefore) if (!zonesAfter.has(id)) removed.push(zoneName(zone, id));
  if (added.length) lines.push(`${plural(added.length, "zone", "zones")} added: ${listed(added)}.`);
  if (removed.length) lines.push(`${plural(removed.length, "zone", "zones")} removed: ${listed(removed)}.`);
  for (const [id, was] of zonesBefore) {
    const is = zonesAfter.get(id);
    if (!is) continue;
    if ((was.name ?? null) !== (is.name ?? null)) lines.push(`Zone ${zoneName(was, id)} is renamed ${zoneName(is, id)}.`);
    if ((was.color ?? null) !== (is.color ?? null) || (was.emblem ?? null) !== (is.emblem ?? null)) lines.push(`Zone ${zoneName(is, id)} gets another mark (${is.color ?? "no colour"}, ${is.emblem ?? "no emblem"}).`);
    if (JSON.stringify(was.look ?? {}) !== JSON.stringify(is.look ?? {})) lines.push(`Zone ${zoneName(is, id)} is dressed differently.`);
    if ((was.order ?? null) !== (is.order ?? null)) lines.push(`Zone ${zoneName(is, id)} changes place in the order.`);
  }

  const assignBefore = before.assignments ?? {};
  const assignAfter = after.assignments ?? {};
  const moved: string[] = [];
  const freed: string[] = [];
  for (const slug of new Set([...Object.keys(assignBefore), ...Object.keys(assignAfter)])) {
    const was = assignBefore[slug];
    const is = assignAfter[slug];
    if (was === is) continue;
    if (is === undefined) freed.push(slug);
    else moved.push(`${slug} to ${zoneName(zonesAfter.get(is), is)}`);
  }
  if (moved.length) lines.push(`${plural(moved.length, "building", "buildings")} assigned: ${listed(moved)}.`);
  if (freed.length) lines.push(`${plural(freed.length, "building", "buildings")} no longer assigned by hand: ${listed(freed)}.`);

  const plotsBefore = new Map(before.plots.map((p) => [p.slug, p]));
  const plotsAfter = new Map(after.plots.map((p) => [p.slug, p]));
  const plotsAdded = [...plotsAfter.keys()].filter((s) => !plotsBefore.has(s));
  const plotsRemoved = [...plotsBefore.keys()].filter((s) => !plotsAfter.has(s));
  const plotsMoved = [...plotsAfter.entries()].filter(([s, p]) => plotsBefore.has(s) && (plotsBefore.get(s)!.cell.x !== p.cell.x || plotsBefore.get(s)!.cell.z !== p.cell.z || (plotsBefore.get(s)!.zoneId ?? null) !== (p.zoneId ?? null))).map(([s]) => s);
  const plotsDressed = [...plotsAfter.entries()].filter(([s, p]) => plotsBefore.has(s) && JSON.stringify([plotsBefore.get(s)!.styleId, plotsBefore.get(s)!.styleOptions, plotsBefore.get(s)!.castId]) !== JSON.stringify([p.styleId, p.styleOptions, p.castId])).map(([s]) => s);
  if (plotsAdded.length) lines.push(`${plural(plotsAdded.length, "plot", "plots")} added: ${listed(plotsAdded)}.`);
  if (plotsRemoved.length) lines.push(`${plural(plotsRemoved.length, "plot", "plots")} removed: ${listed(plotsRemoved)} (a building without a plot gets one again).`);
  if (plotsMoved.length) lines.push(`${plural(plotsMoved.length, "building moves", "buildings move")} to another lot or district: ${listed(plotsMoved)}.`);
  if (plotsDressed.length) lines.push(`${plural(plotsDressed.length, "building", "buildings")} dressed differently: ${listed(plotsDressed)}.`);

  const placedBefore = new Map(before.placements.map((p) => [p.id, p]));
  const placedAfter = new Map(after.placements.map((p) => [p.id, p]));
  const propsPlaced = [...placedAfter.values()].filter((p) => !placedBefore.has(p.id)).map((p) => p.propId);
  const propsTaken = [...placedBefore.values()].filter((p) => !placedAfter.has(p.id)).map((p) => p.propId);
  const propsMoved = [...placedAfter.values()].filter((p) => placedBefore.has(p.id) && !sameSite(placedBefore.get(p.id)!, p)).map((p) => p.propId);
  if (propsPlaced.length) lines.push(`${plural(propsPlaced.length, "prop", "props")} placed: ${listed(propsPlaced)}.`);
  if (propsTaken.length) lines.push(`${plural(propsTaken.length, "prop", "props")} taken away: ${listed(propsTaken)}.`);
  if (propsMoved.length) lines.push(`${plural(propsMoved.length, "prop", "props")} moved or turned: ${listed(propsMoved)}.`);

  const userBefore = new Map(before.userProps.map((p) => [p.id, p]));
  const userAfter = new Map(after.userProps.map((p) => [p.id, p]));
  const userAdded = [...userAfter.values()].filter((p) => !userBefore.has(p.id)).map((p) => p.name || p.id);
  const userGone = [...userBefore.values()].filter((p) => !userAfter.has(p.id)).map((p) => p.name || p.id);
  if (userAdded.length) lines.push(`${plural(userAdded.length, "prop", "props")} joins the catalogue: ${listed(userAdded)}.`);
  if (userGone.length) lines.push(`${plural(userGone.length, "prop", "props")} leaves the catalogue: ${listed(userGone)}.`);

  for (const rule of new Set([...Object.keys(before.rules), ...Object.keys(after.rules)]) as Set<keyof TownDocument["rules"]>) {
    const was = before.rules[rule] === true;
    const is = after.rules[rule] === true;
    if (was !== is) lines.push(`Rule ${rule} switched ${is ? "on" : "off"}.`);
  }
  return lines;
}
