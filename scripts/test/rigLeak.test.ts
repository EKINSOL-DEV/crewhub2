/* The rig when its host cannot listen (round 62, T-1): the fake and the loops web stub are started before the host, so a
   host that cannot take its port (EADDRINUSE: a host of an earlier run still there) used to leave both listening with
   no handle for the caller to close them. The rig closes what it started before it rejects, as its header promises
   ("a refusal leaves no fake behind"). The taken port is one the OS picks: never a named one. */
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import test from "node:test";
import { startRig } from "../../tools/lib/rig.mjs";

/** Whether anything answers a GET at `url` (node:http, as rig.test.ts reads the host; no fetch here). */
const answers = (url: string) =>
  new Promise<boolean>((resolve) => {
    get(url, (res) => {
      res.resume();
      res.on("end", () => resolve(true));
    }).on("error", () => resolve(false));
  });

const listen = () =>
  new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    const server = createServer((_req, res) => res.end("taken"));
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => new Promise((done) => server.close(() => done())) });
    });
  });

test("the host's port taken: startRig rejects with the host's error, and the fake and the web stub it started are closed, not left listening", async () => {
  const taken = await listen();
  type Started = { url: string; close: () => Promise<void> };
  const started: Started[] = [];
  try {
    await assert.rejects(
      startRig({
        loops: { fake: { heartbeatMs: 1000 } },
        web: true,
        serve: { hostPort: taken.port },
        pairing: "off",
        onLoops: (made) => {
          started.push(made as unknown as Started);
          return made;
        },
      }),
      /EADDRINUSE/,
    );
    assert.equal(started.length, 2, "the fake and the web stub were started before the host");
    const alive: string[] = [];
    for (const thing of started) if (await answers(`${thing.url}/`)) alive.push(thing.url);
    assert.deepEqual(alive, [], `still listening after the rig's rejection: ${alive.join(", ")}`);
  } finally {
    for (const thing of started) await thing.close().catch(() => undefined);
    await taken.close();
  }
});
