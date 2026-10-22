/* The DOM diff behind tools/memory.mjs (tools/lib/domdiff.ts, round 29): the in-page inventory names an element by
   tag, id, classes, label and the nearest named landmark, a text node by its parent; the diff of two inventories lists
   what was added and removed with counts; the cap and the one-line form. The inventory is tried on a small fake tree
   that answers only what the function asks of the DOM (no browser here). */
import assert from "node:assert/strict";
import test from "node:test";
import { capDomDiff, domDiff, domInventory, formatDomDiff } from "../../tools/lib/domdiff.ts";

interface Fake {
  nodeType: number;
  nodeName: string;
  tagName: string;
  attrs: Record<string, string>;
  childNodes: Fake[];
  parentElement: Fake | null;
  shadowRoot?: Fake;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

const el = (tag: string, attrs: Record<string, string> = {}, children: Fake[] = []): Fake => {
  const node: Fake = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    attrs,
    childNodes: children,
    parentElement: null,
    getAttribute: (name) => (Object.hasOwn(attrs, name) ? (attrs[name] ?? null) : null),
    hasAttribute: (name) => Object.hasOwn(attrs, name),
  };
  for (const child of children) child.parentElement = node;
  return node;
};
const text = (): Fake => ({ nodeType: 3, nodeName: "#text", tagName: "", attrs: {}, childNodes: [], parentElement: null, getAttribute: () => null, hasAttribute: () => false });
const comment = (): Fake => ({ ...text(), nodeType: 8, nodeName: "#comment" });

/** A document-like root over the given top-level nodes. */
const doc = (...top: Fake[]): Node => ({ nodeType: 9, nodeName: "#document", childNodes: top }) as unknown as Node;

test("domInventory: elements by tag, id, up to three classes, a shortened label and the nearest named landmark; text by its parent; shadow roots walked", () => {
  const host = el("x-widget", {}, [text()]);
  host.shadowRoot = el("#shadow-root", {}, [el("b", { class: "inner" })]);
  const page = doc(
    el("div", { id: "root" }, [
      el("nav", { "aria-label": "Jump list" }, [el("button", { class: "btn primary big wide" }, [text()])]),
      el("div", { class: "anchor", "data-anchor": "rule:crewhub:1" }, [el("span", { class: "rule-tag", title: "Release crates: 2" }, [text(), text()])]),
      el("div", { class: "plain" }, [el("p", {}, [el("svg", { class: "icon icon-sm", role: "img" })]), comment()]),
      el("section", {}, [el("h2", { title: "a label well over forty characters long, which is cut" })]),
      host,
    ]),
  );
  assert.deepEqual(domInventory(page as unknown as Node), [
    "div#root in document",
    "nav[Jump list] in div#root",
    "button.btn.primary.big in nav[Jump list]",
    "#text in button.btn.primary.big",
    "div.anchor[rule:crewhub:1] in div#root",
    "span.rule-tag[Release crates: 2] in div.anchor[rule:crewhub:1]",
    "#text in span.rule-tag[Release crates: 2]",
    "#text in span.rule-tag[Release crates: 2]",
    "div.plain in div#root",
    "p in div#root",
    "svg.icon.icon-sm[img] in div#root",
    "#comment in div.plain",
    "section in div#root",
    "h2[a label well over forty characters long…] in section",
    "x-widget in div#root",
    "b.inner in x-widget",
    "#text in x-widget",
  ]);
});

test("domDiff: the nodes added and removed as multisets, grouped with counts, the largest group first", () => {
  const before = ["a in x", "b in x", "b in x", "c in x"];
  const after = ["a in x", "b in x", "d in x", "d in x", "d in x", "e in x"];
  assert.deepEqual(domDiff(before, after), {
    nodes: 2,
    added: [
      { what: "d in x", count: 3 },
      { what: "e in x", count: 1 },
    ],
    removed: [
      { what: "b in x", count: 1 },
      { what: "c in x", count: 1 },
    ],
    more: 0,
  });
  assert.deepEqual(domDiff(before, before), { nodes: 0, added: [], removed: [], more: 0 }, "the same inventory: nothing");
});

test("capDomDiff and formatDomDiff: a few entries, the added ones first, the rest counted; one line", () => {
  const diff = domDiff(["r1 in x", "r2 in x"], ["a1 in x", "a2 in x", "a2 in x", "a3 in x", "a4 in x", "a5 in x"]);
  assert.equal(formatDomDiff(diff), "nodes +4: +2 a2 in x, +1 a1 in x, +1 a3 in x, +1 a4 in x, +1 a5 in x, -1 r1 in x, -1 r2 in x");
  const capped = capDomDiff(diff, 6);
  assert.equal(capped.added.length, 5);
  assert.equal(capped.removed.length, 1);
  assert.equal(capped.more, 1);
  assert.equal(formatDomDiff(capped), "nodes +4: +2 a2 in x, +1 a1 in x, +1 a3 in x, +1 a4 in x, +1 a5 in x, -1 r1 in x and 1 more");
  const tight = capDomDiff(diff, 2);
  assert.deepEqual(tight.added.map((c) => c.what), ["a2 in x", "a1 in x"]);
  assert.deepEqual(tight.removed, []);
  assert.equal(tight.more, 5);
  assert.equal(formatDomDiff(domDiff(["a in x"], ["a in x"])), "nodes 0, nothing in the document tree added or removed");
});
