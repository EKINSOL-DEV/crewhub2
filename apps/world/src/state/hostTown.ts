/* The town kept by the world's host (spec addendum "the world database, first slice", round 20): a `TownStore` over the
   browser's own store (IndexedDB, the per-installation key) that reads the installation's town from the host on load,
   imports the browser's town once when the host has none (never over a town the host has), sends every commit, undo,
   redo and amend to the host with the revision it is based on, and takes the host's town when another browser wrote
   first or when the stream says the town changed. The browser's store follows every document, so a browser that loses
   the host keeps editing ("kept in this browser until the host is back") and offers its town again when the host
   answers. Pure of React and the DOM: the transport is injected, so a test drives it with a fake. */
import { validateTownDocument, type TownContext, type TownDocument } from "@crewhub/world-model";
import type { HostAnswer } from "@crewhub/loops-client";
import type { TownStore, TownStoreState } from "./townStore.ts";

export interface HostTownTransport {
  /** `GET /world-api/town`. */
  read(): Promise<HostAnswer>;
  /** `PUT /world-api/town {document, baseRev}`. */
  write(document: TownDocument, baseRev: number): Promise<HostAnswer>;
}

export interface HostTownOptions {
  /** The browser's own store (IndexedDB): the fallback and the undo history. */
  local: TownStore;
  transport: HostTownTransport;
  context: TownContext;
  /** The host's word that the town changed (townBus.ts); returns the way to stop listening. */
  onTown?: (listener: (rev: number) => void) => () => void;
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
  let note: string | null = null;
  let loading: Promise<TownDocument> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  /** Writes go one after another, each on the revision the one before left. */
  let queue: Promise<unknown> = Promise.resolve();
  /** A write is on its way: the host's `town` message for it must not start a refetch that races the answer. */
  let writing = 0;
  /** The newest revision the host announced while a write was on its way; looked at when the write is answered. */
  let announced: number | null = null;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  local.subscribe(publish);

  const same = (a: TownDocument, b: TownDocument) => JSON.stringify(a) === JSON.stringify(b);

  /** Takes the host's document as the current one, without an undo step; nothing when it is already the one shown. */
  async function adopt(document: unknown, hostRev: number, what: string): Promise<boolean> {
    const result = validateTownDocument(document, context);
    if (!result.ok) {
      log(`the host's town does not validate at ${result.errors[0]?.path ?? "?"}: ${result.errors[0]?.message ?? "?"}; this browser keeps its own`);
      return false;
    }
    rev = hostRev;
    knownRev = hostRev;
    if (!same(result.value, local.state.doc)) {
      await local.amend(() => result.value);
      log(`town revision ${hostRev} taken from the host (${what})`);
    }
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

  /** Reads the host's town: takes it, or imports this browser's once, or goes offline until the host answers. */
  async function sync(): Promise<void> {
    await local.load();
    const answer = await transport.read();
    if (answer.status === 200) {
      const body = answer.body as { rev?: unknown; document?: unknown; reason?: unknown } | null;
      if (body?.rev === null) {
        // The host answers but keeps no town yet: no database, or no loops found (a town belongs to an installation).
        offline(typeof body.reason === "string" ? body.reason : "no revision");
        note = body.reason === "no_world_db" ? NO_DB_NOTE : null;
        publish();
        return;
      }
      if (body?.rev === 0 && (body.document === null || body.document === undefined)) return importOnce();
      if (typeof body?.rev === "number") {
        if (pending && knownRev !== null && body.rev === knownRev) {
          // The host is back and nobody else wrote meanwhile: this browser's edits go up as the next revision.
          rev = knownRev;
          pending = false;
          note = null;
          await push(local.state.doc);
          publish();
          return;
        }
        const lost = pending;
        pending = false;
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
      const written = await transport.write(local.state.doc, 0);
      if (written.status === 200 && typeof (written.body as { rev?: unknown } | null)?.rev === "number") {
        rev = (written.body as { rev: number }).rev;
        knownRev = rev;
        pending = false;
        note = IMPORTED_NOTE;
        log(`this browser's town was imported into the host as revision ${rev}`);
        publish();
        return;
      }
      if (written.status === 409) {
        await conflict(written);
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
      note = CONFLICT_NOTE;
      pending = false;
    }
    publish();
  }

  /** Sends `doc` as the next revision; a conflict takes the host's town; no answer goes offline and keeps the change here. `byPerson` (a commit, an undo, a redo) also clears an old note. */
  function push(doc: TownDocument, byPerson = false): Promise<void> {
    const run = async () => {
      if (rev === null) {
        pending = true;
        return;
      }
      writing += 1;
      let answer: HostAnswer;
      try {
        answer = await transport.write(doc, rev);
      } finally {
        writing -= 1;
      }
      if (answer.status === 200 && typeof (answer.body as { rev?: unknown } | null)?.rev === "number") {
        rev = (answer.body as { rev: number }).rev;
        knownRev = rev;
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
      // While the host keeps the town, the browser store's own notes (memory only, a skipped revision) are about the fallback and stay quiet.
      return { ...s, storage: rev === null ? s.storage : "host", storageNote: note ?? (rev === null ? s.storageNote : null) };
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
      const current = await local.commit(doc);
      await push(current, true);
      return local.state.doc;
    },
    async amend(update) {
      const before = local.state.doc;
      const current = await local.amend(update);
      if (current !== before) await push(current);
      return local.state.doc;
    },
    async undo() {
      const current = await local.undo();
      await push(current, true);
      return local.state.doc;
    },
    async redo() {
      const current = await local.redo();
      await push(current, true);
      return local.state.doc;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopTown?.();
      };
    },
  } satisfies TownStore & { rev: number | null; sync(): Promise<void> };
  return store;
}
