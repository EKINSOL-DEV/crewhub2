/**
 * Prop requests (spec addendum B): a prop is requested as a loops ticket labelled `prop`, an agent posts the prop as
 * a comment with a fenced `json` block (a comment emits `comment.created`; `attachment.added` is never emitted), and
 * when a **person** moves the ticket to Done the prop enters the town's catalogue with its ticket as provenance.
 * Pure: the app lists the requests with `propRequestsFromFacts`, fetches each ticket and its comments once
 * (`source.getTicket`, `source.getComments`), then calls `extractPropRequest` and `placeFor`.
 *
 * Where the JSON is read: the **most recent** fenced `json` block, searching comments newest first and, inside one
 * comment, the last block. A comment's `bodyMarkdown` is read first; when it is missing, the rich `body` is searched
 * for a code node (`codeBlock` or `code_block`, language `json` or none), because read-model.md documents `RichBody`
 * only as `doc: {string: Any}`. Deleted and system comments are skipped. The most recent block decides: when it is
 * invalid the request is invalid, even if an older block was valid (a correction must be posted again).
 *
 * Where the prop goes (`placeFor`), first match wins:
 * 1. a `place:` line in the ticket body: `place: lobby`, `place: the review room`, `place: desk of cr-dev-2`;
 * 2. a room named in the title after "for", "in", "at", "into" or "to": "Prop: a tall fern for the lobby";
 * 3. otherwise the storage room of the ticket's building.
 * A room goes in the ticket's own building; an agent's desk is wherever that agent works now.
 */
import type { CommentOut, Ticket } from "@crewhub/loops-client";
import { PROP_LIMITS, validatePropModel } from "@crewhub/world-engine";
import type { PropIssue, PropModel } from "@crewhub/world-engine";
import type { Facts } from "./facts.ts";
import type { RoomKind, WorldModel } from "./model.ts";
import type { Attachment, TownDocument } from "./townDocument.ts";

export const PROP_LABEL = "prop";

/** A done prop ticket found in the facts, not yet in the town document. */
export interface PropRequest {
  ticketId: string;
  ticketKey: string;
  /** The project slug (the building). */
  slug: string;
  title: string;
  /** When the person moved it to Done (source time, ms) and who. */
  doneAt: number;
  doneBy: string;
}

export type PropExtraction =
  | { ok: true; prop: PropModel; commentId: string; warnings: PropIssue[] }
  | { ok: false; error: string };

export interface PropPlace {
  at: { building: string; room: RoomKind };
  /** `agent` for "desk of …"; null for ordinary furniture in a room. */
  attachment: Attachment | null;
  /** Which rule chose the place. */
  rule: "place-line" | "title" | "default";
  /** Set when a `place:` line was present but not understood, or its agent is unknown. */
  note: string | null;
}

/** The ticket fields the request reads (`GET /api/tickets/{ref}` returns all of them). */
export type PropTicket = Pick<Ticket, "key" | "title" | "labels" | "bodyMarkdown" | "body"> & {
  project: { slug: string };
};

const hasPropLabel = (labels: readonly { name: string }[] | undefined) => (labels ?? []).some((l) => l.name === PROP_LABEL);

/**
 * The trigger: done prop tickets whose last move to Done was made by a person (`actor.kind === "user"`; agents never
 * move to Done, and a system move does not count), that the document has not imported yet. Oldest Done first. A
 * ticket that was already Done when the stream started has no move fact and is not listed.
 */
export function propRequestsFromFacts(facts: Facts, doc: TownDocument): PropRequest[] {
  const imported = new Set(
    doc.userProps.flatMap((p) => (p.provenance?.kind === "ticket" ? [p.provenance.ticketKey] : [])),
  );
  const requests: (PropRequest & { seq: number })[] = [];
  for (const [ticketId, move] of Object.entries(facts.lastMoves)) {
    if (move.to !== "done" || move.from === "done" || move.actorKind !== "user") continue;
    const fact = facts.cards[ticketId];
    if (!fact || fact.card.status !== "done" || !hasPropLabel(fact.card.labels)) continue;
    if (imported.has(fact.card.key)) continue;
    requests.push({
      seq: move.seq,
      ticketId,
      ticketKey: fact.card.key,
      slug: fact.slug,
      title: fact.card.title,
      doneAt: move.ts,
      doneBy: move.actorId,
    });
  }
  return requests.sort((a, b) => a.seq - b.seq).map(({ seq: _seq, ...request }) => request);
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*json[ \t]*$/i;

/** Every fenced `json` block in a Markdown text, in order. */
export function jsonBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j]!)) body.push(lines[j++]!);
    // An unclosed fence runs to the end of the text, as in CommonMark.
    blocks.push(body.join("\n"));
    i = j;
  }
  return blocks;
}

type Node = { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function nodeText(node: Node): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  const inner = node.content.filter(isNode).map(nodeText);
  // Block nodes (their children are nodes with content) are separated by line breaks.
  const block = node.content.some((c) => isNode(c) && Array.isArray(c.content));
  return inner.join(block ? "\n" : "");
}

/** Code nodes in a rich body (`{doc: {...}}` or the doc itself) whose language is `json` or unset, in order. */
export function richJsonBlocks(body: unknown): string[] {
  const root = isNode(body) && "doc" in body ? (body as { doc: unknown }).doc : body;
  const blocks: string[] = [];
  const walk = (node: unknown) => {
    if (!isNode(node)) return;
    if (node.type === "codeBlock" || node.type === "code_block") {
      const attrs = isNode(node.attrs) ? (node.attrs as Record<string, unknown>) : {};
      const language = attrs["language"] ?? attrs["lang"] ?? null;
      if (language === null || language === "" || (typeof language === "string" && language.toLowerCase() === "json"))
        blocks.push(nodeText(node));
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(root);
  return blocks;
}

/** The plain text of a ticket body: `bodyMarkdown`, else the text of the rich body. */
export function ticketBodyText(ticket: Pick<Ticket, "bodyMarkdown" | "body">): string {
  if (typeof ticket.bodyMarkdown === "string") return ticket.bodyMarkdown;
  const doc = ticket.body?.doc;
  return isNode(doc) ? nodeText(doc) : "";
}

const commentBlocks = (comment: CommentOut): string[] =>
  typeof comment.bodyMarkdown === "string" ? jsonBlocks(comment.bodyMarkdown) : richJsonBlocks(comment.body);

/**
 * Reads the prop from a request's comments (oldest first, as loops returns them) and validates it with the same
 * validator as `npm run prop:validate`. The prop gets the ticket as provenance. Errors are one readable line, as
 * `prop CR-41 is invalid: parts[1].size[0]: must be between 0.01 and 3`.
 */
export function extractPropRequest(ticket: Pick<PropTicket, "key" | "labels">, comments: readonly CommentOut[]): PropExtraction {
  if (!hasPropLabel(ticket.labels)) return { ok: false, error: `ticket ${ticket.key} is not a prop request (no "${PROP_LABEL}" label)` };
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i]!;
    if (comment.deletedAt || comment.kind === "system") continue;
    const block = commentBlocks(comment).at(-1);
    if (block === undefined) continue;
    let json: unknown;
    try {
      json = JSON.parse(block);
    } catch (e) {
      return { ok: false, error: `prop ${ticket.key} is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    const result = validatePropModel(json);
    if (!result.ok) {
      const first = result.errors[0]!;
      const more = result.errors.length - 1;
      return {
        ok: false,
        error: `prop ${ticket.key} is invalid: ${first.path}: ${first.message}${more ? ` (and ${more} more)` : ""}`,
      };
    }
    const prop: PropModel = { ...result.value, provenance: { kind: "ticket", ticketKey: ticket.key } };
    return { ok: true, prop, commentId: comment.id, warnings: result.warnings };
  }
  return { ok: false, error: `prop ${ticket.key} has no json block in its comments` };
}

/**
 * The id the prop gets in the town: its own id, unless another prop (local, or from another ticket) already has
 * it; then the ticket key is appended (`user:reading-lamp-cr-41`). Re-importing the same ticket keeps its id.
 */
export function importedPropId(doc: TownDocument, prop: PropModel): string {
  const owner = doc.userProps.find((p) => p.id === prop.id);
  const sameTicket =
    owner?.provenance?.kind === "ticket" &&
    prop.provenance?.kind === "ticket" &&
    owner.provenance.ticketKey === prop.provenance.ticketKey;
  if (!owner || sameTicket || prop.provenance?.kind !== "ticket") return prop.id;
  const suffix = prop.provenance.ticketKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = prop.id.slice("user:".length, "user:".length + PROP_LIMITS.slugMax - suffix.length - 1).replace(/-+$/, "");
  return `user:${slug}-${suffix}`;
}

const ROOM_NAMES: readonly [RoomKind, readonly string[]][] = [
  ["lobby", ["lobby", "entrance hall", "entrance"]],
  ["lead-office", ["lead's office", "leads office", "lead office", "office"]],
  ["workers", ["workers' room", "workers room", "worker room", "workshop"]],
  ["analyst", ["analyst's room", "analysts room", "analyst room"]],
  ["design", ["design room", "design studio"]],
  ["storage", ["storage room", "storeroom", "store room", "storage"]],
  ["planning", ["planning room", "planning table", "planning"]],
  ["review", ["review room", "review pile", "review"]],
  ["dispatch", ["dispatch"]],
];
/** Every alias, longest first, so "review room" wins over "review". */
const ALIASES = ROOM_NAMES.flatMap(([room, names]) => names.map((name) => ({ room, name }))).sort(
  (a, b) => b.name.length - a.name.length,
);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALIAS_PATTERN = ALIASES.map((a) => escape(a.name)).join("|");
const TITLE_ROOM = new RegExp(`\\b(?:for|in|at|into|to)\\s+(?:the\\s+)?(${ALIAS_PATTERN})(?![\\w'])`, "i");
const PLACE_LINE = /^[ \t]*place:[ \t]*(.+?)[ \t]*$/im;
const DESK_OF = /^(?:the\s+)?desk\s+of\s+(\S+)$/i;

function roomNamed(text: string): RoomKind | null {
  const name = text.toLowerCase().replace(/^the\s+/, "").replace(/[.\s]+$/, "");
  return ALIASES.find((a) => a.name === name)?.room ?? null;
}

function findAgent(model: WorldModel, ref: string) {
  const wanted = ref.toLowerCase();
  const all = [...model.buildings.flatMap((b) => b.agents), ...model.townHall];
  const matches = all.filter((a) => a.key.toLowerCase() === wanted || a.name.toLowerCase() === wanted);
  return matches.find((a) => a.presence === "real") ?? matches[0] ?? null;
}

/** Chooses where an imported prop goes; see the module comment for the rule. */
export function placeFor(ticket: Pick<PropTicket, "title" | "bodyMarkdown" | "body" | "project">, model: WorldModel): PropPlace {
  const building = ticket.project.slug;
  const room = (kind: RoomKind, rule: PropPlace["rule"], note: string | null = null): PropPlace => ({
    at: { building, room: kind },
    attachment: null,
    rule,
    note,
  });
  let note: string | null = null;
  const line = PLACE_LINE.exec(ticketBodyText(ticket))?.[1];
  if (line !== undefined) {
    const desk = DESK_OF.exec(line);
    if (desk) {
      const agent = findAgent(model, desk[1]!);
      if (agent)
        return {
          at: { building: agent.building ?? building, room: agent.building && agent.room ? agent.room : "storage" },
          attachment: { kind: "agent", ref: agent.key },
          rule: "place-line",
          note: agent.building ? null : `${agent.displayName} is in no building now; the prop waits in storage`,
        };
      note = `place: no agent "${desk[1]}" in the town`;
    } else {
      const kind = roomNamed(line);
      if (kind) return room(kind, "place-line");
      note = `place: "${line}" is not a room or "desk of <agent>"`;
    }
  }
  const titled = TITLE_ROOM.exec(ticket.title)?.[1];
  const titledRoom = titled === undefined ? null : roomNamed(titled);
  if (titledRoom) return room(titledRoom, "title", note);
  return room("storage", "default", note);
}
