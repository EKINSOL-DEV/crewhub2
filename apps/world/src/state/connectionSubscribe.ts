/* The subscribe function the connection hooks give `useSyncExternalStore` (state/world.ts). */

interface Changes {
  onChange(listener: () => void): () => void;
}

const NONE = () => () => {};

const made = new WeakMap<Changes, (listener: () => void) => () => void>();

/**
 * One subscribe function per connection (and one for none), so `useSyncExternalStore` keeps its subscription across
 * renders instead of dropping and making it again on every App render (round 50, r48-live N3).
 */
export function subscribeOf(connection: Changes | null): (listener: () => void) => () => void {
  if (connection === null) return NONE;
  let subscribe = made.get(connection);
  if (subscribe === undefined) {
    subscribe = (listener) => connection.onChange(listener);
    made.set(connection, subscribe);
  }
  return subscribe;
}
