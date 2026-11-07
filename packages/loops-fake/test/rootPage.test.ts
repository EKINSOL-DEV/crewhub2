/* The fake's page at `/` (round 65, C: the walkthroughs' tooling note "the fake serves no web app"): the world's Chat
   panel frames the loops origin's root, and over the fake that frame used to show the JSON 404. Now `/` is a small HTML
   page saying it is the fake and has no web app; every other path outside `/api` answers the JSON 404 as before, and
   the key is never in the page. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoopsFake } from "../src/fake.ts";

async function withFake(run: (fake: Awaited<ReturnType<typeof createLoopsFake>>) => Promise<void>): Promise<void> {
  const fake = await createLoopsFake({ speed: 0 });
  try {
    await run(fake);
  } finally {
    await fake.close();
  }
}

test("GET / is a small HTML page: the fake, no web app, nothing to sign in to; the key is not in it", async () => {
  await withFake(async (fake) => {
    const res = await fetch(`${fake.url}/`);
    const page = await res.text();
    assert.equal(res.status, 200, page.slice(0, 200));
    assert.match(res.headers.get("content-type") ?? "", /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(page, /^<!doctype html>/i);
    assert.match(page, /<html lang="en">/);
    assert.match(page, /<title>loops-fake<\/title>/);
    assert.match(page, /the fake crewhub-loops/);
    assert.match(page, /no web app/);
    assert.match(page, /nothing to sign in to/);
    assert.match(page, /--viewer-key/);
    assert.doesNotMatch(page, /<script/i);
    assert.ok(!page.includes(fake.key), "the key is never in the page");
    assert.ok(!page.includes(fake.key.slice(4, 16)), "nor a piece of it");
    assert.ok(page.length < 2000, `small: ${page.length} bytes`);
  });
});

test("the Chat panel's frame address, /?chat=<agent>, gets the same page; HEAD gets its headers and no body", async () => {
  await withFake(async (fake) => {
    const root = await (await fetch(`${fake.url}/`)).text();
    const chat = await fetch(`${fake.url}/?chat=cr-lead`);
    const chatPage = await chat.text();
    assert.equal(chat.status, 200, chatPage.slice(0, 200));
    assert.equal(chatPage, root);
    const head = await fetch(`${fake.url}/`, { method: "HEAD" });
    const headBody = await head.text();
    assert.equal(head.status, 200);
    assert.match(head.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(root)));
    assert.equal(headBody, "");
  });
});

test("the page needs no key and is the same with one; a POST to / is not a page", async () => {
  await withFake(async (fake) => {
    const anonymous = await (await fetch(`${fake.url}/`)).text();
    const withKey = await fetch(`${fake.url}/`, { headers: { authorization: `Bearer ${fake.key}` } });
    const withKeyPage = await withKey.text();
    assert.equal(withKey.status, 200, withKeyPage.slice(0, 200));
    assert.equal(withKeyPage, anonymous);
    const post = await fetch(`${fake.url}/`, { method: "POST" });
    await post.text();
    assert.equal(post.status, 404);
    assert.match(post.headers.get("content-type") ?? "", /^application\/json/);
  });
});

test("every other path outside /api is the JSON 404 it was: a ticket link, index.html, a trailing word", async () => {
  await withFake(async (fake) => {
    for (const pathname of ["/t/CR-1", "/index.html", "/settings", "/api", "/api/", "/apix", "/?chat=cr-lead/"]) {
      const res = await fetch(`${fake.url}${pathname.replace("/?chat=cr-lead/", "/x?chat=cr-lead")}`);
      const body = await res.json();
      assert.equal(res.status, 404, pathname);
      assert.match(res.headers.get("content-type") ?? "", /^application\/json/, pathname);
      assert.deepEqual(body, { error: { code: "not_found", message: "Not found", detail: null } }, pathname);
    }
  });
});

test("with a world origin set, a request from that origin for / is the gate's 403, as for any route outside the four; one without an Origin header (a frame's navigation) gets the page", async () => {
  await withFake(async (fake) => {
    fake.setWorldOrigin("http://127.0.0.1:5383");
    const framed = await fetch(`${fake.url}/?chat=cr-lead`);
    const framedPage = await framed.text();
    assert.equal(framed.status, 200, framedPage.slice(0, 200));
    const scripted = await fetch(`${fake.url}/`, { headers: { origin: "http://127.0.0.1:5383" } });
    const refusal = await scripted.json();
    assert.equal(scripted.status, 403);
    assert.equal((refusal as { error: { code: string } }).error.code, "origin_forbidden");
    assert.equal(scripted.headers.get("access-control-allow-origin"), null);
  });
});
