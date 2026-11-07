/**
 * What kind of bot the key's principal is, read once from `GET /api/agents` (round 61, H5): the key's own entry, the
 * one whose `id` is the key's agent name, says it. A viewer (`viewer: true`; round 12's `world/viewer-key`, L1: a
 * loops from before has no such field) reads the chat of the person who made it and writes nothing; a read-only bot
 * (`reader: true`, CL-313) reads tickets only, so the board answers it 403; a plain external bot (`external: true`,
 * CL-314) could write, which the host's GET-only allow-list is what prevents; anything else listed is an agent with a
 * lane; a key loops does not list is `unknown`. The flags' precedence is viewer, reader, external: a viewer key reads
 * the chat whatever else loops flags it (the chat path's rule since round 12).
 *
 * The two readers of this fact go through here: the chat path asks the kind (`chatPath.ts`, `ask`: a viewer's threads
 * are read, no one else's), the doctor prints the words (`doctor.ts`, the agents line). The body is read leniently, as
 * every loops answer is: a list that is no list, an entry that is no object or a flag that is not `true` is read as
 * absent, never thrown on. Tests: `keyBot.test.ts` pins the kinds and the words.
 */
export type KeyBotKind = "viewer" | "reader" | "external" | "lane" | "unknown";

export interface KeyBot {
  kind: KeyBotKind;
  /** The key's agent name, as asked. */
  id: string;
  /** The entry's `role` where it is a string; null for an unknown bot or an entry without one. */
  role: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The key's own entry in the `GET /api/agents` body, read as its kind. */
export function readKeyBot(agentsBody: unknown, keyName: string): KeyBot {
  const agents = isObject(agentsBody) && Array.isArray(agentsBody.agents) ? (agentsBody.agents as unknown[]) : [];
  const mine = agents.find((a): a is Record<string, unknown> => isObject(a) && a.id === keyName);
  if (mine === undefined) return { kind: "unknown", id: keyName, role: null };
  const role = typeof mine.role === "string" ? mine.role : null;
  const kind: KeyBotKind = mine.viewer === true ? "viewer" : mine.reader === true ? "reader" : mine.external === true ? "external" : "lane";
  return { kind, id: keyName, role };
}

/** The doctor's sentence about the key's bot; empty for a bot loops does not list. A lane's role is `lead` unless said. */
export function keyBotWords(bot: KeyBot): string {
  switch (bot.kind) {
    case "viewer":
      return `${bot.id} is a viewer: it reads what the world needs and writes nothing`;
    case "reader":
      return "this key's bot is read-only: the board will answer 403";
    case "external":
      return `${bot.id} is an external bot, not read-only: it could write, the host sends GETs only`;
    case "lane":
      return `${bot.id} is a ${bot.role ?? "lead"} agent with a lane, not an external bot (it works, but an external bot is the intended key)`;
    case "unknown":
      return "";
  }
}
