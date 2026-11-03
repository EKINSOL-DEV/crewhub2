/** Types for `world.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */

/** What `watch` listens to: a Playwright page, or any emitter of its `pageerror`, `console` and `request` events. */
export interface WatchedPage {
  on(event: string, listener: (...args: any[]) => void): unknown;
}
/**
 * Listens to a page for a page error, a console error or a request that leaves the page's own origin (`origin`, bare:
 * `http://127.0.0.1:<port>`), each pushed into `problems` as { kind, text, pageOrigin, url?, method? }.
 */
export function watch(page: WatchedPage, origin: string, problems: { kind: string }[], tag?: string): void;
