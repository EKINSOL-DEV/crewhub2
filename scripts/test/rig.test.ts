/* The tools' rig through its interface (tools/lib/rig.mjs, round 60 T1): the serving rule (a built dist is served on the
   host's own address, else the host stands behind the Vite origin it allows), the pairing step (the one-time link on
   the page's origin, landing on `/`), a restart on the same options and port, and the close order (the host first, then
   the fake, then the web stub). Over the in-process fake on ports the OS picks; the host is read with node:http. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { TEST_TIMINGS, distBuilt, startRig } from "../../tools/lib/rig.mjs";

const read = (url: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) =>
    get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += String(chunk)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    }).on("error", reject),
  );
/** A page as the rig drives it: records the address it was sent to and that the rig waited for the tab's bearer. */
function fakePage() {
  const visits: string[] = [];
  const page = {
    visits,
    bearerWaits: 0,
    async goto(url: string) {
      visits.push(url);
    },
    async waitForFunction() {
      // The page exchanges the fragment's token for this tab's bearer (world.mjs `pairedTab`): the link alone pairs nothing.
      page.bearerWaits += 1;
    },
  };
  return page;
}
const ownPort = (url: string) => {
  const port = Number(new URL(url).port);
  assert.ok(port >= 1024 && ![5180, 8091, 8291, 8292, 8293].includes(port), url);
};

test("behind a Vite origin: the host listens on the port given, allows that origin, and the page's origin is the Vite's", async () => {
  const rig = await startRig({ loops: { fake: { heartbeatMs: 1000 } }, serve: { origin: "http://127.0.0.1:5399", hostPort: 0 }, pairing: "off" });
  try {
    assert.equal(rig.served, false);
    assert.equal(rig.origin, "http://127.0.0.1:5399");
    assert.equal(rig.base, "http://127.0.0.1:5399/");
    ownPort(rig.host.url);
    ownPort(rig.fake!.url);
    const health = await read(`${rig.host.url}/world-api/health`);
    assert.equal(health.status, 200);
    assert.equal(rig.web, null);
    assert.ok(rig.lines.length > 0, "the host's lines are kept when no log is given");
  } finally {
    await rig.close();
  }
});

test("a dist named and built is served on the host's own address; named and not built with no Vite origin, the rig refuses", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chw-rig-"));
  try {
    await assert.rejects(startRig({ loops: { fake: {} }, serve: { dist: dir }, pairing: "off" }), /run npm run build first/);
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>rig</title>built");
    assert.equal(distBuilt(dir), true);
    const rig = await startRig({ loops: { fake: {} }, serve: { dist: dir, origin: "http://127.0.0.1:5399", hostPort: 5398 }, pairing: "off" });
    try {
      assert.equal(rig.served, true, "built: served, whatever Vite origin was named beside it");
      assert.equal(rig.origin, rig.host.url);
      assert.notEqual(rig.host.port, 5398, "served beside a Vite origin: a free port, not the one the Vite proxies to");
      const page = await read(`${rig.host.url}/`);
      assert.equal(page.status, 200);
      assert.match(page.body, /built/);
    } finally {
      await rig.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pairing on: the link is minted on the page's origin and pair() waits for the tab's bearer; off: no bearer is needed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chw-rig-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html>built");
  const on = await startRig({ loops: { fake: {} }, serve: { origin: "http://127.0.0.1:5399", hostPort: 0 } });
  const served = await startRig({ loops: { fake: {} }, serve: { dist: dir } });
  try {
    assert.ok(on.pairLink().startsWith("http://127.0.0.1:5399/"), "behind the Vite: the link opens on the Vite's origin (it proxies /world-api/pair)");
    assert.ok(served.pairLink().startsWith(`${served.host.url}/`), "serving: the link opens on the host's own");
    const page = fakePage();
    await on.pair(page);
    assert.equal(page.visits.length, 1);
    assert.ok(page.visits[0]!.startsWith("http://127.0.0.1:5399/#pair="), "the token in the fragment");
    assert.equal(page.bearerWaits, 1, "pair() waits for the tab's bearer");
    assert.equal((await read(`${on.host.url}/world-api/snapshot`)).status, 401, "pairing on: the API refuses without the bearer");
    assert.equal((await read(`${served.host.url}/world-api/snapshot`)).status, 401);
  } finally {
    await on.close();
    await served.close();
    rmSync(dir, { recursive: true, force: true });
  }
  const off = await startRig({ loops: { fake: {} }, serve: { hostPort: 0 }, pairing: "off" });
  try {
    assert.notEqual((await read(`${off.host.url}/world-api/snapshot`)).status, 401, "pairing off: no bearer asked for");
    assert.equal(off.origin, off.host.url, "no Vite origin named: the host's own address is the page's");
  } finally {
    await off.close();
  }
});

test("restart: the next host stands on the same options (the pairing secret too) and, serving, on the same port; close goes host, fake, web", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chw-rig-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html>built");
  const order: string[] = [];
  const rig = await startRig({ loops: { fake: {} }, web: true, serve: { dist: dir }, pairing: { secret: Buffer.alloc(32, 7) }, timings: TEST_TIMINGS });
  try {
    const first = rig.host;
    const port = first.port;
    const next = await rig.restart({});
    assert.notEqual(next, first);
    assert.equal(next.port, port, "serving: the restarted host keeps the port the browsers know");
    assert.equal(rig.host, next);
    assert.equal((await read(`${next.url}/world-api/health`)).status, 200);
    assert.ok(rig.web !== null && typeof rig.web.url === "string");
    for (const [name, thing] of [["host", rig.host], ["fake", rig.fake], ["web", rig.web]] as const) {
      const close = (thing as { close: () => Promise<void> }).close.bind(thing);
      (thing as { close: () => Promise<void> }).close = async () => {
        order.push(name);
        await close();
      };
    }
  } finally {
    await rig.close();
  }
  assert.deepEqual(order, ["host", "fake", "web"]);
  rmSync(dir, { recursive: true, force: true });
});
