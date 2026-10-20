/**
 * loops-seed: replays a demo scenario's storyline (`packages/demo`) into the DEVELOPMENT crewhub-loops through its API,
 * so the world shows real data that moves. It writes as an external bot (a lead agent's key), never as a person.
 *
 *   node tools/loops-seed.mjs [--url http://127.0.0.1:8291] [--key-file <file>] [--scenario small-team] [--speed 16]
 *                             [--once] [--projects <n>] [--dry-run] [--restart] [--no-rewind] [--out tools/out]
 *
 *   --url        The development loops. Only this machine, only plain http, never port 8091, 8000 or 9443.
 *   --key-file   The bot's key file (default $CREWHUB_WORLD_KEY_FILE). The key is a bearer token; no Origin is sent.
 *   --scenario   A demo scenario id (`fresh`, `one`, `small-team`, `studio`); default the demo's default.
 *   --speed      1 = the storyline's own pace (16 minutes a pass), 16 = a minute a pass (default).
 *   --once       One pass, then stop. Without it the storyline loops until Ctrl+C.
 *   --projects   Only the first n projects of the scenario (its sidebar order); the rest is skipped.
 *   --dry-run    Reads loops, prints the plan (what exists, what would be created, what is replayed or not), writes nothing.
 *   --restart    Forget where the last run stopped (`<out>/loops-seed.state.json`) and start the storyline from 0:00.
 *   --no-rewind  Do not move the seed tickets back to their seed column before a second pass.
 *
 * Idempotent: projects are found by slug (never created: that is the admin's, see the plan it prints), tickets by
 * title within their project; a run that stopped resumes at the next storyline entry. What a lead agent may not write
 * (a move into Done, projects, labels, milestones, releases, lanes, the chat) is skipped with loops' reason and listed:
 * the Done moves in `<out>/loops-seed-person-only.json`, for a person to apply. Stop it with Ctrl+C (one is enough).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, "..");
const USAGE = "node tools/loops-seed.mjs [--url <origin>] [--key-file <file>] [--scenario <id>] [--speed <n>] [--once] [--projects <n>] [--dry-run] [--restart] [--no-rewind] [--out <dir>]";

const seedLib = await import(pathToFileURL(path.join(TOOLS, "lib", "seed.ts")).href);
const { DEFAULT_URL, checkUrl, readKey, classify, seedTicketRequest, createTicketRequest, moveRequest, assignRequest, waitOnRequest, labelsRequest, commentRequest, progressRequest, resolveHandle, convergeMoves, schedule, tally, clock, PERSON_ONLY_DONE } = seedLib;
const { demoScenario, demoScenarios, parseScenarioId, SCENARIO_IDS } = await import(pathToFileURL(path.join(REPO, "packages", "demo", "src", "scenarios.ts")).href);
const { DEMO_SEED, buildStory } = await import(pathToFileURL(path.join(REPO, "packages", "demo", "src", "script.ts")).href);

// Command line

let args;
try {
  args = parseArgs({
    options: {
      url: { type: "string", default: DEFAULT_URL },
      "key-file": { type: "string" },
      scenario: { type: "string" },
      speed: { type: "string", default: "16" },
      once: { type: "boolean", default: false },
      projects: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      restart: { type: "boolean", default: false },
      "no-rewind": { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  console.error(`${error.message}\n\nusage: ${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(`usage: ${USAGE}\n\nThe comment at the top of tools/loops-seed.mjs is the manual.`);
  process.exit(0);
}
const fail = (message) => {
  console.error(`loops-seed: ${message}`);
  process.exit(2);
};

const urlVerdict = checkUrl(args.url);
if (!urlVerdict.ok) fail(`refusing --url ${args.url}: ${urlVerdict.reason}`);
const ORIGIN = urlVerdict.origin;
const speed = Number(args.speed);
if (!(speed > 0)) fail("--speed must be a number above 0");
const scenarioId = args.scenario === undefined ? parseScenarioId(null) : args.scenario;
if (!SCENARIO_IDS.includes(scenarioId)) fail(`unknown scenario ${scenarioId}; known: ${demoScenarios().map((s) => s.id).join(", ")}`);
const projectCap = args.projects === undefined ? Infinity : Number(args.projects);
if (!(projectCap > 0)) fail("--projects must be a number above 0");
const dryRun = args["dry-run"];
const OUT = path.resolve(args.out ?? path.join(TOOLS, "out"));
mkdirSync(OUT, { recursive: true });
const STATE_FILE = path.join(OUT, "loops-seed.state.json");
const PERSON_FILE = path.join(OUT, "loops-seed-person-only.json");

const keyFile = args["key-file"] ?? process.env.CREWHUB_WORLD_KEY_FILE;
if (keyFile === undefined) fail("no key: give --key-file <file> or set CREWHUB_WORLD_KEY_FILE (the seed bot's external-bot key)");
let KEY;
try {
  KEY = readKey(readFileSync(keyFile, "utf8"));
} catch (error) {
  fail(`cannot use the key file ${keyFile}: ${error.message}`);
}

// The client: a bearer key, JSON in and out, no Origin header (an agent key is not a browser).

const counts = { reads: 0, writes: 0 };

async function api(method, route, body) {
  counts[method === "GET" ? "reads" : "writes"] += 1;
  const headers = { authorization: `Bearer ${KEY}`, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${ORIGIN}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = text === "" ? null : JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: json, retryAfter: Number(response.headers.get("retry-after") ?? 0) };
}

function errorText(reply) {
  const e = reply.body?.error;
  if (e && typeof e === "object") return `${reply.status} ${e.code ?? ""}: ${e.message ?? ""}`.trim();
  return `${reply.status} ${JSON.stringify(reply.body)?.slice(0, 160) ?? ""}`;
}

async function readAll(route, field) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const sep = route.includes("?") ? "&" : "?";
    const reply = await api("GET", cursor === null ? route : `${route}${sep}cursor=${encodeURIComponent(cursor)}`);
    if (reply.status !== 200) throw new Error(`GET ${route}: ${errorText(reply)}`);
    items.push(...reply.body[field]);
    cursor = reply.body.nextCursor ?? null;
    if (cursor === null) break;
  }
  return items;
}

function ticketRef(t) {
  return {
    id: t.id,
    key: t.key,
    status: t.status,
    version: t.version,
    assigneeId: t.assignee?.id ?? null,
    waitingOnId: t.waitingOn?.id ?? null,
    labelIds: (t.labels ?? []).map((l) => l.id),
    resolution: t.resolution ?? null,
  };
}

// The world of this run

const scenario = demoScenario(scenarioId);
const content = scenario.content;
const entries = buildStory(scenario.story, DEMO_SEED);
const projectSeeds = content.projects.slice(0, projectCap === Infinity ? content.projects.length : projectCap);
const projectSlugs = new Set(projectSeeds.map((p) => p.slug));
const seedByKey = new Map(content.tickets.map((t) => [t.key, t]));
const keyPrefix = Object.fromEntries(content.projects.map((p) => [p.key, p.slug]));

/** Per project: title -> TicketRef, loaded from loops and kept up to date by what this run writes. */
const index = new Map();
/** demo principal id -> loops principal id, or null. */
let principalMap = new Map();
/** project slug -> label name -> id (global labels included). */
const labelMap = new Map();
/** The projects loops has (slug -> ProjectOut), archived ones included. */
const projects = new Map();
const missingProjects = [];
const personOnly = loadJson(PERSON_FILE, []);

const resolve = {
  principal: (demoId) => principalMap.get(demoId) ?? null,
  label: (slug, name) => labelMap.get(slug)?.get(name) ?? null,
};

function loadJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function notePersonOnly(ticket, to, detail, at) {
  if (personOnly.some((p) => p.key === ticket.key && p.to === to)) return;
  personOnly.push({ key: ticket.key, id: ticket.id, to, detail, storylineAt: at, notedAt: new Date().toISOString() });
  if (!dryRun) saveJson(PERSON_FILE, personOnly);
}

function log(line) {
  console.log(`${new Date().toTimeString().slice(0, 8)} ${line}`);
}

async function whoAmI() {
  const me = await api("GET", "/api/auth/me");
  if (me.status !== 200) fail(`${ORIGIN} refused the key: ${errorText(me)}`);
  const p = me.body.principal;
  if (p.kind !== "agent") fail(`the key belongs to a ${p.kind}, not an agent: the seed writes as an external bot only`);
  log(`signed in as ${p.id} (${p.kind}, role ${p.role}) on ${ORIGIN}`);
  return p;
}

async function loadProjects() {
  for (const seed of projectSeeds) {
    const reply = await api("GET", `/api/projects/${seed.slug}`);
    if (reply.status === 200) projects.set(seed.slug, reply.body.project);
    else if (reply.status === 404) missingProjects.push(seed);
    else throw new Error(`GET /api/projects/${seed.slug}: ${errorText(reply)}`);
  }
}

async function loadPrincipals() {
  const reply = await api("GET", "/api/principals");
  if (reply.status !== 200) throw new Error(`GET /api/principals: ${errorText(reply)}`);
  const ids = new Set(reply.body.principals.map((p) => p.id));
  principalMap = new Map();
  for (const person of content.people) principalMap.set(person.id, ids.has(person.id) ? person.id : null);
  for (const agent of content.agents) {
    if (ids.has(agent.id)) principalMap.set(agent.id, agent.id);
    else if (agent.isCrewhubLead && ids.has("crewhub-lead")) principalMap.set(agent.id, "crewhub-lead");
    else principalMap.set(agent.id, null);
  }
}

async function loadLabels() {
  const global = await api("GET", "/api/labels?scope=global");
  const globalNames = new Map((global.status === 200 ? global.body.labels : []).map((l) => [l.name, l.id]));
  for (const slug of projects.keys()) {
    const names = new Map(globalNames);
    const reply = await api("GET", `/api/projects/${slug}/labels`);
    if (reply.status === 200) for (const l of reply.body.labels) names.set(l.name, l.id);
    labelMap.set(slug, names);
  }
}

async function loadTickets() {
  for (const [slug, project] of projects) {
    const titles = new Map();
    if (project.archivedAt === null) {
      for (const t of await readAll(`/api/tickets?project=${encodeURIComponent(slug)}&limit=200`, "tickets")) titles.set(t.title, ticketRef(t));
    }
    index.set(slug, titles);
  }
}

/** The ticket a storyline handle names, fresh from loops (version and status matter), or null with the reason. */
async function findTicket(handle) {
  let stale = null;
  if (handle.kind === "missing") return { ticket: null, reason: handle.reason };
  if (handle.kind === "key") {
    const seed = seedByKey.get(handle.key);
    const slug = keyPrefix[handle.key.split("-")[0]];
    if (seed === undefined || slug === undefined) return { ticket: null, reason: `${handle.key} is not a seed ticket of this scenario` };
    if (!projectSlugs.has(slug)) return { ticket: null, reason: `${slug} is outside --projects` };
    if (!projects.has(slug)) return { ticket: null, reason: `project ${slug} does not exist in loops` };
    stale = index.get(slug)?.get(seed.title) ?? null;
    if (stale === null) return { ticket: null, reason: `${handle.key} "${seed.title}" was not installed in ${slug}` };
  } else {
    if (!projects.has(handle.project)) return { ticket: null, reason: `project ${handle.project} does not exist in loops` };
    stale = index.get(handle.project)?.get(handle.title) ?? null;
    if (stale === null) return { ticket: null, reason: `"${handle.title}" was not created in ${handle.project}` };
  }
  const slug = handle.kind === "key" ? keyPrefix[handle.key.split("-")[0]] : handle.project;
  if (stale.id.startsWith("dry:")) return { ticket: stale, slug }; // a dry run's ticket: nothing to read back
  const reply = await api("GET", `/api/tickets/${stale.key}`);
  if (reply.status !== 200) return { ticket: null, reason: `GET /api/tickets/${stale.key}: ${errorText(reply)}` };
  const fresh = ticketRef(reply.body.ticket);
  if (reply.body.ticket.archivedAt !== null) return { ticket: null, reason: `${fresh.key} is archived` };
  return { ticket: fresh, slug };
}

function remember(slug, ticket) {
  const titles = index.get(slug) ?? new Map();
  for (const [title, t] of titles) if (t.id === ticket.id) titles.set(title, ticket);
  index.set(slug, titles);
}

/** One write, with its outcome; a 429 waits once for Retry-After (at most 10 s) and tries again. */
async function write(method, route, body, what) {
  if (dryRun) return { ok: true, dry: true };
  let reply = await api(method, route, body);
  if (reply.status === 429 && reply.body?.error?.code !== "progress_rate") {
    const wait = Math.min(10_000, Math.max(1000, reply.retryAfter * 1000));
    log(`  429 on ${what}: waiting ${wait} ms`);
    await sleep(wait);
    reply = await api(method, route, body);
  }
  if (reply.status >= 200 && reply.status < 300) return { ok: true, body: reply.body };
  return { ok: false, reason: errorText(reply), status: reply.status, code: reply.body?.error?.code };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Installation: the scenario's picture at the start of a loop, made once and converged before every later pass.

async function install({ rewind }) {
  const report = { created: 0, converged: 0, skipped: [], refused: [], person: 0 };
  for (const seed of content.tickets) {
    const slug = keyPrefix[seed.key.split("-")[0]];
    if (!projectSlugs.has(slug)) continue;
    const project = projects.get(slug);
    if (project === undefined) continue;
    if (project.archivedAt !== null) {
      report.skipped.push(`${seed.key}: ${slug} is archived in loops`);
      continue;
    }
    const titles = index.get(slug);
    if (titles.has(seed.title)) continue;
    const built = seedTicketRequest(seed, slug, resolve);
    if ("skip" in built) {
      report.skipped.push(`${seed.key}: ${built.skip}`);
      continue;
    }
    const result = await write("POST", "/api/tickets", built.body, `create ${seed.key}`);
    if (!result.ok) {
      report.refused.push(`${seed.key}: ${result.reason}`);
      continue;
    }
    report.created += 1;
    if (result.dry) {
      titles.set(seed.title, { id: `dry:${seed.key}`, key: `${project.key}-?`, status: built.body.status, version: 1, assigneeId: null, waitingOnId: null, labelIds: [], resolution: null });
      log(`  would create ${seed.key} "${seed.title}" in ${slug} as ${built.body.status}${built.notes.length ? ` (${built.notes.join("; ")})` : ""}`);
    } else {
      const made = ticketRef(result.body.ticket);
      titles.set(seed.title, made);
      log(`  created ${made.key} for ${seed.key} "${seed.title}" (${made.status})${built.notes.length ? ` (${built.notes.join("; ")})` : ""}`);
      if (built.personOnly !== null) {
        notePersonOnly(made, built.personOnly, `seed ${seed.key} is ${seed.status}; ${PERSON_ONLY_DONE}`, "install");
        report.person += 1;
      }
    }
  }
  // Blockers of the seed picture (idempotent: loops answers 409 relation_exists the second time).
  for (const seed of content.tickets) {
    if (seed.blockedBy === undefined) continue;
    const slug = keyPrefix[seed.key.split("-")[0]];
    const blocked = index.get(slug)?.get(seed.title);
    if (blocked === undefined) continue;
    for (const blockerKey of seed.blockedBy) {
      const blockerSeed = seedByKey.get(blockerKey);
      const blocker = blockerSeed === undefined ? undefined : index.get(slug)?.get(blockerSeed.title);
      if (blocker === undefined) continue;
      const result = await write("POST", `/api/tickets/${blocked.key}/blockers`, { by: blocker.key }, `block ${seed.key} by ${blockerKey}`);
      if (result.ok) log(`  ${blocked.key} blocked by ${blocker.key}${result.dry ? " (would)" : ""}`);
      else if (result.code !== "relation_exists") report.refused.push(`block ${seed.key} by ${blockerKey}: ${result.reason}`);
    }
  }
  if (rewind) {
    const moves = convergeMoves(
      content.tickets.filter((t) => projectSlugs.has(keyPrefix[t.key.split("-")[0]])),
      (seed) => index.get(keyPrefix[seed.key.split("-")[0]])?.get(seed.title) ?? null,
    );
    for (const { ticket, to } of moves) {
      const fresh = dryRun ? { ok: true, body: { ticket } } : await api("GET", `/api/tickets/${ticket.key}`).then((r) => (r.status === 200 ? { ok: true, body: r.body } : { ok: false, reason: errorText(r) }));
      if (!fresh.ok) {
        report.refused.push(`rewind ${ticket.key}: ${fresh.reason}`);
        continue;
      }
      const current = ticketRef(fresh.body.ticket);
      const move = moveRequest(current, to);
      if (!("body" in move)) continue;
      const result = await write("POST", `/api/tickets/${current.key}/move`, move.body, `rewind ${current.key}`);
      if (result.ok) {
        report.converged += 1;
        log(`  rewound ${current.key} ${current.status} -> ${to}${result.dry ? " (would)" : ""}`);
        if (!result.dry) remember(keyPrefix[current.key.split("-")[0]] ?? "", { ...current, status: to, version: result.body.ticket.version });
      } else report.refused.push(`rewind ${ticket.key}: ${result.reason}`);
    }
  }
  return report;
}

// The storyline

async function perform(entry) {
  const { action } = entry;
  const verdict = classify(action.type);
  if (!verdict.replay) return { id: entry.id, type: action.type, result: "skipped", reason: verdict.reason };
  if ("project" in action && !projectSlugs.has(action.project)) return { id: entry.id, type: action.type, result: "skipped", reason: `${action.project} is outside --projects` };

  if (action.type === "createTicket") {
    if (!projects.has(action.project)) return { id: entry.id, type: action.type, result: "skipped", reason: `project ${action.project} does not exist in loops` };
    const existing = index.get(action.project)?.get(action.title);
    if (existing !== undefined) return { id: entry.id, type: action.type, result: "skipped", key: existing.key, reason: "a ticket with this title exists (idempotent)" };
    const built = createTicketRequest(action, resolve);
    const result = await write("POST", "/api/tickets", built.body, `create "${action.title}"`);
    if (!result.ok) return { id: entry.id, type: action.type, result: "refused", reason: result.reason };
    if (result.dry) {
      index.get(action.project).set(action.title, { id: `dry:${entry.id}`, key: `${projects.get(action.project).key}-?`, status: built.body.status, version: 1, assigneeId: null, waitingOnId: null, labelIds: [], resolution: null });
      return { id: entry.id, type: action.type, result: "done", key: "(dry)", reason: built.notes.join("; ") || undefined };
    }
    const made = ticketRef(result.body.ticket);
    index.get(action.project).set(action.title, made);
    return { id: entry.id, type: action.type, result: "done", key: made.key, reason: built.notes.join("; ") || undefined };
  }

  const found = await findTicket(resolveHandle(action.ticket, entries));
  if (found.ticket === null) return { id: entry.id, type: action.type, result: "skipped", reason: found.reason };
  const { ticket, slug } = found;
  const outcome = (result, extra = {}) => ({ id: entry.id, type: action.type, result, key: ticket.key, ...extra });

  if (action.type === "move") {
    const move = moveRequest(ticket, action.to);
    if ("skip" in move) return outcome("skipped", { reason: move.skip });
    if ("personOnly" in move) {
      notePersonOnly(ticket, "done", action.rejected === undefined ? move.personOnly : `${move.personOnly}; rejected: ${action.rejected}`, clock(entry.at));
      return outcome("person", { reason: move.personOnly });
    }
    const result = await write("POST", `/api/tickets/${ticket.key}/move`, move.body, `move ${ticket.key}`);
    if (!result.ok) return outcome("refused", { reason: result.reason });
    if (!result.dry) remember(slug, { ...ticket, status: action.to, version: result.body.ticket.version });
    return outcome("done", { reason: `${ticket.status} -> ${action.to}` });
  }

  if (action.type === "assign" || action.type === "waitOn" || action.type === "labels") {
    const built =
      action.type === "assign" ? assignRequest(ticket, action.assignee, resolve)
      : action.type === "waitOn" ? waitOnRequest(ticket, action.on, resolve)
      : labelsRequest(ticket, slug, action.labels, resolve);
    if ("skip" in built) return outcome("skipped", { reason: built.skip });
    const result = await write("PATCH", `/api/tickets/${ticket.key}`, built.body, `${action.type} ${ticket.key}`);
    if (!result.ok) return outcome("refused", { reason: result.reason });
    if (!result.dry) remember(slug, ticketRef(result.body.ticket));
    return outcome("done", { reason: built.notes.join("; ") || undefined });
  }

  if (action.type === "block") {
    const blocker = await findTicket(resolveHandle(action.blocker, entries));
    if (blocker.ticket === null) return outcome("skipped", { reason: `blocker: ${blocker.reason}` });
    const result = await write("POST", `/api/tickets/${ticket.key}/blockers`, { by: blocker.ticket.key }, `block ${ticket.key}`);
    if (!result.ok) return outcome(result.code === "relation_exists" ? "skipped" : "refused", { reason: result.reason });
    return outcome("done", { reason: `blocked by ${blocker.ticket.key}` });
  }

  if (action.type === "comment") {
    let parentId = null;
    if (action.replyToLast === true && !dryRun) {
      const comments = await readAll(`/api/tickets/${ticket.key}/comments?limit=100`, "comments");
      const last = comments.filter((c) => c.deletedAt === null).at(-1);
      parentId = last?.id ?? null;
    }
    const result = await write("POST", `/api/tickets/${ticket.key}/comments`, commentRequest(action.text, parentId), `comment on ${ticket.key}`);
    if (!result.ok) return outcome("refused", { reason: result.reason });
    return outcome("done", { reason: parentId === null ? undefined : "a reply" });
  }

  if (action.type === "progress") {
    const result = await write("POST", `/api/tickets/${ticket.key}/progress`, progressRequest(action), `progress on ${ticket.key}`);
    if (!result.ok) return outcome(result.code === "progress_rate" ? "skipped" : "refused", { reason: result.code === "progress_rate" ? "progress_rate: one line per ticket every 3 minutes (domain/progress.py RATE_SECONDS)" : result.reason });
    return outcome("done", { reason: result.body?.progress === undefined ? undefined : `${action.kind}${result.body.waitChanged ? ", waits on a person" : ""}` });
  }
  return { id: entry.id, type: action.type, result: "skipped", reason: "no handler" };
}

function describe(entry, o) {
  const a = entry.action;
  const target = a.ticket ?? a.project ?? a.name ?? "";
  const extra = o.reason === undefined ? "" : ` (${o.reason})`;
  return `[${clock(entry.at)}] #${entry.id} ${a.type} ${target}${o.key ? ` -> ${o.key}` : ""}: ${o.result}${extra}`;
}

function printTally(label, outcomes) {
  const t = tally(outcomes);
  log(`${label}: ${Object.entries(t.results).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const reasons = Object.entries(t.reasons).sort((a, b) => b[1] - a[1]);
  for (const [reason, n] of reasons) log(`  ${String(n).padStart(3)} x ${reason}`);
}

// Main

const me = await whoAmI();
await loadProjects();
await loadPrincipals();
await loadLabels();
await loadTickets();

log(`scenario ${scenario.id} (${scenario.name}): ${projectSeeds.length} project(s) considered, ${entries.length} storyline entries, ${clock(scenario.story.durationMs)} a pass at ${speed}x`);
for (const seed of projectSeeds) {
  const p = projects.get(seed.slug);
  if (p === undefined) log(`  project ${seed.slug} (${seed.key}): MISSING in loops`);
  else log(`  project ${seed.slug} (${p.key}): ${p.archivedAt === null ? `${index.get(seed.slug).size} tickets by title` : "archived"}, lead ${p.lead.id}`);
}
const unknownPrincipals = [...principalMap].filter(([, id]) => id === null).map(([demo]) => demo);
if (unknownPrincipals.length > 0) log(`  no principal in loops for: ${unknownPrincipals.join(", ")} (their assignments and waits are dropped)`);
if (missingProjects.length > 0) {
  const request = missingProjects.map((p) => ({ slug: p.slug, name: p.name, prefix: p.key }));
  log(`  ${missingProjects.length} project(s) are missing and POST /api/projects is a human admin's. Ask the admin to create them; the request in the Lead's format:`);
  console.log(JSON.stringify(request, null, 2));
}

const state = args.restart ? null : loadJson(STATE_FILE, null);
let pass = 1;
let next = 0;
if (state !== null && state.url === ORIGIN && state.scenario === scenario.id && state.next < entries.length) {
  pass = state.pass;
  next = state.next;
  log(`resuming pass ${pass} at entry ${next} (${clock(entries[next].at)}) from ${STATE_FILE}`);
}
const saveState = () => {
  if (!dryRun) saveJson(STATE_FILE, { url: ORIGIN, scenario: scenario.id, pass, next, updatedAt: new Date().toISOString() });
};

log(dryRun ? "dry run: installing (reads only)" : "installing the seed picture");
const installed = await install({ rewind: !args["no-rewind"] && next === 0 && pass > 1 });
log(`install: created ${installed.created}, rewound ${installed.converged}, skipped ${installed.skipped.length}, refused ${installed.refused.length}, for a person ${installed.person}`);
for (const line of installed.skipped) log(`  skipped ${line}`);
for (const line of installed.refused) log(`  refused ${line}`);

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  log("stopping after the current entry (Ctrl+C again to quit at once)");
});

const paced = schedule(entries, speed);
const all = [];
while (!stopping) {
  const outcomes = [];
  for (let i = next; i < paced.length && !stopping; i++) {
    const { entry, delayMs } = paced[i];
    if (!dryRun) await sleep(delayMs);
    let o;
    try {
      o = await perform(entry);
    } catch (error) {
      o = { id: entry.id, type: entry.action.type, result: "failed", reason: error.message };
    }
    outcomes.push(o);
    all.push(o);
    if (o.result !== "skipped" || dryRun) log(describe(entry, o));
    next = i + 1;
    saveState();
  }
  printTally(dryRun ? `dry run of pass ${pass} (nothing written)` : `pass ${pass}`, outcomes);
  if (dryRun || args.once || stopping) break;
  pass += 1;
  next = 0;
  saveState();
  log(`pass ${pass}: rewinding the seed tickets${args["no-rewind"] ? " (off)" : ""} and playing again`);
  const again = await install({ rewind: !args["no-rewind"] });
  log(`rewind: rewound ${again.converged}, refused ${again.refused.length}`);
  for (const line of again.refused) log(`  refused ${line}`);
}
if (next >= entries.length && !dryRun) {
  next = 0;
  pass += 1;
  saveState();
}
if (all.length > 0 && (pass > 1 || stopping)) printTally("this run", all);
log(`${counts.reads} reads, ${counts.writes} writes as ${me.id}; ${personOnly.length} ticket(s) wait for a person in ${PERSON_FILE}`);
