/* Media queries as a store (round 30): one MediaQueryList per query for the page, one subscribe function per query made
   once, and `useMedia(query)` on top. `useSyncExternalStore` re-subscribes whenever its subscribe function changes
   identity, so an inline arrow re-subscribed on every render (the soak's listener churn, round 29); a function made
   once per query does not. `matchMedia` itself cost about 1 ms a render at 4x (round 25), hence the list cached too. */
import { useSyncExternalStore } from "react";

const lists = new Map<string, MediaQueryList>();
const subscribers = new Map<string, (listener: () => void) => () => void>();
const readers = new Map<string, () => boolean>();

/** The page's one MediaQueryList for `query`. */
export function mediaList(query: string): MediaQueryList {
  let list = lists.get(query);
  if (!list) lists.set(query, (list = window.matchMedia(query)));
  return list;
}

/** The subscribe function for `query`: the same function every time, so a store hook never re-subscribes. */
export function mediaSubscribe(query: string): (listener: () => void) => () => void {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (listener) => {
      const list = mediaList(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

/** The read function for `query`, made once likewise. */
export function mediaRead(query: string): () => boolean {
  let read = readers.get(query);
  if (!read) readers.set(query, (read = () => mediaList(query).matches));
  return read;
}

/** Whether `query` matches now, kept current by its change events. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(mediaSubscribe(query), mediaRead(query));
}
