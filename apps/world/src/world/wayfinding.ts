/* Finding your way at scale: the zoom levels (region, district, building, room), what the world says when it is
   zoomed out (a summary and one beacon per district and per building) and the jump list. Pure (no Three.js, no DOM),
   so it runs under `node --test`; the scene, the breadcrumb, the jump list and the text view all read it. See
   "Finding your way at scale" in the demo-mode spec. */
import type { AgentPlacement, Building, RoomKind, TicketStatus, WorldModel, Zone } from "@crewhub/world-model";

/* ── Districts ────────────────────────────────────────────────────────── */

/** A district as wayfinding sees it: a zone with the buildings that stand in it. */
export interface DistrictPlace {
  id: string;
  name: string;
  zone: Zone | null;
  buildings: Building[];
}

/**
 * The districts in use, in zone order. `districtOf` says in which district a building stands (the town plan knows;
 * after a regroup it differs from the zone the building belongs to); without it the building's own zone decides.
 * A zone nobody named is called by its place in the order.
 */
export function districtsOf(model: Pick<WorldModel, "zones" | "buildings">, districtOf?: (slug: string) => string | undefined): DistrictPlace[] {
  const zones = [...model.zones].sort((a, b) => a.order - b.order);
  const byId = new Map<string, DistrictPlace>();
  for (const building of model.buildings) {
    const id = districtOf?.(building.slug) ?? building.zoneId;
    let place = byId.get(id);
    if (!place) {
      place = { id, name: "", zone: zones.find((z) => z.id === id) ?? null, buildings: [] };
      byId.set(id, place);
    }
    place.buildings.push(building);
  }
  const rank = (id: string) => {
    const index = zones.findIndex((z) => z.id === id);
    return index < 0 ? zones.length : index;
  };
  const places = [...byId.values()].sort((a, b) => rank(a.id) - rank(b.id));
  places.forEach((place, index) => (place.name = place.zone?.name ?? (places.length === 1 ? "The town" : place.zone?.source === "default" ? "Old town" : `District ${index + 1}`)));
  return places;
}

/** A region has a district level: more than one district is in use. A single settlement goes from home to building. */
export const isRegion = (districts: readonly DistrictPlace[]): boolean => districts.length > 1;

/* ── Zoom levels ──────────────────────────────────────────────────────── */

export type ZoomLevel = "region" | "district" | "building" | "room";

/** Where the view is: nothing set is the home view. A building always carries its district in a region. */
export interface Place {
  district: string | null;
  building: string | null;
  room: RoomKind | null;
}
export const HOME: Place = { district: null, building: null, room: null };

export function levelOf(place: Place): ZoomLevel {
  if (place.building) return place.room ? "room" : "building";
  return place.district ? "district" : "region";
}

/** The place one level out (the Escape chain: room, building, district, home), or null at home. */
export function stepOut(place: Place): Place | null {
  if (place.building && place.room) return { ...place, room: null };
  if (place.building) return { district: place.district, building: null, room: null };
  if (place.district) return HOME;
  return null;
}

/** What the home view is called: a region of districts, else the one settlement. */
export const homeName = (districts: readonly DistrictPlace[]): string => (isRegion(districts) ? "Region" : "Town");

export interface Crumb {
  level: ZoomLevel;
  label: string;
  /** The place this crumb goes back to; null for the current one. */
  to: Place | null;
}

/** The breadcrumb for a place, outermost first; the last crumb is where you are. */
export function crumbs(place: Place, names: { home: string; district: string | null; building: string | null; room: string | null }): Crumb[] {
  const out: Crumb[] = [{ level: "region", label: names.home, to: HOME }];
  if (place.district && names.district) out.push({ level: "district", label: names.district, to: { district: place.district, building: null, room: null } });
  if (place.building && names.building) out.push({ level: "building", label: names.building, to: { district: place.district, building: place.building, room: null } });
  if (place.building && place.room && names.room) out.push({ level: "room", label: names.room, to: null });
  out[out.length - 1]!.to = null;
  return out;
}

/* ── Summaries and beacons ────────────────────────────────────────────── */

/** What needs a person, counted in tickets. */
export interface Needs {
  /** Waiting on a person (a question, a name tag). */
  waiting: number;
  /** The watchdog's `attention`. */
  attention: number;
  /** Quiet for too long. */
  stalled: number;
}

export interface Summary {
  buildings: number;
  /** Agents really here (no proxies). */
  agents: number;
  /** Of those, how many are working right now. */
  working: number;
  counts: Record<TicketStatus, number>;
  needs: Needs;
  /** True when the beacon is lit. */
  beacon: boolean;
}

const NO_COUNTS = (): Record<TicketStatus, number> => ({ backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 });
const real = (a: AgentPlacement) => a.presence === "real";

/** What needs a person in a building. An archived building asks for nobody. */
export function needsOf(building: Building): Needs {
  const needs: Needs = { waiting: 0, attention: 0, stalled: 0 };
  if (building.archived) return needs;
  for (const o of building.objects) {
    if (o.status === "done") continue;
    if (o.stall?.state === "attention") needs.attention++;
    else if (o.stall?.state === "stalled") needs.stalled++;
    else if (o.waitingOnHuman || o.nameTag) needs.waiting++;
  }
  return needs;
}

export const needsTotal = (needs: Needs): number => needs.waiting + needs.attention + needs.stalled;

export function summarise(buildings: readonly Building[]): Summary {
  const summary: Summary = { buildings: 0, agents: 0, working: 0, counts: NO_COUNTS(), needs: { waiting: 0, attention: 0, stalled: 0 }, beacon: false };
  for (const b of buildings) {
    if (b.archived) continue;
    summary.buildings++;
    for (const a of b.agents)
      if (real(a)) {
        summary.agents++;
        if (a.laneStatus === "working") summary.working++;
      }
    for (const status of Object.keys(summary.counts) as TicketStatus[]) summary.counts[status] += b.counts[status];
    const needs = needsOf(b);
    summary.needs.waiting += needs.waiting;
    summary.needs.attention += needs.attention;
    summary.needs.stalled += needs.stalled;
  }
  summary.beacon = needsTotal(summary.needs) > 0;
  return summary;
}

/** "2 waiting on a person, 1 needs attention, 1 stalled", leaving out what is zero; "" when nothing needs anyone. */
export function needsWords(needs: Needs): string {
  return [needs.waiting && `${needs.waiting} waiting on a person`, needs.attention && `${needs.attention} ${needs.attention === 1 ? "needs" : "need"} attention`, needs.stalled && `${needs.stalled} stalled`]
    .filter(Boolean)
    .join(", ");
}

/** The open work in a few words, zeros left out: "4 in progress, 2 review, 6 planned". */
export function workWords(counts: Record<TicketStatus, number>): string {
  const parts = [counts.in_progress && `${counts.in_progress} in progress`, counts.review && `${counts.review} review`, counts.planned && `${counts.planned} planned`, counts.backlog && `${counts.backlog} backlog`].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing open";
}

/** One sentence for a district: for the text view, the jump list and the label's accessible name. */
export function summaryWords(summary: Summary): string {
  const needs = needsWords(summary.needs);
  return `${summary.buildings} ${summary.buildings === 1 ? "building" : "buildings"}, ${summary.agents} ${summary.agents === 1 ? "agent" : "agents"} (${summary.working} working). ${workWords(summary.counts)}.${needs ? ` Needs a person: ${needs}.` : ""}`;
}

/* ── The jump list ────────────────────────────────────────────────────── */

export type JumpKind = "zone" | "building" | "agent" | "civic";

export interface JumpEntry {
  kind: JumpKind;
  /** Unique in the list. */
  id: string;
  label: string;
  /** The line under the label: where it is and how it is doing. */
  detail: string;
  /** The place the camera flies to. */
  place: Place;
  /** The agent to select on arrival, or the civic building to frame. */
  agent?: string;
  civic?: "town-hall" | "post-office";
  /** How much it needs a person: sorts the list when nothing is typed. */
  needs: number;
  /** Lower-case words the search matches beside the label. */
  keywords: string;
}

/** What needs a person leads a row's detail, so it survives the row being cut short. */
const lead = (needs: string): string => (needs ? `Needs a person: ${needs}. ` : "");

/** Every place one can jump to: districts (in a region), buildings, agents and the two civic buildings. */
export function jumpEntries(model: Pick<WorldModel, "zones" | "buildings" | "townHall" | "postOffice">, districts: readonly DistrictPlace[]): JumpEntry[] {
  const entries: JumpEntry[] = [];
  const region = isRegion(districts);
  if (region)
    for (const d of districts) {
      const summary = summarise(d.buildings);
      entries.push({
        kind: "zone",
        id: `zone:${d.id}`,
        label: d.name,
        detail: `${lead(needsWords(summary.needs))}${summary.buildings} ${summary.buildings === 1 ? "building" : "buildings"}, ${summary.agents} ${summary.agents === 1 ? "agent" : "agents"}. ${workWords(summary.counts)}.`,
        place: { district: d.id, building: null, room: null },
        needs: needsTotal(summary.needs),
        keywords: "zone district",
      });
    }
  for (const d of districts)
    for (const b of d.buildings) {
      const needs = needsOf(b);
      const words = needsWords(needs);
      entries.push({
        kind: "building",
        id: `building:${b.slug}`,
        label: b.name,
        detail: `${lead(words)}${b.key}${region ? `, ${d.name}` : ""}. ${b.archived ? "Archived." : `${workWords(b.counts)}.`}`,
        place: { district: region ? d.id : null, building: b.slug, room: null },
        needs: needsTotal(needs),
        keywords: `${b.key} ${b.slug} ${d.name} project building`.toLowerCase(),
      });
    }
  const seen = new Set<string>();
  for (const d of districts)
    for (const b of d.buildings)
      for (const a of b.agents) {
        if (!real(a) || seen.has(a.key)) continue;
        seen.add(a.key);
        const asks = a.posture === "raised-hand" || a.laneStatus === "blocked" || a.caption?.kind === "question";
        entries.push({
          kind: "agent",
          id: `agent:${a.key}`,
          label: a.displayName,
          detail: `${a.role} in ${b.name}${region ? `, ${d.name}` : ""}. ${asks ? "Asks for help." : `${a.laneStatus === "unknown" ? "Status unknown" : a.laneStatus[0]!.toUpperCase() + a.laneStatus.slice(1)}.`}`,
          place: { district: region ? d.id : null, building: b.slug, room: a.room },
          agent: a.key,
          needs: asks ? 1 : 0,
          keywords: `${a.name} ${a.role} ${b.name} ${b.key} agent`.toLowerCase(),
        });
      }
  const civic = (id: "town-hall" | "post-office", label: string, agents: readonly AgentPlacement[], empty: string) =>
    entries.push({ kind: "civic", id: `civic:${id}`, label, detail: agents.length ? agents.map((a) => a.displayName).join(", ") : empty, place: HOME, civic: id, needs: 0, keywords: `civic ${agents.map((a) => `${a.displayName} ${a.name}`).join(" ")}`.toLowerCase() });
  civic("town-hall", "Town hall", model.townHall, "Nobody here.");
  civic("post-office", "Post office", model.postOffice, "The postman is out.");
  return entries;
}

const KIND_ORDER: Record<JumpKind, number> = { zone: 0, building: 1, agent: 2, civic: 3 };

/** How well an entry answers a query: 0 is no match. A label that starts with it wins, then a word that does, then anywhere, then the keywords. */
export function jumpScore(entry: JumpEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = entry.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/[\s\-_/]+/).some((word) => word.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  // Every word of the query somewhere in the label or the keywords ("garden lead").
  const hay = `${label} ${entry.keywords}`;
  return q.split(/\s+/).every((word) => hay.includes(word)) ? 20 : 0;
}

/**
 * The entries that answer a query, best first. With nothing typed: what needs a person first, then districts,
 * buildings and agents in their order, so the list is useful before a key is pressed.
 */
export function searchJumps(entries: readonly JumpEntry[], query: string, limit = 50): JumpEntry[] {
  const empty = !query.trim();
  return entries
    .map((entry, index) => ({ entry, index, score: jumpScore(entry, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => (empty ? Math.sign(b.entry.needs) - Math.sign(a.entry.needs) : b.score - a.score) || KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.entry);
}

/* ── Level of detail by distance ──────────────────────────────────────── */

/** What the labels say at a zoom: districts only from far, building signs nearer, everything close by. */
export type LabelDetail = "districts" | "buildings" | "close";

/** Screen pixels per world unit below which a building's sign would crowd its neighbours (a lot is 30 units). */
export const BUILDING_SIGN_PX = 3.4;
/** Above this, a building fills enough of the screen for its expanded sign. */
export const CLOSE_PX = 9;

/**
 * Which labels show at `pixelsPerUnit`. Only a region steps back to district summaries; a single settlement keeps its
 * building signs however far out, since there is nothing above them. `previous` gives a little hysteresis, so a
 * zoom resting at a threshold does not flicker.
 */
export function labelDetail(pixelsPerUnit: number, region: boolean, previous: LabelDetail | null = null): LabelDetail {
  const slack = 0.08;
  const above = (threshold: number, wasAbove: boolean) => pixelsPerUnit > threshold * (wasAbove ? 1 - slack : 1 + slack);
  if (above(CLOSE_PX, previous === "close")) return "close";
  if (!region || above(BUILDING_SIGN_PX, previous === "buildings" || previous === "close")) return "buildings";
  return "districts";
}
