/* The page's reads for the long-session probe (state/soak.ts): the stores of this module tree, the town runtime and
   the host's health as the page last read it; the page's own connection comes from the caller (App.tsx has the world
   runtime). Kept apart from soak.ts so the probe itself imports nothing of the page and tests under node. */
import { getHealth } from "./health";
import { getRecentAnswers, saidCount } from "./said";
import type { StoreReads } from "./soak";
import { getThreads } from "./threads";
import { townRuntime } from "./town";

export function pageReads(connection: () => unknown): StoreReads {
  return {
    said: saidCount,
    answers: () => getRecentAnswers().length,
    threads: getThreads,
    town: () => {
      const { doc, hostRev } = townRuntime().state;
      return { docRevision: doc.revision, hostRev };
    },
    stream: () => {
      const stream = getHealth()?.connection?.stream;
      return stream ? { state: stream.state, reconnects: stream.reconnects } : null;
    },
    connection,
  };
}
