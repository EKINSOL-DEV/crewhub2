/* Round 34: the chat road's reading of the host's health under fuzz. The page reads `connection.session.state`
   (`hostKeyReadsChatOf`) and `loopsWebUrl` (`loopsOriginOf`) from whatever the host answers, decides the road, and says
   its words for every probe verdict. Seeded, a few thousand inputs: health of any shape, URLs of every odd spelling,
   probe values outside the set, origins of odd text. What a caller sees: never a throw; the host's word read as
   true, false or null; an origin that is an origin or null; a road from the set; words that are sentences without
   "undefined" in them. */
import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_PROBES, cardAnswersEmpty, chatGlance, chatPlaceLine, chatRoadView, chatWords, chatWordsLine, decideChatRoad, hostKeyReadsChatOf, noneWords, recentEmptyWords, type PageProbe } from "../src/state/chatRoad.ts";
import { healthRereadKey, loopsOriginOf } from "../src/state/pageChat.ts";
import { Fuzz, ODD_STRINGS, protoSnapshot, replay } from "../../../packages/world-engine/test/fuzz.ts";

const SEEDS = [34_041, 34_042, 34_043];
const HEALTH = { ok: true, loopsWebUrl: "http://127.0.0.1:8291/", connection: { discovery: { state: "found" }, key: { state: "ok" }, stream: { state: "ok" }, session: { state: "key" } } };
const ODD_URLS = ["http://[", "http://", "https://", "http:///x", "http://a b", "http://example.com:99999", "http://x:-1", "HTTP://X", "ftp://x", "javascript:alert(1)", "http://127.0.0.1:5180/path?q=1#f", "http://user:pw@host/", "http://xn--80ak6aa92e.com", "http://１２７.0.0.1", "http://[::1]:8291", "http://%", "http://a\0b", "http://\uD800", " http://x", "http://x ", ...ODD_STRINGS];

test("round 34 fuzz: health of any shape is read as the host's word (true, false, null) and a loops origin or null, never a throw", () => {
  const before = protoSnapshot();
  const words = new Map<string, number>();
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 600; i += 1) {
      const health = f.bool(0.3) ? f.value(4) : f.mutate(HEALTH, f.int(1, 3));
      let word: boolean | null;
      let origin: string | null;
      try {
        word = hostKeyReadsChatOf(health as Parameters<typeof hostKeyReadsChatOf>[0]);
        origin = loopsOriginOf(health as Parameters<typeof loopsOriginOf>[0]);
      } catch (error) {
        assert.fail(`${replay(seed, i, health)} threw ${String(error)}`);
      }
      words.set(String(word), (words.get(String(word)) ?? 0) + 1);
      assert.ok(word === true || word === false || word === null, replay(seed, i, health));
      assert.ok(origin === null || (typeof origin === "string" && new URL(origin).origin === origin && /^https?:\/\//.test(origin)), `${replay(seed, i, health)}: origin ${origin}`);
    }
  }
  assert.ok((words.get("true") ?? 0) > 50 && (words.get("false") ?? 0) > 50 && (words.get("null") ?? 0) > 50, `the mix: ${JSON.stringify([...words])}`);
  for (const url of ODD_URLS) {
    let origin: string | null;
    try {
      origin = loopsOriginOf({ loopsWebUrl: url });
    } catch (error) {
      assert.fail(`loopsWebUrl ${JSON.stringify(url)} threw ${String(error)}`);
    }
    assert.ok(origin === null || new URL(origin).origin === origin, `${JSON.stringify(url)} -> ${origin}`);
  }
  assert.equal(loopsOriginOf({ loopsWebUrl: "http://127.0.0.1:5180/path?q=1#f" }), "http://127.0.0.1:5180");
  assert.equal(loopsOriginOf({ loopsWebUrl: "http://[::1]:8291" }), "http://[::1]:8291");
  assert.equal(loopsOriginOf({ loopsWebUrl: "HTTP://X" }), null, "the scheme is spelt lowercase or it is not a loops web url");
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: a probe value outside the set, a host word of any kind and an origin of odd text still give a road from the set and whole sentences", () => {
  const before = protoSnapshot();
  const roads = new Map<string, number>();
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 400; i += 1) {
      const pageProbe = (f.bool(0.6) ? f.pick(PAGE_PROBES) : f.bool() ? f.string() : f.value(1)) as PageProbe;
      const hostKeyReadsChat = (f.bool(0.6) ? f.pick([true, false, null]) : f.value(1)) as boolean | null;
      const pageOrigin = f.bool(0.5) ? "http://127.0.0.1:5298" : f.pick(ODD_URLS.filter((u) => !/undefined|NaN|object/.test(u)));
      let texts: string[];
      try {
        const road = decideChatRoad({ hostKeyReadsChat, pageProbe });
        roads.set(road, (roads.get(road) ?? 0) + 1);
        assert.ok(road === "key" || road === "page" || road === "none", replay(seed, i, { hostKeyReadsChat, pageProbe }));
        assert.equal(road, hostKeyReadsChat === true ? "key" : pageProbe === "on" ? "page" : "none", replay(seed, i, { hostKeyReadsChat, pageProbe }));
        const view = chatRoadView({ hostKeyReadsChat, pageProbe, pageOrigin });
        const none = noneWords(view);
        const w = chatWords(view);
        texts = [w.bubbles, w.typing, chatWordsLine(view), chatGlance(view), recentEmptyWords("live", view), recentEmptyWords("demo", view), cardAnswersEmpty("live", view), cardAnswersEmpty("demo", view), chatPlaceLine("live", view), chatPlaceLine("demo", view), none.reason, none.way];
      } catch (error) {
        assert.fail(`${replay(seed, i, { hostKeyReadsChat, pageProbe, pageOrigin })} threw ${String(error)}`);
      }
      for (const text of texts) assert.ok(typeof text === "string" && text.length > 10 && !/undefined|\[object |NaN/.test(text), replay(seed, i, { pageProbe, text }));
      assert.ok(/[.!]$/.test(chatWordsLine(view(f, hostKeyReadsChat, pageProbe, pageOrigin))), replay(seed, i));
    }
  }
  assert.ok((roads.get("key") ?? 0) > 50 && (roads.get("page") ?? 0) > 20 && (roads.get("none") ?? 0) > 50, `the mix: ${JSON.stringify([...roads])}`);
  for (const a of [null, "live", "down", "", "x", 1 as unknown as string]) for (const b of [null, "ok", "rejected", "", "\0"]) {
    const key = healthRereadKey(a, b);
    assert.ok(key === null || (typeof key === "string" && /^(live|off):/.test(key)), `${a}/${b}`);
  }
  assert.equal(protoSnapshot(), before);
});

const view = (_f: Fuzz, hostKeyReadsChat: boolean | null, pageProbe: PageProbe, pageOrigin: string) => chatRoadView({ hostKeyReadsChat, pageProbe, pageOrigin });
