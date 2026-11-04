/* The merge plan's hand merges as rules (tools/answers-replay.mjs, round 37): each rule resolves the conflict shape it
   was rehearsed on, whichever side git calls "ours", and refuses any other shape with the file named. The fixtures are
   the shapes of the real conflicts on the answer branches at the plan's heads, cut to the lines the rules read. No git. */
import assert from "node:assert/strict";
import test from "node:test";
import { BRANCHES, ORDER, RULES, Refusal, UsageError, branchOf, conflictBlocks, healthKeys, parseArgs, resolveText, setupParagraphs } from "../../tools/answers-replay.mjs";

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
  assert.deepEqual(Object.values(RULES).map((r) => r.letter).sort(), ["A", "D", "E", "F"], "G retired in round 38: r27 carries the LOOPS_SETUP.md paragraphs, q8 merges clean");
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

test("conflictBlocks: a diff3 or zdiff3 block (a merge.conflictStyle set in git's config) is refused, never read as part of a side", () => {
  const diff3 = "keep\n<<<<<<< ours\nmine\n||||||| base\nold\n=======\ntheirs\n>>>>>>> theirs\nend";
  refuses(() => conflictBlocks(diff3), /base section/);
  refuses(() => resolveText("apps/host/README.md", diff3), /base section/);
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

test("A. host.ts: q3's comment stays, its isPaired line goes (q1 declares it above); a non-empty other side is refused", () => {
  const q3 = "        // Before pairing: the states and nothing else (question 3, round 31). The bot's name, loops' version, the\n        // cursor and the chat word are a paired browser's.\n        const isPaired = paired(req);";
  const out = resolveText("apps/host/src/host.ts", `x\n${block(q3, "")}\ny`);
  assert.equal(out, "x\n        // Before pairing: the states and nothing else (question 3, round 31). The bot's name, loops' version, the\n        // cursor and the chat word are a paired browser's.\ny");
  assert.equal(resolveText("apps/host/src/host.ts", `x\n${block("", q3)}\ny`), out, "the sides swapped");
  refuses(() => resolveText("apps/host/src/host.ts", block(q3, "        const other = 1;")), /host\.ts: the other side is not empty/);
});

test("C. setupParagraphs: present is fine; a LOOPS_SETUP.md without the two paragraphs after r27 is refused (the branch dropped them again)", () => {
  const good = "# Setup\n\nIn development the world runs on the Vite origin, which proxies `/world-api` to the host.\n\nThe source setting is `auto` by default: Live.\n\nZones: every live project sits in the default zone.\nonce.\n\n## Next\n";
  assert.equal(setupParagraphs(good), true);
  refuses(() => setupParagraphs(good.replace("The source setting is `auto` by default: Live.\n\n", "")), /source-setting and zones paragraphs are missing/);
  refuses(() => setupParagraphs(good.replace("Zones: every live project sits in the default zone.\n", "")), /missing after task\/r27-tab-pairing/);
  // G is retired: a conflict in that file is for a person.
  refuses(() => resolveText("docs/LOOPS_SETUP.md", block("a", "b")), /no rule for this file/);
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

// --- The command line, and --use: a port stands in for an answer branch (round 59d, the deepening programme). ---

const usageError = (argv: string[], words: RegExp) =>
  assert.throws(() => parseArgs(argv), (e: unknown) => e instanceof UsageError && words.test(e.message));

test("parseArgs: the base, question 1's answer, the yes-branches and --check, as before; no --use means the answer branches", () => {
  assert.deepEqual(parseArgs(["fd2e184", "tab", "q3", "q8", "q11", "q14", "q15", "--check"]), {
    base: "fd2e184",
    q1: "tab",
    chosen: ["q3", "q8", "q11", "q14", "q15"],
    check: true,
    uses: {},
  });
  assert.deepEqual(parseArgs(["HEAD", "cookie"]), { base: "HEAD", q1: "cookie", chosen: [], check: false, uses: {} });
  usageError([], /the base and question 1's answer are required/);
  usageError(["HEAD", "q3"], /the base and question 1's answer are required/);
  usageError(["HEAD", "tab", "q9"], /unknown: q9/);
  for (const key of [...ORDER, "tab", "cookie+expiry"]) assert.equal(branchOf(key, {}), BRANCHES[key as keyof typeof BRANCHES]);
});

test("--use: a port merges in its answer branch's place, at the answer branch's step; the others stay the answer branches", () => {
  const port = "port/task/q14-dm-read-cap@1a2b3c4";
  const args = parseArgs(["HEAD", "tab", "q3", "q14", "--use", `q14=${port}`, "--use", "tab=port/task/r27-tab-pairing@1a2b3c4", "--check"]);
  assert.deepEqual(args.uses, { q14: port, tab: "port/task/r27-tab-pairing@1a2b3c4" });
  assert.deepEqual(args.chosen, ["q3", "q14"], "a --use is no yes-branch of its own");
  assert.equal(args.check, true);
  assert.equal(branchOf("q14", args.uses), port);
  assert.equal(branchOf("tab", args.uses), "port/task/r27-tab-pairing@1a2b3c4");
  assert.equal(branchOf("q3", args.uses), "task/q3-health-less");
  assert.deepEqual(parseArgs(["HEAD", "cookie+expiry", "--use", "cookie+expiry=abc1234"]).uses, { "cookie+expiry": "abc1234" }, "any ref, a sha too");
  assert.deepEqual(parseArgs(["HEAD", "tab", "--use", "q3=p3", "q3"]).chosen, ["q3"], "the order on the line does not matter");
});

test("--use refuses what would merge the wrong thing: a step the run does not take, an unknown key, a twice-named key, an answer branch, an option", () => {
  usageError(["HEAD", "tab", "q3", "--use", "q14=port/x"], /--use q14: q14 is not merged in this run/);
  usageError(["HEAD", "cookie", "--use", "cookie+expiry=port/x"], /--use cookie\+expiry: cookie\+expiry is not merged in this run/);
  usageError(["HEAD", "tab", "--use", "cookie+expiry=port/x"], /--use cookie\+expiry: cookie\+expiry is not merged in this run/);
  usageError(["HEAD", "tab", "--use", "q9=port/x"], /--use q9: not one of q3, q8, q11, q14, q15, tab, cookie\+expiry/);
  usageError(["HEAD", "tab", "q14", "--use", "q14=a", "--use", "q14=b"], /--use q14: named twice/);
  usageError(["HEAD", "tab", "q14", "--use", "q14=task/q15-body-cap"], /--use q14: task\/q15-body-cap is an answer branch, a port is its own branch/);
  usageError(["HEAD", "tab", "q14", "--use", "q14=task/q14-dm-read-cap"], /an answer branch/);
  usageError(["HEAD", "tab", "q14", "--use", "q14=--strategy=ours"], /--use q14: the ref may not start with a dash/);
  usageError(["HEAD", "tab", "q14", "--use", "q14="], /--use needs <key>=<ref>/);
  usageError(["HEAD", "tab", "q14", "--use", "q14"], /--use needs <key>=<ref>/);
  usageError(["HEAD", "tab", "q14", "--use"], /--use needs <key>=<ref>/);
});
