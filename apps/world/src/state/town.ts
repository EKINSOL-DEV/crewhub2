/* Build mode's runtime: the town document (loaded from its store at start, committed on every edit), its catalogue,
   and the prop-request flow. When the projection lists a newly done prop ticket, its ticket and comments are fetched
   once, and the prop is imported and placed as one revision (world/propImport.ts); an invalid prop becomes an error
   object. Placements made here or imported are marked fresh so the scene materialises them.

   A runtime is built from its config (state/runtimes.ts builds the page's one): the world runtime it follows, the town
   context, the store (the browser's, or the host's in live mode: state/hostTown.ts) and the building plan. So a node
   test builds one over a demo world and a store in memory. */
import {
  applyEdit,
  createCatalogue,
  importTownDocument,
  propRequestsFromFacts,
  townChanges,
  type Catalogue,
  type TownContext,
  type TownDocument,
  type TownEdit,
} from "@crewhub/world-model";
import type { BuildingPlan } from "../world/buildingTemplate.ts";
import { definitions } from "../world/definitions.ts";
import { placementDefinitions } from "../world/placements.ts";
import { importPropRequest, type InvalidRequest } from "../world/propImport.ts";
import { allocationEdit } from "../world/settlement.ts";
import { createPropQueue } from "./propQueue.ts";
import type { TownStore } from "./townStore.ts";
import type { WorldRuntime } from "./world.ts";

export interface TownState {
  doc: TownDocument;
  catalogue: Catalogue;
  /** The catalogue's engine records plus the room templates' furniture and door markers. */
  definitions: ReturnType<typeof placementDefinitions>;
  canUndo: boolean;
  canRedo: boolean;
  storage: "host" | "indexeddb" | "memory";
  storageNote: string | null;
  loaded: boolean;
  /** The host's revision this browser is on (round 20), null in demo mode and while the host is away. */
  hostRev: number | null;
  /** Done prop tickets whose prop is invalid, while they are still done and not imported. */
  invalid: InvalidRequest[];
}

export type EditOutcome = { ok: true } | { ok: false; error: string };

export interface TownRuntimeConfig {
  /** The world the town follows: its model gives every project a lot, its facts the prop requests. */
  world: Pick<WorldRuntime, "state" | "subscribe" | "projection" | "source">;
  /** The styles and built-in props a town document may name. */
  context: TownContext;
  /** Where the town is kept: the browser's store, or the host's (live). */
  store: TownStore;
  /** The building template in force now (an imported prop is placed in it). */
  buildingPlan: () => BuildingPlan;
  /** A new placement id for an imported prop. */
  newId: () => string;
}

/** Several edits as one revision (one undo step): all of them apply, or none, and the first refusal is the answer. */
function applyEdits(doc: TownDocument, edits: readonly TownEdit[], context: TownContext): { ok: true; doc: TownDocument } | { ok: false; error: string } {
  let next = doc;
  for (const edit of edits) {
    const result = applyEdit(next, edit, context);
    if (!result.ok) return result;
    next = result.doc;
  }
  return { ok: true, doc: next };
}

class TownRuntime {
  readonly context: TownContext;
  readonly store: TownStore;
  /** Placement ids to materialise the next time the scene shows them. */
  readonly fresh = new Set<string>();
  #state: TownState;
  #listeners = new Set<() => void>();
  #invalid = new Map<string, InvalidRequest>();
  /** Done prop requests, imported one at a time; a failed read is tried again after a wait (round 53, review S3). */
  readonly #props = createPropQueue({ run: (ticketKey) => this.#import(ticketKey), again: () => this.#checkRequests() });
  #announce: (text: string) => void = () => {};
  readonly #world: TownRuntimeConfig["world"];
  readonly #buildingPlan: () => BuildingPlan;
  readonly #newId: () => string;

  constructor(config: TownRuntimeConfig) {
    this.context = config.context;
    this.store = config.store;
    this.#world = config.world;
    this.#buildingPlan = config.buildingPlan;
    this.#newId = config.newId;
    this.#state = this.#derive();
    this.store.subscribe(() => {
      this.#refresh();
      // An imported town may lack a project's lot: it gets one at once. An undo never does (see `carryAllocations`).
      this.#allocate();
    });
    void this.store.load().then(() => {
      this.#refresh();
      this.#world.subscribe(() => {
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
    const result = applyEdits(this.store.state.doc, edits, this.context);
    if (!result.ok) return result;
    for (const edit of edits) if (edit.type === "place") this.fresh.add(edit.placement.id);
    void this.store.commit(result.doc);
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
   * What a town file or a backup's document would change (round 21): the candidate as the next revision, and the
   * changes in plain words, without touching the town. `text` is a file's JSON; `document` a backup's parsed town.
   */
  previewRestore(source: { text: string } | { document: unknown }): { ok: true; doc: TownDocument; changes: string[] } | { ok: false; error: string } {
    const json = "text" in source ? source.text : JSON.stringify(source.document);
    const result = importTownDocument(json, this.store.state.doc, this.context);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, doc: result.doc, changes: townChanges(this.store.state.doc, result.doc) };
  }

  /** Makes a previewed candidate the next revision: never silent, always undoable (Undo goes back to the town before it). */
  applyRestore(doc: TownDocument): void {
    void this.store.commit(doc);
  }

  /**
   * Gives every project the world sees for the first time its lot (`settlement.ts`), in the current revision: where
   * a building stands is the world's record, not a person's edit, so it adds no undo step, and an undo past this
   * point keeps the lot (the store carries allocations forward).
   */
  #allocate() {
    if (!this.store.state.loaded) return;
    const buildings = this.#world.state.model.buildings.map((b) => ({ slug: b.slug, zoneId: b.zoneId }));
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
      hostRev: (this.store as { rev?: number | null }).rev ?? null,
      invalid: this.#visibleInvalid(),
    };
  }

  /** Error objects stand only while their ticket is still a done, unimported prop request (a seek can undo it). */
  #visibleInvalid(): InvalidRequest[] {
    if (!this.#invalid.size) return [];
    const listed = new Set(propRequestsFromFacts(this.#world.projection.facts, this.store.state.doc).map((r) => r.ticketKey));
    return [...this.#invalid.values()].filter((r) => listed.has(r.ticketKey));
  }

  #checkRequests() {
    if (!this.store.state.loaded) return;
    const world = this.#world;
    const requests = propRequestsFromFacts(world.projection.facts, this.store.state.doc);
    const visible = this.#visibleInvalid();
    // The crates shown change by count or by the request at any place (never by equal values): publish them.
    const shown = this.#state.invalid;
    if (visible.length !== shown.length || visible.some((r, i) => r !== shown[i])) this.#refresh();
    this.#props.offer(requests.map((r) => r.ticketKey));
  }

  async #import(ticketKey: string) {
    const world = this.#world;
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
      placementId: this.#newId(),
      buildingPlan: this.#buildingPlan(),
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

export type { TownRuntime };

export function createTownRuntime(config: TownRuntimeConfig): TownRuntime {
  return new TownRuntime(config);
}
