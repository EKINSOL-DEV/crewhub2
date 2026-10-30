/* Build mode (plan 4.7 item 3, plan 6): one toggle, a chosen catalogue prop that follows the pointer or the arrow
   keys as a ghost, and a selected placed prop to turn, move or delete. Every placement goes through the engine's
   footprint rules (world/placements.ts `checkGhost`) before the edit is applied; the ghost says in words whether it
   fits. Edits commit to the town document through the town runtime, so undo and reload follow. */
import { useCallback, useMemo, useState } from "react";
import type { Cell, Rotation } from "@crewhub/world-engine";
import type { Building, PlacedProp, RoomKind } from "@crewhub/world-model";
import { buildingTemplate } from "../world/buildingTemplate";
import { useBuildingPlan } from "./buildingPlan";
import type { Pick } from "../world/buildingView";
import { cellAt, checkGhost, freeCellIn, resolveBuildingPlacements, roomSite, type GhostCheck } from "../world/placements";
import type { Ghost } from "../world/propLayer";
import { townRuntime, type TownState } from "./town";

export interface Spot {
  room: RoomKind;
  cell: Cell;
}

export interface BuildState {
  on: boolean;
  /** The catalogue prop chosen in the palette, placed with a click or Enter. */
  propId: string | null;
  rotation: Rotation;
  /** Where the chosen prop's ghost stands. */
  spot: Spot | null;
  /** The selected placement (a click on a placed prop). */
  selected: string | null;
  /** While the selected prop is dragged: where it would land. */
  drag: Spot | null;
  /** The last thing build mode said: a refusal, a confirmation. */
  message: string;
}

const OFF: BuildState = { on: false, propId: null, rotation: 0, spot: null, selected: null, drag: null, message: "" };
const ARROWS: Record<string, Cell> = { ArrowLeft: { x: -1, z: 0 }, ArrowRight: { x: 1, z: 0 }, ArrowUp: { x: 0, z: -1 }, ArrowDown: { x: 0, z: 1 } };

export interface BuildMode {
  state: BuildState;
  /** The ghost to draw, with its verdict, or null. */
  ghost: Ghost | null;
  check: GhostCheck | null;
  selectedPlacement: PlacedProp | null;
  toggle(): void;
  choose(propId: string | null): void;
  pointer(kind: "move" | "click" | "drag" | "drop", at: Spot | null, pick: Pick | null): void;
  /** A key while build mode is on; true when build mode used it. */
  key(event: KeyboardEvent): boolean;
  rotate(): void;
  remove(): void;
  place(): void;
}

export function useBuildMode(town: TownState, inside: Building | null, focusedRoom: RoomKind | null, announce: (text: string) => void): BuildMode {
  const [state, setState] = useState<BuildState>(OFF);
  const buildingPlan = useBuildingPlan();
  const template = useMemo(() => (inside ? buildingTemplate(inside, buildingPlan) : null), [buildingPlan, inside]);
  const selectedPlacement = state.selected ? (town.doc.placements.find((p) => p.id === state.selected) ?? null) : null;
  const say = useCallback(
    (message: string) => {
      setState((s) => ({ ...s, message }));
      announce(message);
    },
    [announce],
  );
  const nameOf = useCallback((propId: string) => town.catalogue.get(propId)?.name ?? propId, [town.catalogue]);

  const probe = useMemo(() => {
    if (!state.on || !inside || !template) return null;
    if (state.drag && selectedPlacement) return { id: selectedPlacement.id, propId: selectedPlacement.propId, room: state.drag.room, cell: state.drag.cell, rotation: selectedPlacement.rotation };
    if (state.propId && state.spot) return { id: "new-placement", propId: state.propId, room: state.spot.room, cell: state.spot.cell, rotation: state.rotation };
    return null;
  }, [inside, selectedPlacement, state.drag, state.on, state.propId, state.rotation, state.spot, template]);
  const check = useMemo(
    () => (probe && inside && template ? checkGhost(town.doc, inside.slug, template, town.definitions, probe) : null),
    [inside, probe, template, town.definitions, town.doc],
  );
  const ghost: Ghost | null = probe && check ? { id: probe.id === "new-placement" ? null : probe.id, propId: probe.propId, room: probe.room, cell: probe.cell, rotation: probe.rotation, valid: check.ok } : null;

  const toggle = useCallback(() => {
    setState((s) => (s.on ? OFF : { ...OFF, on: true }));
    announce(state.on ? "Build mode off." : "Build mode on. Choose a prop in the palette, then click a floor or use the arrow keys and Enter to place it.");
  }, [announce, state.on]);

  /** The first cell where a prop fits in the focused room (or the lobby), for keyboard placement. */
  const startSpot = useCallback(
    (propId: string, rotation: Rotation): Spot | null => {
      if (!inside || !template) return null;
      const rooms = resolveBuildingPlacements(town.doc, inside.slug, template, town.definitions).rooms;
      for (const kind of [focusedRoom, "lobby" as const]) {
        const room = kind ? rooms.get(kind) : undefined;
        const cell = room ? freeCellIn(room, town.definitions, propId, rotation) : null;
        if (room && cell) return { room: room.site.room, cell };
      }
      const room = roomSite(template, focusedRoom ?? "lobby");
      return room ? { room: room.room, cell: { x: 0, z: 0 } } : null;
    },
    [focusedRoom, inside, template, town.definitions, town.doc],
  );

  const choose = useCallback(
    (propId: string | null) => {
      setState((s) => ({ ...s, propId, selected: null, drag: null, spot: propId ? startSpot(propId, s.rotation) : null, message: "" }));
      if (propId) announce(`${nameOf(propId)} chosen. ${inside ? "Move the pointer over a floor or use the arrow keys, R turns it, Enter or a click places it." : "Enter a building to place it."}`);
    },
    [announce, inside, nameOf, startSpot],
  );

  const placeAt = useCallback(
    (spot: Spot | null) => {
      if (!inside || !template || !state.propId || !spot) return;
      const verdict = checkGhost(town.doc, inside.slug, template, town.definitions, { id: "new-placement", propId: state.propId, room: spot.room, cell: spot.cell, rotation: state.rotation });
      if (!verdict.ok) {
        say(`Can't place ${nameOf(state.propId)} here: ${verdict.reason}`);
        return;
      }
      const id = crypto.randomUUID();
      const result = townRuntime().edit({
        type: "place",
        placement: { id, propId: state.propId, at: { building: inside.slug, room: spot.room }, cell: { ...spot.cell }, rotation: state.rotation },
      });
      if (!result.ok) {
        say(result.error);
        return;
      }
      // The new prop is selected: arrow keys, R and Delete adjust it; choose again to place another.
      setState((s) => ({ ...s, propId: null, spot: null, selected: id }));
      say(`Placed ${nameOf(state.propId)} in the ${spot.room.replace("-", " ")}. It is selected: arrow keys move it, R turns it.`);
    },
    [inside, nameOf, say, state.propId, state.rotation, template, town.definitions, town.doc],
  );
  const place = useCallback(() => placeAt(state.spot), [placeAt, state.spot]);

  /** Moves or turns the selected placement after the engine accepted the new pose. */
  const repose = useCallback(
    (p: PlacedProp, room: RoomKind, cell: Cell, rotation: Rotation, done: string) => {
      if (!inside || !template || "town" in p.at) return;
      const verdict = checkGhost(town.doc, inside.slug, template, town.definitions, { id: p.id, propId: p.propId, room, cell, rotation });
      if (!verdict.ok) {
        say(`Can't: ${verdict.reason}`);
        return;
      }
      const edits =
        rotation !== p.rotation
          ? [{ type: "rotate" as const, id: p.id, rotation }]
          : [{ type: "move" as const, id: p.id, cell, ...(room !== p.at.room ? { at: { building: inside.slug, room } } : {}) }];
      const result = townRuntime().editAll(edits);
      say(result.ok ? done : result.error);
    },
    [inside, say, template, town.definitions, town.doc],
  );

  const rotate = useCallback(() => {
    const next = (r: Rotation) => ((r + 1) % 4) as Rotation;
    if (selectedPlacement && !("town" in selectedPlacement.at)) {
      repose(selectedPlacement, selectedPlacement.at.room, selectedPlacement.cell, next(selectedPlacement.rotation), `Turned ${nameOf(selectedPlacement.propId)}.`);
      return;
    }
    if (state.propId) setState((s) => ({ ...s, rotation: next(s.rotation) }));
  }, [nameOf, repose, selectedPlacement, state.propId]);

  const remove = useCallback(() => {
    if (!selectedPlacement) return;
    const result = townRuntime().edit({ type: "delete", id: selectedPlacement.id });
    setState((s) => ({ ...s, selected: null, drag: null }));
    say(result.ok ? `Removed ${nameOf(selectedPlacement.propId)}. Undo brings it back.` : result.error);
  }, [nameOf, say, selectedPlacement]);

  const pointer = useCallback(
    (kind: "move" | "click" | "drag" | "drop", at: Spot | null, pick: Pick | null) => {
      if (!state.on) return;
      if (kind === "move") {
        if (state.propId && at) setState((s) => (s.spot && s.spot.room === at.room && s.spot.cell.x === at.cell.x && s.spot.cell.z === at.cell.z ? s : { ...s, spot: at }));
        return;
      }
      if (kind === "drag") {
        if (at) setState((s) => ({ ...s, drag: at }));
        return;
      }
      if (kind === "drop") {
        const target = at ?? state.drag;
        setState((s) => ({ ...s, drag: null }));
        if (selectedPlacement && target && !("town" in selectedPlacement.at))
          repose(selectedPlacement, target.room, target.cell, selectedPlacement.rotation, `Moved ${nameOf(selectedPlacement.propId)}.`);
        return;
      }
      // A click: place the chosen prop, else select (or clear) a placed one.
      if (state.propId) {
        if (at) setState((s) => ({ ...s, spot: at }));
        placeAt(at ?? state.spot);
        return;
      }
      const id = pick?.kind === "prop" ? pick.id : null;
      setState((s) => ({ ...s, selected: id, drag: null }));
      const p = id ? town.doc.placements.find((x) => x.id === id) : null;
      if (p) announce(`${nameOf(p.propId)} selected. Arrow keys or a drag move it, R turns it, Delete removes it.`);
    },
    [announce, nameOf, placeAt, repose, selectedPlacement, state.drag, state.on, state.propId, state.spot, town.doc.placements],
  );

  const key = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!state.on) return false;
      if (e.key === "Escape") {
        if (state.drag) setState((s) => ({ ...s, drag: null }));
        else if (state.selected) setState((s) => ({ ...s, selected: null }));
        else if (state.propId) setState((s) => ({ ...s, propId: null, spot: null }));
        else return false;
        return true;
      }
      if (!inside) return false;
      if (e.key === "r" || e.key === "R") {
        rotate();
        return true;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedPlacement) {
        remove();
        return true;
      }
      const delta = ARROWS[e.key];
      if (delta) {
        if (selectedPlacement && !("town" in selectedPlacement.at)) {
          const cell = { x: selectedPlacement.cell.x + delta.x, z: selectedPlacement.cell.z + delta.z };
          repose(selectedPlacement, selectedPlacement.at.room, cell, selectedPlacement.rotation, `Moved ${nameOf(selectedPlacement.propId)} to cell ${cell.x}, ${cell.z}.`);
          return true;
        }
        if (state.propId) {
          const from = state.spot ?? startSpot(state.propId, state.rotation);
          if (!from || !template) return true;
          const site = roomSite(template, from.room)!;
          // Crossing a room edge carries the ghost into the neighbouring room.
          const next = cellAt(template, site.origin.x + from.cell.x + delta.x + 0.5, site.origin.z + from.cell.z + delta.z + 0.5);
          setState((s) => ({ ...s, spot: next ?? from }));
          return true;
        }
        return false;
      }
      // Enter places the chosen prop, also from its own palette button (any other button keeps its own Enter).
      const onChosen = e.target instanceof HTMLElement && e.target.closest("[data-prop-id]")?.getAttribute("data-prop-id") === state.propId;
      if (e.key === "Enter" && state.propId && (onChosen || !(e.target instanceof HTMLButtonElement))) {
        place();
        return true;
      }
      return false;
    },
    [inside, nameOf, place, remove, repose, rotate, selectedPlacement, startSpot, state.drag, state.on, state.propId, state.rotation, state.selected, state.spot, template],
  );

  return { state, ghost, check, selectedPlacement, toggle, choose, pointer, key, rotate, remove, place };
}
