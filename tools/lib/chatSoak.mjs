/* The chat soak of `memory.mjs live` (rounds 40, 41 and 45): the Chat panel open on road 1, a paired second tab, the
   fake's person writing to the scenario's agents every few seconds and once in a burst, the host's reads of the
   agents' answers counted from outside, and the Recent answers rows the page adds counted inside it. The pure parts
   live here so `scripts/test/memoryTool.test.ts` can run them in node: the options, the read counter, the agents a
   fake's chat names, the page-side counter's source. Tooling only. */

/** The options `memory.mjs` takes for the chat soak, with their defaults (spread into `cli`'s options and flags). */
export const CHAT_OPTIONS = { "dm-every": "", burst: "0", "burst-at": "" };
export const CHAT_FLAGS = ["paired-tab", "chat-panel"];
export const CHAT_USAGE = "[--paired-tab] [--chat-panel] [--dm-every <s>] [--burst <n> --burst-at <min>]";

/**
 * The chat soak's settings from the parsed options: `pairedTab`, `chatPanel`, `dmEvery` (seconds, null for no sender),
 * `burst` (messages, 0 for none), `burstAt` (the minute whose sample the burst follows, null for none), and `active`,
 * true when anything of the chat is asked for. `fail(message)` is called on a bad value, as `cli`'s is.
 */
export function chatSettings(opts, fail = (message) => { throw new Error(message); }) {
  const number = (name, { integer = false, min = 0 } = {}) => {
    const text = opts[name] ?? "";
    if (text === "") return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) fail(`--${name} takes ${integer ? "a whole number" : "a number"}${min > 0 ? ` of at least ${min}` : ""}, not "${text}"`);
    return value;
  };
  const dmEvery = number("dm-every", { min: 1 });
  const burst = number("burst", { integer: true }) ?? 0;
  const burstAt = number("burst-at");
  if (burst > 0 && burstAt === null) fail("--burst needs --burst-at <min>: the burst goes out right after that minute's sample");
  if (burst === 0 && burstAt !== null) fail("--burst-at needs --burst <n>");
  const pairedTab = Boolean(opts["paired-tab"]);
  const chatPanel = Boolean(opts["chat-panel"]);
  return { pairedTab, chatPanel, dmEvery, burst, burstAt, active: chatPanel || dmEvery !== null || burst > 0 };
}

/**
 * Counts every read of an agent message the host makes toward loops (`GET /api/dm/messages/<id>`), by id: the
 * status, when, how long, and how many were in flight at once (the gate's number). `wrap(fetch)` answers the
 * replacement for `globalThis.fetch`; `tally()` sums; `inWindow(from, ms)` counts the reads of a window by status.
 */
export function createDmReadCounter() {
  const reads = new Map();
  let inFlight = 0;
  let maxInFlight = 0;
  let errors = 0;
  const record = (id, entry) => (reads.get(id) ?? reads.set(id, []).get(id)).push(entry);
  return {
    reads,
    wrap(realFetch) {
      return async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const m = /\/api\/dm\/messages\/([^/?#]+)$/.exec(url);
        if (!m) return realFetch(input, init);
        const id = decodeURIComponent(m[1]);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const at = Date.now();
        try {
          const r = await realFetch(input, init);
          record(id, { status: r.status, at, ms: Date.now() - at });
          return r;
        } catch (error) {
          errors += 1;
          record(id, { status: null, at, ms: Date.now() - at, error: String(error).slice(0, 80) });
          throw error;
        } finally {
          inFlight -= 1;
        }
      };
    },
    tally() {
      let total = 0, once = 0, twice = 0, more = 0, ok = 0, bad = 0;
      for (const list of reads.values()) {
        total += list.length;
        if (list.length === 1) once += 1;
        else if (list.length === 2) twice += 1;
        else more += 1;
        for (const r of list) if (r.status === 200) ok += 1; else bad += 1;
      }
      return { ids: reads.size, total, once, twice, more, ok, bad, inFlight, maxInFlight, errors };
    },
    inWindow(from, ms) {
      const statuses = {};
      let count = 0, slowest = 0, sum = 0;
      for (const list of reads.values()) for (const r of list) if (r.at >= from && r.at < from + ms) { count += 1; sum += r.ms; slowest = Math.max(slowest, r.ms); statuses[r.status ?? "error"] = (statuses[r.status ?? "error"] ?? 0) + 1; }
      return { count, statuses, meanMs: count ? Math.round(sum / count) : 0, slowestMs: slowest };
    },
  };
}

/**
 * The agents the soak writes to, in turn: the scenario's lead agents (`GET /api/agents`, `role: "lead"`, not an
 * external bot and not the world's own key bot), the ones the demo's person chats with (rounds 40 and 41: g-man,
 * cr-lead, cl-lead in the small team), falling back to the agents of the threads the key reads (`GET /api/dm/threads`).
 * `fetchImpl` is the process's fetch; the key goes in the bearer header and never anywhere else.
 */
export async function chatAgents(fake, fetchImpl = globalThis.fetch) {
  const headers = { authorization: `Bearer ${fake.key}` };
  const agents = await fetchImpl(`${fake.url}/api/agents`, { headers });
  if (!agents.ok) throw new Error(`the fake's agents list answered ${agents.status}`);
  const leads = ((await agents.json()).agents ?? []).filter((a) => a.role === "lead" && !a.external && a.id !== fake.keyName && a.id !== "crewhub-world").map((a) => a.id);
  if (leads.length > 0) return leads;
  const threads = await fetchImpl(`${fake.url}/api/dm/threads`, { headers });
  if (!threads.ok) throw new Error(`the fake's threads list answered ${threads.status}`);
  const ids = ((await threads.json()).threads ?? []).map((t) => t.agentId ?? t.agent?.id ?? t.id).filter((id) => typeof id === "string" && id !== "");
  if (ids.length === 0) throw new Error("the fake's chat names no agent: does its key read the chat?");
  return ids;
}

/** The sender's next message: the agents in turn, the text saying which message and when. */
export function nextDm(agents, sent, now = new Date()) {
  return { agent: agents[sent % agents.length], text: `soak ${sent + 1} at ${now.toTimeString().slice(0, 8)}` };
}

/**
 * Installed in the page once the Chat panel is open: counts the `li` rows added under `.recent-list` (the page's
 * answers) and keeps the last `keep` labels and nothing more (round 41's uncapped list was 0.3 MB of the heap after
 * three hours). Read back with `readPageChat`. A plain function body, so `page.evaluate` takes it.
 */
export function pageChatCounter(keep = 20) {
  return `(() => {
    const state = { rows: 0, labels: [], keep: ${keep} };
    window.__worldChatSoak = state;
    const seen = (node) => {
      if (!(node instanceof HTMLLIElement) || !node.parentElement || !node.parentElement.classList.contains("recent-list")) return;
      state.rows += 1;
      const row = node.querySelector(".recent-row");
      state.labels.push(row ? row.getAttribute("aria-label") || "" : "");
      if (state.labels.length > state.keep) state.labels.splice(0, state.labels.length - state.keep);
    };
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        seen(n);
        if (n instanceof HTMLElement && n.classList.contains("recent-list")) for (const li of n.children) seen(li);
      }
    }).observe(document.body, { childList: true, subtree: true });
    return true;
  })()`;
}

/** What `pageChatCounter` keeps, read in the page: `{ rows, labels }`, or null before it is installed. */
export const READ_PAGE_CHAT = "(() => (window.__worldChatSoak ? { rows: window.__worldChatSoak.rows, labels: window.__worldChatSoak.labels.slice() } : null))()";

/** The host's lines that say a read was lost or tried again (the gate's log, `apps/host/src/dmReads.ts` where it is). */
export function lostAndRetried(lines) {
  const lost = lines.filter((l) => /\blost\b/i.test(l));
  return { lost: lost.length, retried: lines.filter((l) => /\bretr(y|ied)\b/i.test(l) && !lost.includes(l)).length };
}

/** One line of the chat counts, as the tool prints it on every sample. */
export function formatChat(chat) {
  const r = chat.reads;
  return `chat sent ${chat.sent}${chat.burstSent ? ` (burst ${chat.burstSent})` : ""} reads ${r.ids} ids/${r.total} total (twice ${r.twice}, bad ${r.bad}, in flight ${r.inFlight}, max ${r.maxInFlight}) rows ${chat.rows}${chat.lost ? ` lost ${chat.lost}` : ""}`;
}
