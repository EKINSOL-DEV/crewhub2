/* The merge plan's hand merges as rules (tools/answers-replay.mjs, round 37): each rule resolves the conflict shape it
   was rehearsed on, whichever side git calls "ours", and refuses any other shape with the file named. The fixtures are
   the shapes of the real conflicts on the answer branches at the plan's heads, cut to the lines the rules read. No git. */
import assert from "node:assert/strict";
import test from "node:test";
import { BRANCHES, ORDER, RULES, Refusal, conflictBlocks, healthKeys, resolveText, restoreSetup } from "../../tools/answers-replay.mjs";

const block = (a: string, b: string) => `<<<<<<< ours\n${a}\n=======\n${b}\n>>>>>>> theirs`;
const swapped = (text: string) => {
  const { blocks } = conflictBlocks(text);
  const [first] = blocks;
  return text.replace(block(first!.a.join("\n"), first!.b.join("\n")), block(first!.b.join("\n"), first!.a.join("\n")));
};
const refuses = (fn: () => unknown, words: RegExp) => assert.throws(fn, (e: unknown) => e instanceof Refusal && words.test(e.message));

test("the branches and the order are the plan's", () => {
  assert.deepEqual(ORDER, ["q3", "q8", "q11", "q14", "q15"]);
  assert.equal(BRANCHES.tab, "task/r27-tab-pairing");
  assert.equal(BRANCHES["cookie+expiry"], "task/q1-cookie-expiry");
  assert.deepEqual(Object.values(RULES).map((r) => r.letter).sort(), ["A", "D", "E", "F", "G"]);
});

test("conflictBlocks: every block, the two sides as lines; a block without an end is refused", () => {
  const text = `keep\n${block("a1\na2", "b1")}\nmiddle\n${block("", "b2")}\nend`;
  const { blocks } = conflictBlocks(text);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { start: 1, end: 6, a: ["a1", "a2"], b: ["b1"] });
  assert.deepEqual(blocks[1]!.a, [""]);
  assert.deepEqual(conflictBlocks("no markers").blocks, []);
  refuses(() => conflictBlocks("<<<<<<< x\na\n=======\nb"), /without an end/);
});

test("E. hostPort.ts: r27's head line, q3's key with its comment, whichever side is first; another shape is refused", () => {
  const q3 = "  const head = `dev: /world-api and /pair go to the host on ${where} (${named})`;\n  // The key's name is a paired browser's (round 31, question 3)\n  // and the probe is never paired.\n  const key = (name: string, state: string | null) => (name !== \"\" ? `key ${name}` : state === null ? \"no key yet\" : `a key, ${state}`);";
  const r27 = "  const head = `dev: /world-api goes to the host on ${where} (${named})`;\n  const key = (name: string) => (name === \"\" ? \"no key yet\" : `key ${name}`);";
  const want = "before\n  const head = `dev: /world-api goes to the host on ${where} (${named})`;\n  // The key's name is a paired browser's (round 31, question 3)\n  // and the probe is never paired.\n  const key = (name: string, state: string | null) => (name !== \"\" ? `key ${name}` : state === null ? \"no key yet\" : `a key, ${state}`);\nafter";
  const text = `before\n${block(q3, r27)}\nafter`;
  assert.equal(resolveText("apps/world/hostPort.ts", text), want);
  assert.equal(resolveText("apps/world/hostPort.ts", swapped(text)), want, "the sides swapped");
  refuses(() => resolveText("apps/world/hostPort.ts", `x\n${block(q3, "  const head = `something else`;")}\ny`), /hostPort\.ts: not the r27 x q3 shape/);
  refuses(() => resolveText("apps/world/hostPort.ts", "no conflict here"), /no conflict markers/);
  refuses(() => resolveText("apps/world/other.ts", block("a", "b")), /no rule for this file/);
});

test("F. pairing.test.ts: q3's two tests ported to the bearer, r27's title last; a cookie use the rule does not know is refused", () => {
  const q3 = [
    '  it("before pairing health says the states and nothing else", async () => {',
    "    const bare = JSON.parse((await status(`${host.url}/world-api/health`)).body) as Record<string, unknown>;",
    '    assert.deepEqual(Object.keys(bare).sort(), ["connection", "keyName", "loops", "loopsWebUrl", "paired", "pairing", "sharedKey", "transport"], "no cursor");',
    "    const { cookie } = await pair(host.mintPairLink());",
    "    const paired = JSON.parse((await status(`${host.url}/world-api/health`, { cookie })).body) as Record<string, unknown>;",
    "    assert.equal(paired.paired, true);",
    "    await waitFor(\"loops' version\", async () => JSON.parse((await status(`${host.url}/world-api/health`, { cookie })).body).loopsCommit !== undefined);",
    "  });",
    "",
    '  it("the dev origins", async () => {',
    "    const { cookie } = await pair(host.mintPairLink());",
    "    const pairedPage = await read({ origin: host.url, cookie });",
    "  });",
    "",
    '  it("a link pairs once: the cookie shape, every route open with it, the same link refused the second time", async () => {',
  ].join("\n");
  const r27 = '  it("a link carries the token in the fragment and pairs once: the bearer, every route open with it in the header, the same token refused the second time", async () => {';
  const out = resolveText("apps/host/test/pairing.test.ts", block(q3, r27));
  assert.ok(!out.includes("cookie"), out);
  assert.match(out, /const \{ paired: header \} = await pair\(host\.mintPairLink\(\)\);\n    const paired = JSON\.parse\(\(await status\(`\$\{host\.url\}\/world-api\/health`, header\)\)\.body\)/);
  assert.match(out, /waitFor\("loops' version", async \(\) => JSON\.parse\(\(await status\(`\$\{host\.url\}\/world-api\/health`, header\)\)/);
  assert.match(out, /const \{ paired \} = await pair\(host\.mintPairLink\(\)\);\n    const pairedPage = await read\(\{ origin: host\.url, \.\.\.paired \}\);/);
  assert.match(out, /"pairing", "pairingIdleDays", "sharedKey"/);
  assert.ok(out.endsWith(r27), "r27's title closes the block");
  assert.equal(resolveText("apps/host/test/pairing.test.ts", swapped(block(q3, r27))), out, "the sides swapped");
  refuses(() => resolveText("apps/host/test/pairing.test.ts", block(`${q3.replace("read({ origin: host.url, cookie })", "read({ cookie: cookie })")}`, r27)), /a cookie use the rule does not know/);
  refuses(() => resolveText("apps/host/test/pairing.test.ts", block(q3, "  it(\"some other title\", async () => {")), /no r27 title/);
});

test("D. README.md: q3's paragraph with bearer for cookie", () => {
  const q3 = "  (`devOrigins`, and the header the dev proxy reads), to a\n  program and to a paired browser, never to\n  an unpaired page with an Origin (round 31). Pairing is untouched: the page still needs its cookie. The preview and a\n  build never tell.";
  const r27 = "  (`devOrigins`, and the header the dev proxy reads).\n  Pairing is untouched: the page still needs its bearer. The preview and a build never tell.";
  const out = resolveText("apps/host/README.md", block(q3, r27));
  assert.equal(out, q3.replace("its cookie", "its bearer"));
  assert.equal(resolveText("apps/host/README.md", swapped(block(q3, r27))), out);
  refuses(() => resolveText("apps/host/README.md", block("  nothing about origins", "  nothing either")), /README\.md: not the r27 x q3 shape/);
});

test("G. LOOPS_SETUP.md: r27's bearer paragraph, then q8's side from the source setting on", () => {
  const q8 = "In development the world runs on the Vite origin, and cookies ignore ports: a browser paired on\n`127.0.0.1:5173` too.\n\nThe source setting is `auto` by default: Live when a host answers.\n\nZones: every live project sits in the default zone (one tab at a time: two tabs would mix the history).\nonce.";
  const r27 = "In development the world runs on the Vite origin, which proxies `/world-api` to the host, and the bearer rides\nthrough the proxy like any header: ask for the link on the Vite origin,\nor open the printed one on the host's origin (a tab is paired per origin).";
  const out = resolveText("docs/LOOPS_SETUP.md", block(q8, r27));
  assert.equal(out, `${r27}\n\nThe source setting is \`auto\` by default: Live when a host answers.\n\nZones: every live project sits in the default zone (one tab at a time: two tabs would mix the history).\nonce.`);
  assert.equal(resolveText("docs/LOOPS_SETUP.md", swapped(block(q8, r27))), out);
  refuses(() => resolveText("docs/LOOPS_SETUP.md", block("In development the world runs on the Vite origin, and cookies ignore ports.", r27)), /LOOPS_SETUP\.md: not the r27 x q8 shape/);
});

test("A. host.ts: q3's comment stays, its isPaired line goes (q1 declares it above); a non-empty other side is refused", () => {
  const q3 = "        // Before pairing: the states and nothing else (question 3, round 31). The bot's name, loops' version, the\n        // cursor and the chat word are a paired browser's.\n        const isPaired = paired(req);";
  const out = resolveText("apps/host/src/host.ts", `x\n${block(q3, "")}\ny`);
  assert.equal(out, "x\n        // Before pairing: the states and nothing else (question 3, round 31). The bot's name, loops' version, the\n        // cursor and the chat word are a paired browser's.\ny");
  assert.equal(resolveText("apps/host/src/host.ts", `x\n${block("", q3)}\ny`), out, "the sides swapped");
  refuses(() => resolveText("apps/host/src/host.ts", block(q3, "        const other = 1;")), /host\.ts: the other side is not empty/);
});

test("C. restoreSetup: the two paragraphs come back from the base after the bearer paragraph, once; present means unchanged", () => {
  const base = "# Setup\n\nIn development the world runs on the Vite origin, and cookies ignore ports.\n\nThe source setting is `auto` by default: Live.\nTwo lines.\n\nZones: every live project sits in the default zone.\nUntil\nonce.\n\n## Next\n";
  const r27 = "# Setup\n\nIn development the world runs on the Vite origin, which proxies `/world-api` to the host,\nor open the printed one on the host's origin (a tab is paired per origin).\n\n## Next\n";
  const restored = restoreSetup(r27, base);
  assert.equal(restored.changed, true);
  assert.equal(restored.text, "# Setup\n\nIn development the world runs on the Vite origin, which proxies `/world-api` to the host,\nor open the printed one on the host's origin (a tab is paired per origin).\n\nThe source setting is `auto` by default: Live.\nTwo lines.\n\nZones: every live project sits in the default zone.\nUntil\nonce.\n\n## Next\n");
  assert.deepEqual(restoreSetup(restored.text, base), { text: restored.text, changed: false });
  refuses(() => restoreSetup(r27, "# Setup\n\nnothing here\n"), /the base has no such paragraphs/);
  refuses(() => restoreSetup("# Setup\n\nno bearer paragraph\n", base), /bearer paragraph not found once/);
});

test("B. healthKeys: pairingIdleDays joins q3's list only when health has the field, once", () => {
  const list = 'assert.deepEqual(Object.keys(bare).sort(), ["connection", "keyName", "loops", "loopsWebUrl", "paired", "pairing", "sharedKey", "transport"], "no cursor");';
  const fixed = healthKeys(list, "const health = { pairing: pairingMode, pairingIdleDays: idleDays };");
  assert.equal(fixed.changed, true);
  assert.match(fixed.text, /"pairing", "pairingIdleDays", "sharedKey"/);
  assert.deepEqual(healthKeys(fixed.text, "pairingIdleDays"), { text: fixed.text, changed: false }, "already there");
  assert.deepEqual(healthKeys(list, "const health = { pairing: pairingMode };"), { text: list, changed: false }, "health without the field");
  refuses(() => healthKeys("no list here", "pairingIdleDays"), /q3's key list not found once/);
});
