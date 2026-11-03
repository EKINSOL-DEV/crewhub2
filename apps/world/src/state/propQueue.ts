/* Which done prop requests the town imports, one at a time, and what a failed import does (round 53, review S3): the
   step out of state/town.ts, with the import itself and the timer handed in, so a test drives it without React or the
   scene. */

/** How long a request whose import failed waits before it is tried again. */
export const PROP_RETRY_MS = 30_000;

type Schedule = (fn: () => void, ms: number) => void;

export interface PropQueueOptions {
  /** Imports one request. It returns when the ticket is done with (imported, invalid, gone or turned down) and throws
   *  when a read failed. */
  run: (ticketKey: string) => Promise<void>;
  /** Called when a failed request may be tried again: the town lists its requests again and offers them. */
  again: () => void;
  schedule?: Schedule;
  warn?: (message: string, error: unknown) => void;
}

export interface PropQueue {
  /** Queues every listed request not tried yet; each runs after the one before, on the latest document. */
  offer(ticketKeys: readonly string[]): void;
  /** Settles when everything queued so far has run. */
  idle(): Promise<void>;
}

/**
 * A request is tried once. A failed read (a 503 while loops restarts, the host away) used to leave it untried for the
 * page's life; now it may be tried again after `PROP_RETRY_MS`, if it is still listed then. It stays tried while it is
 * queued, running or waiting, so a ticket never has two imports on their way.
 */
export function createPropQueue({ run, again, schedule = (fn, ms) => void setTimeout(fn, ms), warn = (message, error) => console.warn(message, error) }: PropQueueOptions): PropQueue {
  const tried = new Set<string>();
  let queue: Promise<void> = Promise.resolve();
  return {
    offer(ticketKeys) {
      for (const ticketKey of ticketKeys) {
        if (tried.has(ticketKey)) continue;
        tried.add(ticketKey);
        queue = queue.then(() => run(ticketKey)).catch((e: unknown) => {
          warn("Prop request failed", e);
          schedule(() => {
            tried.delete(ticketKey);
            again();
          }, PROP_RETRY_MS);
        });
      }
    },
    idle: () => queue,
  };
}
