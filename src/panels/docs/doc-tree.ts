// Pure doc-tree + path logic for the docs panel (M3 T9, EKI-89). No React,
// no IO: list_doc_tree's flat DocEntry list folds into a nested tree, and
// relative markdown hrefs resolve against the current document — escapes
// resolve to null (the backend would reject them anyway; the UI just degrades
// politely first).
import type { DocEntry } from "@/ipc/bindings";

export interface DocNode {
  entry: DocEntry;
  children: DocNode[];
}

/**
 * Fold the flat, `/`-separated entry list into a tree. Input order is
 * preserved within each parent (the backend already sorts dirs-first per
 * level); entries whose parent dir is missing from the list attach to the
 * root rather than vanishing.
 */
export function buildDocTree(entries: DocEntry[]): DocNode[] {
  const roots: DocNode[] = [];
  const byPath = new Map<string, DocNode>();
  for (const entry of entries) {
    const node: DocNode = { entry, children: [] };
    byPath.set(entry.rel_path, node);
    const slash = entry.rel_path.lastIndexOf("/");
    const parent = slash >= 0 ? byPath.get(entry.rel_path.slice(0, slash)) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** Split an href into its path and `#fragment` (fragment kept for display). */
export function splitHref(href: string): { path: string; hash: string } {
  const i = href.indexOf("#");
  return i < 0 ? { path: href, hash: "" } : { path: href.slice(0, i), hash: href.slice(i) };
}

/** True for links that leave the doc tree entirely (http:, mailto:, …). */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * Resolve a relative markdown reference against the doc it appears in.
 * Returns the normalized root-relative path, or null when the reference is
 * absolute or climbs out of the doc root (PathPolicy would reject it anyway).
 */
export function resolveRelative(fromDoc: string, href: string): string | null {
  const { path } = splitHref(href);
  if (path === "") return fromDoc; // pure-fragment link: same doc
  if (path.startsWith("/") || isExternalHref(path)) return null;
  const slash = fromDoc.lastIndexOf("/");
  const baseDir = slash >= 0 ? fromDoc.slice(0, slash) : "";
  const out: string[] = baseDir === "" ? [] : baseDir.split("/");
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null; // escapes the root
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

export function isMarkdownPath(relPath: string): boolean {
  const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
  return ext === "md" || ext === "markdown";
}

export function isImagePath(relPath: string): boolean {
  return IMAGE_EXTENSIONS.includes(relPath.split(".").pop()?.toLowerCase() ?? "");
}

export interface Crumb {
  label: string;
  /** Root-relative path of this segment ("" = the docs root). */
  path: string;
}

/** Breadcrumbs for a selected doc: root + every path segment. */
export function crumbs(relPath: string, rootLabel: string): Crumb[] {
  const out: Crumb[] = [{ label: rootLabel, path: "" }];
  if (!relPath) return out;
  let acc = "";
  for (const seg of relPath.split("/")) {
    acc = acc === "" ? seg : `${acc}/${seg}`;
    out.push({ label: seg, path: acc });
  }
  return out;
}
