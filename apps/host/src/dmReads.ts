/**
 * The chat's road 1 reads every agent `dm.created` on the key's stream as one request to loops (the message by id).
 * Without a cap, a burst of hundreds in one instant opened hundreds of connections at once; past a listen backlog (128
 * on macOS) the surplus connects fail and those bubbles were lost (round 34, question 14). This gate keeps at most
 * `limit` reads in flight: the surplus waits its turn in the stream's order, nothing is dropped, and a read that fails
 * without loops saying no is tried once more.
 */

/**
 * Eight at once. Well under a backlog of 128 even with the snapshot's six, the threads' refresh and a health probe
 * beside it, and what a browser allows one origin. A burst of 440 (the round-34 test) then costs 55 round trips:
 * about 0.2 s on loopback, a few seconds against a loops 50 ms away; the last bubble comes that much later, no bubble
 * is lost.
 */
export const DM_READ_LIMIT = 8;
/** The pause before the one retry of a read loops did not refuse (a 5xx, a 429, no answer). */
export const DM_READ_RETRY_MS = 250;
/** Lost reads (failed after the retry) are counted and said in one log line at most this often. */
export const DM_LOST_LOG_MS = 5_000;

export interface Gate {
  /** Runs `task` once a slot is free, in arrival order; resolves with its result (or rejects as it does). */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks running right now (at most the limit). */
  inFlight(): number;
  /** Tasks waiting for a slot. */
  waiting(): number;
}

/** At most `limit` tasks at once (a limit below one counts as one); the rest queue, first come first served. */
export function createGate(limit: number): Gate {
  const cap = Math.max(1, Math.floor(limit));
  const queue: (() => void)[] = [];
  let running = 0;
  function next(): void {
    while (running < cap && queue.length > 0) {
      running += 1;
      (queue.shift() as () => void)();
    }
  }
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        // The slot is freed before the caller hears the result, so the next read starts at once.
        const release = (): void => {
          running -= 1;
          next();
        };
        queue.push(() => {
          task().then(
            (value) => {
              release();
              resolve(value);
            },
            (error: unknown) => {
              release();
              reject(error);
            },
          );
        });
        next();
      });
    },
    inFlight: () => running,
    waiting: () => queue.length,
  };
}

/**
 * Whether a message read is worth one more try: loops did not answer (null: a reset connection, a timeout), is in
 * trouble (5xx) or asks for a pause (429). A 4xx is loops' word that this key does not read that message: final, as
 * before. A 200 whose body is no message is final too (nothing to retry).
 */
export function retryableRead(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}
