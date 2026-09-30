/**
 * The demo fetch layer: answers the crewhub-loops routes the chat bubbles call
 * (`loops:apps/web/src/components/bubbles/queries.ts`) from a DemoSource, in loops' shapes and
 * with loops' error envelope. Pure: no fetch, no DOM, no storage. The world routes its `api`
 * adapter here in demo mode; pins persistence is the caller's (`onPinsChange`).
 *
 * The rules follow loops' `api/routers/dm.py` and `domain/dm.py`: chat is with enabled lead
 * agents only, pins default to the crewhub lead while the person has never pinned (here: the lead
 * of the building in view, see `setView`), messages page newest-last with a `before` cursor.
 */
import type { AgentOut, DmMessage } from "@crewhub/loops-client";
import type { DemoSource } from "./source.ts";

export type DemoChatSource = Pick<
  DemoSource,
  "getAgents" | "getAgentSummary" | "getDmMessages" | "getDmThreads" | "sendDm" | "markDmRead"
>;

export interface DemoApiResponse {
  status: number;
  body: unknown;
}

export interface DemoApiOptions {
  /** The person's saved pins; `null` (the default) means they never pinned. */
  pins?: string[] | null;
  /** Called after a successful `PUT /api/me/bubbles`, with the saved pins. */
  onPinsChange?: (pins: string[]) => void;
  /** Stands for loops' public URL in the summary links. Default `""`. */
  baseUrl?: string;
}

export interface DemoView {
  /** The lead of the building in view, or `null` in the town view. */
  leadId: string | null;
}

export interface DemoApi {
  handle(method: string, path: string, body?: unknown): Promise<DemoApiResponse>;
  /** Tells the API what the person looks at: the default head follows it until they pin. */
  setView(view: DemoView): void;
}

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const MAX_PINS = 100;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

class RouteError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ok = (body: unknown, status = 200): DemoApiResponse => ({ status, body });
const failure = (status: number, code: string, message: string): DemoApiResponse => ({
  status,
  body: { error: { code, message, detail: null } },
});

export function createDemoApi(source: DemoChatSource, options: DemoApiOptions = {}): DemoApi {
  let pins: string[] | null = options.pins === undefined || options.pins === null ? null : [...options.pins];
  let view: DemoView = { leadId: null };
  const baseUrl = options.baseUrl ?? "";

  const leads = async (): Promise<AgentOut[]> => (await source.getAgents()).filter((a) => a.role === "lead" && !a.disabled);

  /** dm.py `_agent`: 404 for an unknown agent, 403 for one that is not an enabled lead. */
  async function requireLead(id: string): Promise<void> {
    const agent = (await source.getAgents()).find((a) => a.id === id);
    if (agent === undefined) throw new RouteError(404, "not_found", "Agent not found");
    if (agent.disabled || agent.role !== "lead") throw new RouteError(403, "forbidden", "Chat requires an enabled lead");
  }

  async function currentPins(): Promise<string[]> {
    if (pins !== null) return [...pins];
    const enabled = await leads();
    const inView = enabled.find((a) => a.id === view.leadId);
    if (inView !== undefined) return [inView.id];
    return enabled.filter((a) => a.isCrewhubLead === true).map((a) => a.id);
  }

  async function messagesPage(agent: string, query: URLSearchParams) {
    const all: DmMessage[] = await source.getDmMessages(agent);
    const limit = query.has("limit") ? Number(query.get("limit")) : PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) throw new RouteError(400, "validation_error", "Invalid limit");
    let end = all.length;
    const before = query.get("before");
    if (before !== null) {
      end = all.findIndex((m) => m.id === before);
      if (end === -1) throw new RouteError(400, "validation_error", "Cursor belongs to another thread");
    }
    const start = Math.max(0, end - limit);
    const page = all.slice(start, end);
    return { messages: page, nextCursor: start > 0 ? (page[0]?.id ?? null) : null };
  }

  async function route(method: string, path: string, body: unknown): Promise<DemoApiResponse> {
    const url = new URL(path, "http://demo.invalid");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const [api, , second, third] = parts;
    if (api !== "api") throw new RouteError(404, "not_found", "Not found");
    const at = (...expected: string[]) => parts.length === expected.length + 1 && expected.every((p, i) => p === "*" || parts[i + 1] === p);
    const only = (allowed: string) => {
      if (method !== allowed) throw new RouteError(405, "method_not_allowed", "Method not allowed");
    };

    if (at("features", "global", "*")) {
      only("GET");
      if (third !== "bubbles") throw new RouteError(404, "not_found", "Feature not found");
      return ok({
        feature: { key: "bubbles", label: "Chat bubbles", type: "bool", value: true, default: false, revision: 1, updatedAt: null, updatedBy: null },
      });
    }
    if (at("me", "bubbles")) {
      if (method === "GET") return ok({ pinnedAgentIds: await currentPins() });
      only("PUT");
      const wanted = (body as { pinnedAgentIds?: unknown } | null)?.pinnedAgentIds;
      if (!Array.isArray(wanted) || !wanted.every((id) => typeof id === "string") || wanted.length > MAX_PINS || new Set(wanted).size !== wanted.length)
        throw new RouteError(400, "validation_error", "Invalid pins");
      for (const id of wanted as string[]) await requireLead(id);
      pins = [...(wanted as string[])];
      options.onPinsChange?.([...pins]);
      return ok({ pinnedAgentIds: [...pins] });
    }
    if (at("dm", "threads")) {
      only("GET");
      return ok({ threads: await source.getDmThreads() });
    }
    if (at("dm", "threads", "*", "messages")) {
      const agent = third as string;
      await requireLead(agent);
      if (method === "GET") return ok(await messagesPage(agent, url.searchParams));
      only("POST");
      const request = (body ?? {}) as { bodyMarkdown?: unknown; clientId?: unknown };
      const clientId = request.clientId;
      if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) throw new RouteError(400, "validation_error", "Invalid clientId");
      const text = typeof request.bodyMarkdown === "string" ? request.bodyMarkdown.trim() : "";
      if (text === "") throw new RouteError(400, "validation_error", "A message needs a body");
      const earlier = (await source.getDmMessages(agent)).find((m) => m.clientId === clientId && m.author.kind === "user");
      if (earlier !== undefined && earlier.bodyMarkdown !== text) throw new RouteError(409, "conflict", "clientId already identifies another message");
      return ok({ message: source.sendDm(agent, text, clientId) });
    }
    if (at("dm", "threads", "*", "read")) {
      only("PUT");
      const agent = third as string;
      await requireLead(agent);
      const id = (body as { lastReadMessageId?: unknown } | null)?.lastReadMessageId;
      if (typeof id !== "string") throw new RouteError(400, "validation_error", "lastReadMessageId is required");
      const message = (await source.getDmMessages(agent)).find((m) => m.id === id);
      if (message === undefined) throw new RouteError(400, "validation_error", "Read cursor belongs to another thread");
      source.markDmRead(agent, message.clientId);
      return ok(null, 204);
    }
    if (at("agents")) {
      only("GET");
      return ok({ agents: await source.getAgents() });
    }
    if (at("agents", "*", "summary")) {
      only("GET");
      const agent = second as string;
      await requireLead(agent);
      return ok(await source.getAgentSummary(agent, baseUrl));
    }
    throw new RouteError(404, "not_found", "Not found");
  }

  return {
    async handle(method, path, body) {
      try {
        return await route(method.toUpperCase(), path, body);
      } catch (error) {
        if (error instanceof RouteError) return failure(error.status, error.code, error.message);
        throw error;
      }
    },
    setView(next) {
      view = { leadId: next.leadId };
    },
  };
}
