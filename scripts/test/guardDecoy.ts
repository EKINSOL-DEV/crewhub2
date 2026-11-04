/* The guard tests' decoys (round 56): a refusal is proved on a port the test picks and owns, never on a named port. A
   child gets `CREWHUB_TEST_GUARD_DECOY=<port>`, and no-app-reach then refuses that port as it refuses the named ones. */
import { createServer } from "node:net";

/** A TCP listener of the test's own on 127.0.0.1, port 0: the decoy a child connects to. It counts what reaches it. */
export async function decoyListener(): Promise<{ port: number; hits: () => number; close: () => Promise<void> }> {
  let hits = 0;
  const server = createServer((socket) => {
    hits += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  return { port, hits: () => hits, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** A port that was free a moment ago (listen 0, read, close): the decoy a child tries to listen on. */
export async function freePort(): Promise<number> {
  const own = await decoyListener();
  await own.close();
  return own.port;
}

/** Whether the test can listen on `port` itself now: true shows nobody took it. */
export function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
