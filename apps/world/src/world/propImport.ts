/* One done prop ticket into the town (spec addendum B): read its prop from the comments, add it to the catalogue with
   the ticket as provenance, and place it where the request named (a room of the ticket's building, or an agent's
   desk), else in storage, else in the lobby. Pure: the caller fetches the ticket and its comments once and commits
   the returned document as one revision. An invalid prop becomes an error object in the room the request named. */
import type { CommentOut } from "@crewhub/loops-client";
import type { Definitions } from "@crewhub/world-engine";
import {
  applyEdit,
  createCatalogue,
  extractPropRequest,
  importedPropId,
  placeFor,
  type InvalidPropRequest,
  type PlacedProp,
  type PropTicket,
  type RoomKind,
  type TownContext,
  type TownDocument,
  type WorldModel,
} from "@crewhub/world-model";
import { buildingTemplate, hallOf, type BuildingPlan } from "./buildingTemplate.ts";
import { freeCellIn, placementDefinitions, resolveBuildingPlacements } from "./placements.ts";

/** A failed request with the room its error object stands in. */
export interface InvalidRequest extends InvalidPropRequest {
  room: RoomKind;
}

export type PropImport =
  | { ok: true; doc: TownDocument; propId: string; placementId: string | null; note: string | null }
  | { ok: false; invalid: InvalidRequest };

export interface PropImportInput {
  doc: TownDocument;
  context: TownContext;
  builtins: Definitions;
  model: WorldModel;
  ticket: PropTicket;
  comments: readonly CommentOut[];
  /** A fresh UUID for the placement. */
  placementId: string;
  /** The building template the placement is checked against (the viewer's; the classic one when left out). */
  buildingPlan?: BuildingPlan;
}

export function importPropRequest(input: PropImportInput): PropImport {
  const { ticket, model, context } = input;
  const place = placeFor(ticket, model);
  const invalid = (error: string): PropImport => ({ ok: false, invalid: { ticketKey: ticket.key, slug: place.at.building, room: place.at.room, error } });
  const extracted = extractPropRequest(ticket, input.comments);
  if (!extracted.ok) return invalid(extracted.error);
  const prop = { ...extracted.prop, id: importedPropId(input.doc, extracted.prop) };
  const added = applyEdit(input.doc, { type: "add-user-prop", prop }, context);
  if (!added.ok) return invalid(`prop ${ticket.key} is invalid: ${added.error}`);

  const placement = (at: PlacedProp["at"], cell: { x: number; z: number }): PlacedProp => ({
    id: input.placementId,
    propId: prop.id,
    at,
    cell,
    rotation: 0,
    ...(place.attachment ? { attachment: place.attachment } : {}),
  });
  let chosen: PlacedProp | null = null;
  let note = place.note;
  if (place.attachment) {
    // Footprint-free: it sits on the agent's desk wherever that agent works.
    chosen = placement(place.at, { x: 0, z: 0 });
  } else {
    const building = model.buildings.find((b) => b.slug === place.at.building);
    if (building) {
      const definitions = placementDefinitions(createCatalogue(input.builtins, added.doc).definitions);
      const template = buildingTemplate(building, input.buildingPlan);
      const rooms = resolveBuildingPlacements(added.doc, building.slug, template, definitions).rooms;
      for (const kind of [place.at.room, "storage", "lobby"] as const) {
        const hall = hallOf(template, kind);
        const room = hall ? rooms.get(hall) : undefined;
        const cell = room ? freeCellIn(room, definitions, prop.id) : null;
        if (!cell) continue;
        chosen = placement({ building: building.slug, room: kind }, cell);
        if (kind !== place.at.room) note = `the ${place.at.room.replace("-", " ")} had no free cell; it stands in the ${kind.replace("-", " ")}`;
        break;
      }
      if (!chosen) note = "no room had a free cell; it waits in the catalogue under Mine";
    } else note = `the building ${place.at.building} is not in the town; it waits in the catalogue under Mine`;
  }
  if (!chosen) return { ok: true, doc: added.doc, propId: prop.id, placementId: null, note };
  const placed = applyEdit(added.doc, { type: "place", placement: chosen }, context);
  if (!placed.ok) return { ok: true, doc: added.doc, propId: prop.id, placementId: null, note: placed.error };
  return { ok: true, doc: placed.doc, propId: prop.id, placementId: chosen.id, note };
}
