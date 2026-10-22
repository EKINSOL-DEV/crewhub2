/* The host's word that the town changed (`{type: "town", rev}` on the stream, round 20), handed from the world's source
   (state/world.ts) to the town runtime (state/hostTown.ts) without the two importing each other. */
export type TownListener = (rev: number) => void;

const listeners = new Set<TownListener>();

/** Listens for the host's town revisions; returns the way to stop. */
export function onHostTown(listener: TownListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The source's call: a revision the host announced. */
export function hostTownChanged(rev: number): void {
  for (const listener of [...listeners]) listener(rev);
}
