/**
 * Waiting in the host's tests: for the state a test needs, never for a fixed time. A loaded machine (a build, a
 * perf run and the whole check at once) stretches every timer and every read, so a test that sleeps 30 ms and then
 * looks, or gives a reconnect one second, loses now and then. `waitFor` polls until the predicate holds and fails
 * only after a generous ceiling: the ceiling bounds a broken test's run, it never decides a working one. What a test
 * proves stays in its predicate and its assertions, not in the clock.
 */

/** The ceiling for a wait: far above anything a working host needs, so that only a real failure reaches it. */
export const GENEROUS_MS = 15_000;
/** The poll's pace. */
export const POLL_MS = 20;

/** Resolves once `predicate` holds, polling every `POLL_MS`; rejects, naming `what`, after `timeoutMs`. Returns the ms waited. */
export async function waitFor(what: string, predicate: () => Promise<boolean> | boolean, timeoutMs = GENEROUS_MS): Promise<number> {
  const started = Date.now();
  while (!(await predicate())) {
    const waited = Date.now() - started;
    if (waited > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return Date.now() - started;
}
