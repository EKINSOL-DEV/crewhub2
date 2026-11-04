/* The world view's navigation as one module (round 59d, architecture candidate C2): where the view is (district,
   building, room, zoom), what is picked, the agent card, the agent the camera follows, the walk and its return point,
   and the camera commands, all one value; what the person or the scene wants, one intent; and the sentence the page
   says for it. Pure: no React, no DOM, no Three.js, so the Escape chain, the walk's way back, a followed figure arriving
   and the keys of the stage are driven under `node --test` through this one interface (`test/view.test.ts`). App.tsx
   dispatches and keeps the value; WorldCanvas and TownScene read it and send intents back. Before this module the same
   facts lived in ten `useState`s, fifteen callbacks and a second walk-back copy in the scene. */
import { archivedWords, type AgentPlacement, type RoomKind, type RoomWording, type WorldModel } from "@crewhub/world-model";
import type { Pick as Target } from "../world/buildingView.ts";
import { buildingTemplate } from "../world/buildingTemplate.ts";
import { firstRoom, roomNeighbor } from "../world/interiorLayout.ts";
import { roomName, roomSummary, zoomedTo } from "../world/roomWords.ts";
import { countsLine, laneWords } from "../world/townLayout.ts";
import { moveFocus, type TownPlan } from "../world/townPlan.ts";
import { isRegion, stepOut, summarise, summaryWords, type DistrictPlace, type JumpEntry, type Place } from "../world/wayfinding.ts";
import type { CameraAction } from "../world/TownScene.ts";

/** What the pointer is over and what is picked in the scene (an agent, a person, an object, a room). */
export interface Selection {
  hover: Target | null;
  selected: Target | null;
}

/** The level a walk began on: where Escape brings the view back to. */
export interface WalkBack {
  entered: string | null;
  room: RoomKind | null;
  zoomed: RoomKind | null;
  district: string | null;
}

/** The world view: one value, read by App's chrome, WorldCanvas and the scene. */
export interface View {
  /** Slug of the building whose interior is shown, or null for the town or a district. */
  entered: string | null;
  /** The district the view is in (a region only): the level between the home view and a building. */
  district: string | null;
  /** Inside a building: the room with the keyboard focus ring, and the room the camera frames. */
  room: RoomKind | null;
  zoomed: RoomKind | null;
  /** Index (in `model.buildings`) of the building with the keyboard focus ring, and whether the ring shows. */
  focused: number;
  ringVisible: boolean;
  /** The jump list's active row's building while the list is open: the scene builds it ahead. */
  likely: string | null;
  selection: Selection;
  /** The agent card is open for the selected agent. */
  card: boolean;
  /** The agent the camera follows, or null. */
  following: string | null;
  /** Walk mode: the person walks a visitor through the world; the level it began on is kept here for the way back. */
  walk: WalkBack | null;
  /** A camera command; a new id runs it once. */
  action: { id: number; type: CameraAction };
  /** A camera flight to a label anchor (a civic building, a town figure); `reach` is the ground framed around it. */
  flight: { id: number; anchor: string; reach?: number };
}

const NO_SELECTION: Selection = { hover: null, selected: null };

export const HOME_VIEW: View = {
  entered: null,
  district: null,
  room: null,
  zoomed: null,
  focused: 0,
  ringVisible: false,
  likely: null,
  selection: NO_SELECTION,
  card: false,
  following: null,
  walk: null,
  action: { id: 0, type: "home" },
  flight: { id: 0, anchor: "" },
};

export type ViewIntent =
  /** A click on a building, Enter on the focused one, a walk through its front door. */
  | { type: "enter"; slug: string }
  /** Backspace, Escape inside, a walk out through the front door: out of the building. */
  | { type: "back" }
  /** A place of any level (the breadcrumb, a district's label, the text view); `agent` is one to land beside. */
  | { type: "go"; place: Place; agent?: string | undefined }
  /** The jump list's chosen entry: its place, and a flight to a town figure or a civic building. */
  | { type: "jump"; entry: JumpEntry }
  /** The jump list's active row changed: its building, to build ahead. */
  | { type: "jumpActive"; building: string | null }
  /** The pointer or the focus is on a building's plot or sign. */
  | { type: "hover"; index: number | null }
  /** Inside: the focus ring on a room, zoomed to it or not. */
  | { type: "focusRoom"; kind: RoomKind; zoom: boolean }
  /** A pick in the scene: under the pointer (`hover`) or clicked. */
  | { type: "pick"; target: Target | null; hover: boolean }
  /** Follow an agent, or stop (null). */
  | { type: "follow"; key: string | null }
  /** The followed figure walked into a building (its slug) or out into the town (null). */
  | { type: "followed"; building: string | null }
  /** The follow ended in the scene (a drag, the figure left). */
  | { type: "followStopped" }
  | { type: "startWalk" }
  | { type: "stopWalk" }
  | { type: "closeCard" }
  /** Escape, once the page's dialogs had their turn: `open` says which of the view's own overlays stand. */
  | { type: "escape"; open: { text: boolean; build: boolean } }
  /** A key pressed with the scene focused: the arrow keys, Home, End and Enter (`onCanvas`: on the canvas itself). */
  | { type: "key"; key: string; onCanvas: boolean }
  | { type: "camera"; action: CameraAction }
  /** The districts changed under the view: a district that emptied has no level left. */
  | { type: "settle" };

/** What the world looks like at the moment of the intent. */
export interface ViewFacts {
  model: Pick<WorldModel, "buildings" | "townHall" | "postOffice" | "freshness" | "now">;
  /** The districts in use, as wayfinding sees them (one for a single settlement). */
  districts: readonly DistrictPlace[];
  /** Where every building stands: the focus ring moves by it. */
  plan: TownPlan;
  /** The viewer's building template: the words for places. */
  rooms: RoomWording;
}

export interface ViewStep {
  view: View;
  /** The sentence for the polite region; null says nothing, "" clears it. */
  say: string | null;
  /** An overlay of the page the view asks closed: the text view, or build mode. */
  close: "text" | "build" | null;
  /** The key or the Escape was the view's (the page stops its default). */
  handled: boolean;
}

/** The district the view is in, if the town is a region and the district is still in use. */
export const hereOf = (view: Pick<View, "district">, districts: readonly DistrictPlace[]): DistrictPlace | null => (isRegion(districts) ? (districts.find((d) => d.id === view.district) ?? null) : null);

/** The building the view is inside, or null. */
export const insideOf = <B extends { slug: string }>(view: Pick<View, "entered">, buildings: readonly B[]): B | null => buildings.find((b) => b.slug === view.entered) ?? null;

/** The place the view is at, as the breadcrumb and wayfinding read it. */
export const placeOf = (view: View, districts: readonly DistrictPlace[]): Place => {
  const inside = view.entered;
  return { district: hereOf(view, districts)?.id ?? null, building: inside, room: inside ? view.zoomed : null };
};

const same = (view: View, next: View): ViewStep => ({ view: next, say: null, close: null, handled: view !== next });
const step = (view: View, say: string | null, handled = true): ViewStep => ({ view, say, close: null, handled });

const districtOfBuilding = (districts: readonly DistrictPlace[], slug: string): string | null => (isRegion(districts) ? (districts.find((d) => d.buildings.some((b) => b.slug === slug))?.id ?? null) : null);

const everyAgent = (model: ViewFacts["model"]): AgentPlacement[] => [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice];
export const agentNameOf = (model: ViewFacts["model"], key: string): string => everyAgent(model).find((a) => a.key === key)?.displayName ?? key;

/** What the focus ring says about a building: its counts and its lead, or that it is archived. */
function describeBuilding(model: ViewFacts["model"], index: number): string {
  const b = model.buildings[index];
  if (!b) return "";
  if (b.archived) return `${b.name} (${b.key}), archived: ${archivedWords(b.archivedAt, model.now)}${b.archivedBy ? ` by ${b.archivedBy}` : ""}. ${countsLine(b.counts)}. Enter to look inside.`;
  const lead = b.agents.find((a) => a.key === b.lead.id && a.presence === "real");
  return `${b.name} (${b.key}). ${countsLine(b.counts)}. Lead ${b.lead.displayName}, ${lead ? laneWords(lead.laneStatus, model.freshness) : "not in the building"}. Enter to go inside.`;
}

const describeDistrict = (d: DistrictPlace): string => `${d.name}. ${summaryWords(summarise(d.buildings))}`;

const selectedAgentOf = (view: View): string | null => (view.selection.selected?.kind === "agent" ? view.selection.selected.key : null);

/** The next view and what to say for an intent. The view object is unchanged (same identity) when nothing applies. */
export function stepView(view: View, intent: ViewIntent, facts: ViewFacts): ViewStep {
  const { model, districts, plan, rooms } = facts;
  const buildings = model.buildings;
  const inside = insideOf(view, buildings);
  const here = hereOf(view, districts);
  const roomSummaryOf = (kind: RoomKind) => (inside ? roomSummary(inside, kind, (a: AgentPlacement) => laneWords(a.laneStatus, model.freshness), rooms) : "");
  const cleared = { selection: NO_SELECTION, card: false, following: null } as const;

  const enter = (slug: string): ViewStep => {
    const index = buildings.findIndex((b) => b.slug === slug);
    const b = buildings[index];
    if (!b) return same(view, view);
    return step(
      { ...view, entered: slug, district: districtOfBuilding(districts, slug), focused: index, room: null, zoomed: null, ...cleared },
      `Inside ${b.name} (${b.key}). ${b.agents.filter((a) => a.presence === "real").length} agents here. Escape or Backspace returns to the town.`,
    );
  };
  const back = (): ViewStep =>
    step(
      { ...view, entered: null, room: null, zoomed: null, ...cleared },
      // In a region a building steps out to its district; Escape once more shows the region.
      here ? `${describeDistrict(here)} Escape shows the region.` : `The town. ${describeBuilding(model, view.focused)}`,
    );
  const go = (place: Place, agent?: string): ViewStep => {
    const b = place.building ? buildings.find((x) => x.slug === place.building) : undefined;
    const d = isRegion(districts) ? (districts.find((x) => x.id === place.district) ?? null) : null;
    const next: View = {
      ...view,
      // Going somewhere by name ends a walk there.
      walk: null,
      district: b ? districtOfBuilding(districts, b.slug) : (d?.id ?? null),
      entered: b?.slug ?? null,
      room: b ? place.room : null,
      zoomed: b ? place.room : null,
      // The agent to land beside: in its building, or in the town (the town hall's agents, the postman).
      selection: { hover: null, selected: agent ? { kind: "agent", key: agent } : null },
      card: false,
      following: null,
    };
    if (b) return step({ ...next, focused: buildings.indexOf(b) }, `Inside ${b.name} (${b.key})${place.room ? `, ${roomName(b, place.room, rooms)}` : ""}. Escape steps back out.`);
    if (d) return step({ ...next, ringVisible: false }, `${describeDistrict(d)} Escape shows the region.`);
    return step(next, isRegion(districts) ? `The region: ${districts.map((x) => x.name).join(", ")}.` : "The town.");
  };
  const focusRoom = (kind: RoomKind, zoom: boolean): ViewStep => step({ ...view, room: kind, zoomed: zoom ? kind : view.zoomed }, zoom ? `${zoomedTo(roomSummaryOf(kind), kind, rooms)} Escape goes back to the building.` : roomSummaryOf(kind));
  const follow = (key: string | null): ViewStep => step({ ...view, following: key }, key ? `Following ${agentNameOf(model, key)}. Escape, Shift+F or a drag stops following.` : "Stopped following.");
  const openCard = (): ViewStep => step({ ...view, card: true }, null);

  switch (intent.type) {
    case "enter":
      return enter(intent.slug);
    case "back":
      return back();
    case "go":
      return go(intent.place, intent.agent);
    case "jump": {
      const { entry } = intent;
      const went = go(entry.place, entry.agent);
      if (entry.agent && !entry.place.building) {
        // A figure outside the buildings: the camera lands close beside it, selected; Enter opens its card.
        return step({ ...went.view, flight: { id: view.flight.id + 1, anchor: `a:town:${entry.agent}`, reach: 5 } }, `${entry.label}. ${entry.detail} Enter opens its card.`);
      }
      if (entry.civic) return step({ ...went.view, flight: { id: view.flight.id + 1, anchor: `c:${entry.civic}` } }, `${entry.label}. ${entry.detail}`);
      return went;
    }
    case "jumpActive":
      return same(view, intent.building === view.likely ? view : { ...view, likely: intent.building });
    case "hover":
      // The same building again changes nothing (a Tab back onto its sign): no render.
      if (intent.index === null || (view.focused === intent.index && view.ringVisible)) return same(view, view);
      return same(view, { ...view, focused: intent.index, ringVisible: true });
    case "focusRoom":
      return focusRoom(intent.kind, intent.zoom);
    case "pick": {
      const target = intent.target?.kind === "prop" ? null : intent.target;
      if (intent.hover) return same(view, { ...view, selection: { ...view.selection, hover: target } });
      if (target?.kind === "room") return focusRoom(target.room, true);
      // A click on an agent selects it and opens its card; a click elsewhere (or on the selected object) clears.
      if (target?.kind === "agent") return same(view, { ...view, selection: { hover: view.selection.hover, selected: target }, card: true });
      return same(view, { ...view, card: false, selection: { hover: view.selection.hover, selected: target && JSON.stringify(target) !== JSON.stringify(view.selection.selected) ? target : null } });
    }
    case "follow":
      return follow(intent.key);
    case "followed": {
      /* The followed figure walked somewhere else: the level follows it; the selection and the card stay. */
      const b = intent.building ? buildings.find((x) => x.slug === intent.building) : undefined;
      const next: View = { ...view, entered: b?.slug ?? null, room: null, zoomed: null };
      if (b) {
        next.district = districtOfBuilding(districts, b.slug);
        next.focused = buildings.indexOf(b);
      }
      return step(next, view.following ? `${agentNameOf(model, view.following)} ${b ? `walked into ${b.name} (${b.key})` : "is walking through the town"}.` : "");
    }
    case "followStopped":
      return step({ ...view, following: null }, "Stopped following.");
    case "startWalk":
      // A walk takes the camera: a follow ends and the agent card closes.
      return step(
        { ...view, walk: { entered: view.entered, room: view.room, zoomed: view.zoomed, district: view.district }, ...cleared, ringVisible: false },
        "Walking. W A S D or the arrow keys move you, Shift hurries, drag to look around. Walk through a door to go in or out. Escape stops.",
      );
    case "stopWalk": {
      /* Back to the level the walk began on (a building gone meanwhile: the town). */
      const was = view.walk;
      const next: View = { ...view, walk: null };
      if (was) {
        next.entered = was.entered && buildings.some((b) => b.slug === was.entered) ? was.entered : null;
        next.room = was.room;
        next.zoomed = was.zoomed;
        next.district = was.district;
      }
      return step(next, "Walking stopped.");
    }
    case "closeCard":
      return same(view, { ...view, card: false });
    case "escape": {
      // The innermost thing first: the walk, build mode, the text view, the follow, the card, the selection, the
      // zoomed room, the building, the district.
      if (view.walk) return stepView(view, { type: "stopWalk" }, facts);
      if (intent.open.build) return { view, say: null, close: "build", handled: true };
      if (intent.open.text) return { view, say: null, close: "text", handled: true };
      if (view.following) return follow(null);
      if (view.card) return same(view, { ...view, card: false });
      if (view.selection.selected) return same(view, { ...view, selection: { ...view.selection, selected: null } });
      if (view.zoomed) return step({ ...view, zoomed: null }, `Inside ${inside?.name ?? "the building"}. Arrow keys move between ${rooms === "classic" ? "rooms" : "the halls"}.`);
      if (view.entered) return back();
      if (here) return go(stepOut({ district: here.id, building: null, room: null })!);
      return same(view, view);
    }
    case "key": {
      const { key, onCanvas } = intent;
      const selectedAgent = selectedAgentOf(view);
      if (inside) {
        // Inside a building: arrow keys move the focus ring between rooms, Enter zooms to the focused room.
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
          const template = buildingTemplate(inside, rooms);
          return focusRoom(view.room ? roomNeighbor(template, view.room, key) : firstRoom(template), false);
        }
        if (key === "Enter" && onCanvas) {
          // Enter on a selected agent opens its card; else it zooms to the focused room.
          if (selectedAgent && !view.card) return openCard();
          return focusRoom(view.room ?? firstRoom(buildingTemplate(inside, rooms)), true);
        }
        return same(view, view);
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
        // The ring moves by where the buildings stand, not by their order in the list.
        const next = view.ringVisible ? moveFocus(plan, buildings.map((b) => b.slug), view.focused, key) : view.focused;
        return step({ ...view, focused: next, ringVisible: true }, describeBuilding(model, next));
      }
      if (key === "Enter" && onCanvas) {
        // Enter on a selected town figure (after a jump to it) opens its card; else it enters the focused building.
        if (selectedAgent && !view.card) return openCard();
        const b = buildings[view.focused];
        return b ? enter(b.slug) : step(view, null);
      }
      return same(view, view);
    }
    case "camera":
      return same(view, { ...view, action: { id: view.action.id + 1, type: intent.action } });
    case "settle":
      // A district that emptied or a town that shrank back to one settlement has no district level left.
      return same(view, view.district !== null && here === null ? { ...view, district: null } : view);
  }
}
