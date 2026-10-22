/* domdiff.ts: what changed in the DOM between two samples of a long run (round 29, the soak's DOM excursion).
   `domInventory` runs inside the page (self-contained, so `page.evaluate(domInventory)` works) and names every node
   in one short line. An element: tag, id, up to three classes, a label (aria-label, data-anchor, role or title,
   shortened) and the nearest named landmark above it (a landmark tag, or an ancestor with an aria-label, data-anchor,
   id or role). A text node or a comment: `#text in <its parent element>`, since the counters count those too and a
   React text child comes and goes without an element. Shadow roots are walked. `domDiff` compares two inventories as
   multisets: the nodes added and removed, grouped with counts, the largest first. `capDomDiff` keeps a few entries for
   the JSON and `formatDomDiff` says them in one line for the log. Tested by scripts/test/domdiff.test.ts. */

export interface DomChange {
  what: string;
  count: number;
}

export interface DomDiff {
  /** Nodes after minus nodes before, as the inventory counts them (elements, text nodes and comments). */
  nodes: number;
  added: DomChange[];
  removed: DomChange[];
  /** Entries left out by `capDomDiff`; 0 when nothing was cut. */
  more: number;
}

/** Runs in the page: one line per node in document order. Keep it self-contained (no module-scope names). */
export function domInventory(root?: Node): string[] {
  const start = root ?? document;
  const landmarkTags = ["main", "nav", "header", "footer", "aside", "dialog", "section", "form"];
  const describe = (el: Element): string => {
    const classes = (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((c) => c !== "")
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
    const id = el.getAttribute("id");
    const label = el.getAttribute("aria-label") ?? el.getAttribute("data-anchor") ?? el.getAttribute("role") ?? el.getAttribute("title");
    const short = label === null ? "" : `[${label.length > 40 ? `${label.slice(0, 39)}…` : label}]`;
    return `${el.tagName.toLowerCase()}${id === null || id === "" ? "" : `#${id}`}${classes}${short}`;
  };
  const named = (el: Element): boolean =>
    landmarkTags.includes(el.tagName.toLowerCase()) || el.hasAttribute("aria-label") || el.hasAttribute("data-anchor") || el.hasAttribute("id") || el.hasAttribute("role");
  // The nearest named ancestor, or `outside` when the chain ends (the document, or a shadow tree's host).
  const landmarkOf = (el: Element, outside: string): string => {
    for (let above = el.parentElement; above !== null; above = above.parentElement) if (named(above)) return describe(above);
    return outside;
  };
  const out: string[] = [];
  const walk = (node: Node, parent: Element | null, outside: string): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        const el = child as Element;
        out.push(`${describe(el)} in ${landmarkOf(el, outside)}`);
        const shadow = (el as { shadowRoot?: ShadowRoot | null }).shadowRoot;
        if (shadow) walk(shadow, el, describe(el));
        walk(el, el, outside);
      } else {
        out.push(`${child.nodeName.toLowerCase()} in ${parent === null ? "document" : describe(parent)}`);
      }
    }
  };
  walk(start, start.nodeType === 1 ? (start as Element) : null, "document");
  return out;
}

/** The nodes added and removed between two inventories, grouped by their line, the largest group first. */
export function domDiff(before: string[], after: string[]): DomDiff {
  const tally = (list: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const line of list) counts.set(line, (counts.get(line) ?? 0) + 1);
    return counts;
  };
  const was = tally(before);
  const is = tally(after);
  const added: DomChange[] = [];
  const removed: DomChange[] = [];
  for (const [what, n] of is) {
    const count = n - (was.get(what) ?? 0);
    if (count > 0) added.push({ what, count });
  }
  for (const [what, n] of was) {
    const count = n - (is.get(what) ?? 0);
    if (count > 0) removed.push({ what, count });
  }
  const largestFirst = (x: DomChange, y: DomChange): number => y.count - x.count || x.what.localeCompare(y.what);
  added.sort(largestFirst);
  removed.sort(largestFirst);
  return { nodes: after.length - before.length, added, removed, more: 0 };
}

/** At most `cap` entries in all (the added ones first), the rest counted in `more`. */
export function capDomDiff(diff: DomDiff, cap = 6): DomDiff {
  const added = diff.added.slice(0, cap);
  const removed = diff.removed.slice(0, Math.max(0, cap - added.length));
  return { nodes: diff.nodes, added, removed, more: diff.more + diff.added.length - added.length + diff.removed.length - removed.length };
}

/** One line: the node delta, then each entry as `+3 span.rule-tag in div.anchor[...]`, and how many were left out. */
export function formatDomDiff(diff: DomDiff): string {
  const sign = (n: number): string => (n > 0 ? `+${n}` : String(n));
  const entries = [...diff.added.map((c) => `+${c.count} ${c.what}`), ...diff.removed.map((c) => `-${c.count} ${c.what}`)];
  const more = diff.more > 0 ? ` and ${diff.more} more` : "";
  if (entries.length === 0) return `nodes ${sign(diff.nodes)}, nothing in the document tree added or removed${more}`;
  return `nodes ${sign(diff.nodes)}: ${entries.join(", ")}${more}`;
}
