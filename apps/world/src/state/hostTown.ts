/* The town kept by the world's host (spec addendum "the world database, first slice", round 20): a `TownStore` over the
   browser's own store (IndexedDB, the per-installation key) that reads the installation's town from the host on load,
   imports the browser's town once when the host has none (never over a town the host has), sends every commit, undo,
   redo and amend to the host with the revision it is based on, and takes the host's town when another browser wrote
   first or when the stream says the town changed. The browser's store follows every document, so a browser that loses
   the host keeps editing ("kept in this browser until the host is back") and offers its town again when the host
   answers. Pure of React and the DOM: the transport is injected, so a test drives it with a fake. */
import { validateTownDocument, type TownContext, type TownDocument } from "@crewhub/world-model";
import type { HostAnswer, HostTownOp } from "@crewhub/loops-client";
import type { TownStore, TownStoreState } from "./townStore.ts";

export interface HostTownTransport {
  /** `GET /world-api/town`. */
  read(): Promise<HostAnswer>;
  /** `PUT /world-api/town {op, document?, baseRev}` (round 21: the host moves its own history; an undo or a redo sends no document). */
  write(op: HostTownOp, document: TownDocument | null, baseRev: number): Promise<HostAnswer>;
}

/**
 * The store a page runs on: the host-backed one for a live page, the browser's own for a demo page. A demo page's town
 * is never the host's: no transport is asked, whatever it would answer (tested).
 */
export function townStoreFor(input: { live: boolean; local: TownStore; make: (local: TownStore) => TownStore }): TownStore {
  return input.live ? input.make(input.local) : input.local;
}

export interface HostTownOptions {
  /** The browser's own store (IndexedDB): the fallback and the undo history. */
  local: TownStore;
  transport: HostTownTransport;
  context: TownContext;
  /** The host's word that the town changed (townBus.ts); returns the way to stop listening. */
  onTown?: (listener: (rev: number) => void) => () => void;
  /** The stream coming (back) up (townBus.ts): a `town` message sent meanwhile was lost, so the town is read again. */
  onConnected?: (listener: () => void) => () => void;
  /** How long an offline browser waits before it asks the host again. Default 30 s. */
  retryMs?: number;
  /** Something to say in the log (never a document). */
  log?: (line: string) => void;
}

/** The words the Settings card, the Connection panel, build mode and the text view use for where the town is kept. */
export const KEPT_BY_HOST = "kept by the world's host for this crewhub-loops, shared by every paired browser";
export const KEPT_UNTIL_BACK = "kept in this browser until the host is back";
export const CONFLICT_NOTE = "Another browser changed the town; your last change was not kept and the host's town was loaded.";
export const IMPORTED_NOTE = "This browser's town was sent to the world's host once; from now on the host keeps it.";
export const NO_DB_NOTE = "This host keeps no world database (it could not open world.db), so the town stays in this browser.";

export function createHostTownStore(options: HostTownOptions): TownStore & { readonly rev: number | null; sync(): Promise<void> } {
  const { local, transport, context } = options;
  const retryMs = options.retryMs ?? 30_000;
  const log = options.log ?? (() => undefined);
  /** The host's revision this browser is on; null while the host is away (offline). */
  let rev: number | null = null;
  /** The last revision this browser was on with the host, kept through an offline spell: what its edits are based on. */
  let knownRev: number | null = null;
  /** The local document changed while the host was away: offered again when it answers. */
  let pending = false;
  /** Part of that change is a person's (a commit, an undo): if the host's town wins over it, that is said; the world's own record is not a person's loss. */
  let pendingPerson = false;
  let note: string | null = null;
  let loading: Promise<TownDocument> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  /** Writes go one after another, each on the revision the one before left. */
  let queue: Promise<unknown> = Promise.resolve();
  /** A write is on its way: the host's `town` message for it must not start a refetch that races the answer. */
  let writing = 0;
  /** The newest revision the host announced while a write was on its way; looked at when the write is answered. */
  let announced: number | null = null;
  /** The host's word on its history: whether it has a step back or forward from the current revision. */
  let hostCan: { undo: boolean; redo: boolean } = { undo: false, redo: false };
  /** One read of the host at a time: a second ask while one is on its way runs once more when it is done, never beside it. */
  let syncing: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  local.subscribe(publish);

  const same = (a: TownDocument, b: TownDocument) => JSON.stringify(a) === JSON.stringify(b);

  /** The host's `canUndo`/`canRedo` from an answer, when it carries them. */
  const readCan = (body: unknown) => {
    const b = body as { canUndo?: unknown; canRedo?: unknown } | null;
    if (typeof b?.canUndo === "boolean" && typeof b?.canRedo === "boolean") hostCan = { undo: b.canUndo, redo: b.canRedo };
  };

  /** Takes the host's document as the current one, without an undo step; nothing when it is already the one shown. */
  async function adopt(document: unknown, hostRev: number, what: string): Promise<boolean> {
    const result = validateTownDocument(document, context);
    if (!result.ok) {
      log(`the host's town does not validate at ${result.errors[0]?.path ?? "?"}: ${result.errors[0]?.message ?? "?"}; this browser keeps its own`);
      return false;
    }
    // The document first, the revision after: a move derived meanwhile sees the old revision (and waits or goes pending),
    // never the new revision over the old document.
    if (!same(result.value, local.state.doc)) {
      await local.amend(() => result.value);
      log(`town revision ${hostRev} taken from the host (${what}: ${result.value.zones?.length ?? 0} zones, ${result.value.plots.length} plots)`);
    }
    rev = hostRev;
    knownRev = hostRev;
    return true;
  }

  const offline = (why: string) => {
    if (rev !== null) log(`the host does not keep the town for now (${why}); ${KEPT_UNTIL_BACK}`);
    rev = null;
    if (retry === null) {
      retry = setTimeout(() => {
        retry = null;
        void sync();
      }, retryMs);
    }
  };

  /**
   * Reads the host's town: takes it, or imports this browser's once, or goes offline until the host answers. Reads are
   * single file: two asks close together (a town message during the load, two messages in a row) make one read, then
   * one more, never two side by side whose answers could land out of order.
   */
  function sync(): Promise<void> {
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = (async () => {
      try {
        do {
          again = false;
          await syncOnce();
        } while (again);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  async function syncOnce(): Promise<void> {
    await local.load();
    const answer = await transport.read();
    if (answer.status === 200) {
      const body = answer.body as { rev?: unknown; document?: unknown; reason?: unknown } | null;
      if (typeof body?.rev === "number" && writing > 0) {
        // A write is on its way: its answer decides the revision; what this read saw is looked at after it (settle).
        announced = Math.max(announced ?? 0, body.rev);
        return;
      }
      if (typeof body?.rev === "number" && rev !== null && body.rev < rev) {
        // An answer older than what this browser already has (a slow read overtaken by a write's answer): nothing to take.
        log(`a read of revision ${body.rev} arrived after revision ${rev}; ignored`);
        return;
      }
      if (body?.rev === null) {
        // The host answers but keeps no town yet: no database, or no loops found (a town belongs to an installation).
        offline(typeof body.reason === "string" ? body.reason : "no revision");
        note = body.reason === "no_world_db" ? NO_DB_NOTE : null;
        publish();
        return;
      }
      if (body?.rev === 0 && (body.document === null || body.document === undefined)) return importOnce();
      if (typeof body?.rev === "number") {
        readCan(body);
        if (pending && knownRev !== null && body.rev === knownRev) {
          // The host is back and nobody else wrote meanwhile: this browser's edits go up as the next revision.
          rev = knownRev;
          pending = false;
          pendingPerson = false;
          note = null;
          void push({ doc: local.state.doc, base: rev });
          publish();
          return;
        }
        const lost = pendingPerson;
        pending = false;
        pendingPerson = false;
        const taken = await adopt(body.document, body.rev, "read");
        if (!taken) return;
        // Edits made while the host was away meet a town another browser changed: the host's town wins, and it is said.
        // The imported note stays until the person's next edit; a refetch is no edit.
        note = lost ? CONFLICT_NOTE : note === IMPORTED_NOTE ? note : null;
        publish();
        return;
      }
    }
    if (answer.status === 404) return importOnce();
    offline(`read answered ${answer.status}`);
    note = null;
    publish();
  }

  /** The host has no town for this installation: this browser's goes up once (baseRev 0). Another browser's import in between is a conflict, and the host's town wins, as the rule says. */
  async function importOnce(): Promise<void> {
    {
      // The import is a write like any other: the host's `town` message for it waits for the answer (settle), so it never
      // starts a second read that would import once more.
      writing += 1;
      let written: HostAnswer;
      try {
        written = await transport.write("commit", local.state.doc, 0);
      } finally {
        writing -= 1;
      }
      if (written.status === 200 && typeof (written.body as { rev?: unknown } | null)?.rev === "number") {
        rev = (written.body as { rev: number }).rev;
        knownRev = rev;
        readCan(written.body);
        pending = false;
        pendingPerson = false;
        note = IMPORTED_NOTE;
        log(`this browser's town was imported into the host as revision ${rev}`);
        publish();
        settle();
        return;
      }
      if (written.status === 409) {
        await conflict(written);
        settle();
        return;
      }
      offline(`import answered ${written.status}`);
      publish();
      return;
    }
  }

  async function conflict(answer: HostAnswer): Promise<void> {
    const body = answer.body as { rev?: unknown; document?: unknown } | null;
    if (typeof body?.rev === "number" && body.document !== null && body.document !== undefined) {
      await adopt(body.document, body.rev, "conflict");
      // The host's history after the other browser's move comes with the conflict.
      readCan(body);
      note = CONFLICT_NOTE;
      pending = false;
      pendingPerson = false;
    }
    publish();
  }

  /** What a move is made of: a person's document with the revision it was made on, the world's own update, or nothing (undo, redo). */
  type Move = { doc: TownDocument; base: number | null } | { update: (doc: TownDocument) => TownDocument | null } | null;

  /**
   * One move of the host's history: a commit with the document and the revision it was made on, an amend derived at
   * send time from the document as it then is (the world's own record never carries a stale picture over the host's),
   * or an undo or a redo (the host answers the document it restored, which the browser's store then shows). A move
   * waits for a read on its way, so it is never based on a town about to be replaced. A commit made on a revision the
   * host has since left is a conflict like a 409: the host's town is loaded and said. No answer goes offline and keeps
   * the change here. `byPerson` (a commit, an undo, a redo) also clears an old note.
   */
  function push(move: Move, op: HostTownOp = "commit", byPerson = false): Promise<void> {
    const run = async () => {
      if (syncing) await syncing;
      let doc: TownDocument | null = null;
      if (move !== null && "update" in move) {
        // Derived on the document as it is now; if the host's town arrived while deriving, derived again on that one.
        for (let attempt = 0; ; attempt += 1) {
          const seen = rev;
          const before = local.state.doc;
          doc = await local.amend(move.update);
          if (doc === before) return;
          if (rev === seen || attempt >= 3) break;
          if (syncing) await syncing;
        }
      } else if (move !== null) doc = move.doc;
      if (rev === null) {
        pending = true;
        if (byPerson) pendingPerson = true;
        return;
      }
      if (move !== null && "base" in move && move.base !== null && move.base !== rev) {
        // The person's edit was made on a town the host has since replaced (another browser wrote while the picture
        // changed here): the host's town stands, as after a 409, and it is said.
        log(`an edit made on revision ${move.base} meets revision ${rev}; the host's town is kept`);
        pending = false;
        pendingPerson = false;
        await sync();
        note = CONFLICT_NOTE;
        publish();
        return;
      }
      writing += 1;
      let answer: HostAnswer;
      try {
        log(`${op} sent on revision ${rev}${doc ? ` (${doc.zones?.length ?? 0} zones, ${doc.plots.length} plots)` : ""}`);
        answer = await transport.write(op, doc, rev);
      } finally {
        writing -= 1;
      }
      if (answer.status === 200 && typeof (answer.body as { rev?: unknown } | null)?.rev === "number") {
        const body = answer.body as { rev: number; document?: unknown };
        rev = body.rev;
        knownRev = rev;
        readCan(body);
        // An undo or a redo restores a document the host holds: taken here without a local undo step.
        if ((op === "undo" || op === "redo") && body.document !== null && body.document !== undefined) {
          const result = validateTownDocument(body.document, context);
          if (result.ok && !same(result.value, local.state.doc)) await local.amend(() => result.value);
        }
        if (byPerson && (note === CONFLICT_NOTE || note === IMPORTED_NOTE)) note = null;
        publish();
        settle();
        return;
      }
      if (answer.status === 409) {
        await conflict(answer);
        settle();
        return;
      }
      pending = true;
      if (byPerson) pendingPerson = true;
      offline(`write answered ${answer.status}`);
      publish();
    };
    queue = queue.then(run, run);
    return queue as Promise<void>;
  }

  /** The host's word that the town changed: refetched unless it is a revision this browser already has or is writing. */
  const heard = (hostRev: number) => {
    if (rev !== null && hostRev <= rev) return;
    if (writing > 0) {
      announced = Math.max(announced ?? 0, hostRev);
      return;
    }
    void sync();
  };
  const stopTown = options.onTown?.(heard);
  /** The stream came (back) up: whatever the host said meanwhile was not heard, so the town is read again. */
  const stopConnected = options.onConnected?.(() => {
    if (loading !== null) void sync();
  });
  /** After a write: a revision announced meanwhile that is newer than ours is fetched now. */
  const settle = () => {
    const seen = announced;
    announced = null;
    if (seen !== null && writing === 0) heard(seen);
  };

  const store = {
    get rev() {
      return rev;
    },
    get state(): TownStoreState {
      const s = local.state;
      if (rev === null) return { ...s, storageNote: note ?? s.storageNote };
      // While the host keeps the town, the undo steps are the host's, and the browser store's own notes (memory only, a
      // skipped revision) are about the fallback and stay quiet.
      return { ...s, storage: "host", canUndo: hostCan.undo, canRedo: hostCan.redo, storageNote: note };
    },
    load() {
      loading ??= (async () => {
        await local.load();
        await sync();
        return local.state.doc;
      })();
      return loading;
    },
    sync,
    async commit(doc) {
      // The revision this edit was made on, before anything else moves.
      const base = rev;
      const current = await local.commit(doc);
      await push({ doc: current, base }, "commit", true);
      return local.state.doc;
    },
    async amend(update) {
      // The world's own record is derived when it is sent, on the document as it then is.
      await push({ update }, "amend");
      return local.state.doc;
    },
    async undo() {
      // With the host: its history steps back and every browser sees it. Away from it: this browser's own steps.
      if (rev !== null) {
        await push(null, "undo", true);
        return local.state.doc;
      }
      const base = rev;
      const current = await local.undo();
      await push({ doc: current, base }, "commit", true);
      return local.state.doc;
    },
    async redo() {
      if (rev !== null) {
        await push(null, "redo", true);
        return local.state.doc;
      }
      const base = rev;
      const current = await local.redo();
      await push({ doc: current, base }, "commit", true);
      return local.state.doc;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopTown?.();
          stopConnected?.();
        }
      };
    },
  } satisfies TownStore & { rev: number | null; sync(): Promise<void> };
  return store;
}
