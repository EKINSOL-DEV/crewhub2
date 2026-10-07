/* Build mode's runtime: the town document (loaded from IndexedDB at start, committed on every edit), its catalogue,
   and the prop-request flow. When the projection lists a newly done prop ticket, its ticket and comments are fetched
   once, and the prop is imported and placed as one revision (world/propImport.ts); an invalid prop becomes an error
   object. Placements made here or imported are marked fresh so the scene materialises them. */
import { useSyncExternalStore } from "react";
import {
  applyEdit,
  builtinIds,
  createCatalogue,
  importTownDocument,
  propRequestsFromFacts,
  type Catalogue,
  type TownContext,
  type TownDocument,
  type TownEdit,
} from "@crewhub/world-model";
import { definitions } from "../world/definitions";
import { placementDefinitions } from "../world/placements";
import { importPropRequest, type InvalidRequest } from "../world/propImport";
import { allocationEdit, carryAllocations } from "../world/settlement";
import { styleRegistry } from "../world/style";
import { createTownStore, seededTown, type TownStore } from "./townStore";
import { SCENARIO, STRESS, TOWN_KEY, worldRuntime } from "./world";

export interface TownState {
  doc: TownDocument;
  catalogue: Catalogue;
  /** The catalogue's engine records plus the room templates' furniture and door markers. */
  definitions: ReturnType<typeof placementDefinitions>;
  canUndo: boolean;
  canRedo: boolean;
  storage: "indexeddb" | "memory";
  storageNote: string | null;
  loaded: boolean;
  /** Done prop tickets whose prop is invalid, while they are still done and not imported. */
  invalid: InvalidRequest[];
}

export type EditOutcome = { ok: true } | { ok: false; error: string };

class TownRuntime {
  readonly context: TownContext = { knownStyles: styleRegistry.listStyles().map((s) => s.id), builtinIds: builtinIds(definitions) };
  readonly store: TownStore;
  /** Placement ids to materialise the next time the scene shows them. */
  readonly fresh = new Set<string>();
  #state: TownState;
  #listeners = new Set<() => void>();
  #tried = new Set<string>();
  #invalid = new Map<string, InvalidRequest>();
  #queue: Promise<void> = Promise.resolve();
  #announce: (text: string) => void = () => {};

  constructor() {
    // A scenario's town starts with its zones' looks (Studio's four districts); the stress fixtures start empty.
    const initial = STRESS ? undefined : seededTown(SCENARIO.townZones, this.context);
    // Lots are facts of the town, not edits: an undo or redo carries them into the revision it restores.
    this.store = createTownStore({ context: this.context, name: TOWN_KEY, carry: carryAllocations, ...(initial ? { initial } : {}) });
    this.#state = this.#derive();
    this.store.subscribe(() => {
      this.#refresh();
      // An imported town may lack a project's lot: it gets one at once. An undo never does (see `carryAllocations`).
      this.#allocate();
    });
    void this.store.load().then(() => {
      this.#refresh();
      worldRuntime().subscribe(() => {
        this.#allocate();
        this.#checkRequests();
      });
      this.#allocate();
      this.#checkRequests();
    });
  }

  get state(): TownState {
    return this.#state;
  }

  /** Where build mode's messages go (the polite status line). */
  onAnnounce(announce: (text: string) => void) {
    this.#announce = announce;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Applies one edit to the current document and commits it; a refused edit changes nothing. */
  edit(edit: TownEdit): EditOutcome {
    const result = applyEdit(this.store.state.doc, edit, this.context);
    if (!result.ok) return result;
    if (edit.type === "place") this.fresh.add(edit.placement.id);
    void this.store.commit(result.doc);
    return { ok: true };
  }

  /** Several edits as one revision (one undo step). */
  editAll(edits: TownEdit[]): EditOutcome {
    let doc = this.store.state.doc;
    for (const edit of edits) {
      const result = applyEdit(doc, edit, this.context);
      if (!result.ok) return result;
      doc = result.doc;
    }
    for (const edit of edits) if (edit.type === "place") this.fresh.add(edit.placement.id);
    void this.store.commit(doc);
    return { ok: true };
  }

  undo() {
    void this.store.undo();
  }
  redo() {
    void this.store.redo();
  }

  /** A town JSON file: on success it becomes the next revision; on failure nothing changes. */
  importText(text: string): EditOutcome {
    const result = importTownDocument(text, this.store.state.doc, this.context);
    if (!result.ok) return { ok: false, error: result.error };
    void this.store.commit(result.doc);
    return { ok: true };
  }

  /**
   * Gives every project the world sees for the first time its lot (`settlement.ts`), in the current revision: where
   * a building stands is the world's record, not a person's edit, so it adds no undo step, and an undo past this
   * point keeps the lot (the store carries allocations forward).
   */
  #allocate() {
    if (!this.store.state.loaded) return;
    const buildings = worldRuntime().state.model.buildings.map((b) => ({ slug: b.slug, zoneId: b.zoneId }));
    if (!allocationEdit(this.store.state.doc, buildings)) return;
    void this.store.amend((doc) => {
      const edit = allocationEdit(doc, buildings);
      const result = edit && applyEdit(doc, edit, this.context);
      return result?.ok ? result.doc : null;
    });
  }

  #refresh() {
    this.#state = this.#derive();
    for (const listener of this.#listeners) listener();
  }

  #derive(): TownState {
    const s = this.store.state;
    const catalogue = createCatalogue(definitions, s.doc);
    return {
      doc: s.doc,
      catalogue,
      definitions: placementDefinitions(catalogue.definitions),
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      storage: s.storage,
      storageNote: s.storageNote,
      loaded: s.loaded,
      invalid: this.#visibleInvalid(),
    };
  }

  /** Error objects stand only while their ticket is still a done, unimported prop request (a seek can undo it). */
  #visibleInvalid(): InvalidRequest[] {
    if (!this.#invalid.size) return [];
    const listed = new Set(propRequestsFromFacts(worldRuntime().projection.facts, this.store.state.doc).map((r) => r.ticketKey));
    return [...this.#invalid.values()].filter((r) => listed.has(r.ticketKey));
  }

  #checkRequests() {
    if (!this.store.state.loaded) return;
    const world = worldRuntime();
    const requests = propRequestsFromFacts(world.projection.facts, this.store.state.doc);
    const visible = this.#visibleInvalid();
    if (visible.length !== this.#state.invalid.length || visible.some((r, i) => r !== this.#state.invalid[i])) this.#refresh();
    for (const request of requests) {
      if (this.#tried.has(request.ticketKey)) continue;
      this.#tried.add(request.ticketKey);
      // One at a time, each on the latest document.
      this.#queue = this.#queue.then(() => this.#import(request.ticketKey)).catch((e: unknown) => console.warn("Prop request failed", e));
    }
  }

  async #import(ticketKey: string) {
    const world = worldRuntime();
    const ticket = await world.source.getTicket(ticketKey);
    // A ticket turned down while the read was on its way (Done, then rejected) brings no prop.
    if (!ticket || ticket.resolution === "rejected") return;
    const comments = await world.source.getComments(ticketKey);
    const result = importPropRequest({
      doc: this.store.state.doc,
      context: this.context,
      builtins: definitions,
      model: world.state.model,
      ticket,
      comments,
      placementId: crypto.randomUUID(),
    });
    if (!result.ok) {
      this.#invalid.set(ticketKey, result.invalid);
      this.#refresh();
      this.#announce(`${result.invalid.error}. An error crate stands in its place.`);
      return;
    }
    this.#invalid.delete(ticketKey);
    if (result.placementId) this.fresh.add(result.placementId);
    await this.store.commit(result.doc);
    const name = createCatalogue(definitions, result.doc).get(result.propId)?.name ?? result.propId;
    this.#announce(`${ticketKey} is done: ${name} joined the catalogue${result.placementId ? " and appeared in the town" : ""}.${result.note ? ` Note: ${result.note}.` : ""}`);
  }
}

let runtime: TownRuntime | null = null;
export function townRuntime(): TownRuntime {
  runtime ??= new TownRuntime();
  return runtime;
}

export function useTown(): TownState {
  const town = townRuntime();
  return useSyncExternalStore(town.subscribe, () => town.state);
}
