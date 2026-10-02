/**
 * StressSource: a synthetic crewhub-loops for the browser stress fixture (`?stress=1`, dev only). Twelve projects
 * and a hundred agents (twelve leads, four registered agents that work in two projects, eighty-four herdr workers),
 * served through the same `WorldSource` seam as the scripted demo: a loops-shaped snapshot, then a steady stream of
 * envelopes (ticket moves, progress lines, deliveries and their postman states) and team re-reads that flip lanes.
 * Deterministic: every step of demo time draws from a PRNG seeded by the step index, so a seek replays the same
 * stream. It tells no story; it exists to load the renderer and the walk engine.
 */
import type {
  AgentOut,
  BoardResponse,
  Envelope,
  PlaybackControls,
  PlaybackSpeed,
  PrincipalOut,
  PrincipalRef,
  ProjectOut,
  SourceMessage,
  TeamAgent,
  TeamSnapshot,
  Ticket,
  TicketCard,
  TicketStatus,
  WatchdogResponse,
  WorldSource,
} from "@crewhub/loops-client";
import { mulberry32 } from "./prng.ts";
import type { Scheduler } from "./scheduler.ts";
import { DEMO_EPOCH_MS, MINUTE, SECOND, iso } from "./time.ts";

export const STRESS_BUILDINGS = 12;
export const STRESS_AGENTS = 100;
const ROVERS = 4;
const TICKETS_PER_PROJECT = 14;
/** One draw of the stream per step of demo time. */
const STEP_MS = 400;
const TEAM_EVERY_MS = 30 * SECOND;
const DURATION_MS = 30 * MINUTE;
const TICK_MS = 100;
const SESSION = "stress";
const COLORS = ["coral", "tangerine", "circle", "mist", "ink"] as const;
const ICONS = ["home", "inbox", "bot", "spark", "users", "star", "folder"] as const;
const STATUSES: readonly TicketStatus[] = ["backlog", "planned", "in_progress", "review", "done"];

export interface StressSourceOptions {
  scheduler: Scheduler;
  /** Demo time of position 0, ms since the epoch. Default DEMO_EPOCH_MS. */
  epochMs?: number;
  seed?: number;
}

interface Project {
  out: ProjectOut;
  cards: TicketCard[];
  workers: string[];
}
interface State {
  seq: number;
  now: number;
  projects: Project[];
  lanes: TeamAgent[];
  team: TeamSnapshot;
  deliveries: { id: string; due: number; recipient: string; slug: string; state: "pending" | "claimed" }[];
  nextDelivery: number;
}

const slugOf = (i: number) => `stress-${String(i + 1).padStart(2, "0")}`;
const keyOf = (i: number) => `S${String.fromCharCode(65 + i)}`;
const agentRef = (id: string): PrincipalRef => ({ id, kind: "agent", displayName: id });
const PERSON: PrincipalRef = { id: "nicky", kind: "user", displayName: "Nicky" };

/** Seven workers per building (84 in all): a designer, an analyst and five developers. */
const WORKERS_PER_BUILDING = 7;
function workerNames(i: number): string[] {
  const stem = slugOf(i);
  const count = WORKERS_PER_BUILDING;
  const names = [`${stem}-design-1`, `${stem}-analyst-1`];
  for (let w = 1; names.length < count; w++) names.push(`${stem}-dev-${w}`);
  return names;
}

function initial(base: number): State {
  const projects: Project[] = [];
  for (let i = 0; i < STRESS_BUILDINGS; i++) {
    const slug = slugOf(i),
      key = keyOf(i),
      lead = `${slug}-lead`;
    const cards: TicketCard[] = [];
    for (let n = 1; n <= TICKETS_PER_PROJECT; n++) {
      const status = STATUSES[n % STATUSES.length]!;
      cards.push({
        id: `tk_${slug}_${n}`,
        key: `${key}-${n}`,
        title: `Stress ticket ${n} of ${slug}`,
        kind: (["task", "feature", "bug", "question"] as const)[n % 4]!,
        status,
        priority: (["normal", "high", "low", "urgent"] as const)[n % 4]!,
        position: 0,
        version: 1,
        assignee: status === "in_progress" || status === "review" ? agentRef(lead) : null,
        updatedAt: iso(base - n * MINUTE),
        statusChangedAt: iso(base - n * MINUTE),
      });
    }
    renumber(cards);
    projects.push({
      out: {
        id: `pr_${slug}`,
        slug,
        key,
        name: `Stress ${key}`,
        lead: agentRef(lead),
        herdrSession: SESSION,
        counts: counts(cards),
        color: COLORS[i % COLORS.length]!,
        icon: ICONS[i % ICONS.length]!,
        description: "A synthetic project of the stress fixture.",
        archivedAt: null,
        effectiveRoute: { agent: lead, session: SESSION, source: "project" },
        revision: 1,
      },
      cards,
      workers: workerNames(i),
    });
  }
  const lanes: TeamAgent[] = [];
  let pane = 1;
  const lane = (name: string, lead: string | null, status: string, contextLine: string | null) =>
    lanes.push({ name, status, paneId: `p${pane++}`, workspaceId: "w1", contextLine, lead, unsentInput: null });
  projects.forEach((p, i) => {
    lane(p.out.lead.id, null, "working", `${keyOf(i)}-3: steady work`);
    p.workers.forEach((w, n) => lane(w, p.out.lead.id, n % 3 === 0 ? "idle" : "working", n % 3 === 0 ? null : `${keyOf(i)}-${(n % TICKETS_PER_PROJECT) + 1}: on it`));
  });
  for (let r = 1; r <= ROVERS; r++) lane(`rover-${r}`, null, "working", null);
  const state: State = { seq: 1000, now: base, projects, lanes, team: { v: 1, ts: "", sessions: [] }, deliveries: [], nextDelivery: 1 };
  state.team = snapshotTeam(state, base);
  return state;
}

function renumber(cards: TicketCard[]): void {
  for (const status of STATUSES) cards.filter((c) => c.status === status).forEach((c, i) => (c.position = i + 1));
}
function counts(cards: TicketCard[]): Record<TicketStatus, number> {
  const out = { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 };
  for (const c of cards) out[c.status]++;
  return out;
}
function snapshotTeam(state: State, at: number): TeamSnapshot {
  return { v: 1, ts: iso(at), sessions: [{ name: SESSION, agents: state.lanes.map((l) => ({ ...l })) }] };
}

function agents(state: State): AgentOut[] {
  const out: AgentOut[] = state.projects.map((p) => ({
    id: p.out.lead.id,
    displayName: p.out.lead.id,
    role: "lead",
    herdrSession: SESSION,
    disabled: false,
    lastSeenAt: iso(state.now),
    keys: null,
    projects: [p.out.slug],
  }));
  for (let r = 1; r <= ROVERS; r++)
    out.push({
      id: `rover-${r}`,
      displayName: `rover-${r}`,
      role: "lead",
      herdrSession: SESSION,
      disabled: false,
      lastSeenAt: iso(state.now),
      keys: null,
      // Each rover belongs to two buildings, so its real location moves between them (plan 4.4).
      projects: [slugOf((r * 3) % STRESS_BUILDINGS), slugOf((r * 3 + 1) % STRESS_BUILDINGS)],
    });
  out.push({ id: "postman", displayName: "Postman", role: "router", herdrSession: SESSION, disabled: false, lastSeenAt: iso(state.now), keys: null, projects: [] });
  return out;
}

/** One step of the stream at `at` (demo ms since the epoch); returns what loops would emit. */
function step(state: State, index: number, at: number): SourceMessage[] {
  const out: SourceMessage[] = [];
  const random = mulberry32(index * 2654435761);
  state.now = at;
  const envelope = (type: string, project: Project | null, ticket: TicketCard | null, actor: PrincipalRef, payload: Record<string, unknown>): Envelope => ({
    v: 1,
    seq: ++state.seq,
    ts: iso(at),
    type,
    project: project ? { slug: project.out.slug, key: project.out.key } : null,
    ticket: ticket ? { id: ticket.id, key: ticket.key, title: ticket.title } : null,
    actor: { id: actor.id, kind: actor.kind },
    recipientIds: [],
    payload,
  });
  // Postman states of earlier deliveries: claimed, then forwarded (or, now and then, uncertain).
  for (const d of [...state.deliveries]) {
    if (d.due > at) continue;
    const project = state.projects.find((p) => p.out.slug === d.slug) ?? null;
    const next = d.state === "pending" ? "claimed" : random() < 0.1 ? "uncertain" : "forwarded";
    out.push({ type: "event", envelope: envelope("delivery.updated", project, null, agentRef("postman"), { deliveryId: d.id, state: next }) });
    if (next === "claimed") {
      d.state = "claimed";
      d.due = at + 6 * SECOND;
    } else state.deliveries.splice(state.deliveries.indexOf(d), 1);
  }
  const project = state.projects[Math.floor(random() * state.projects.length)]!;
  const roll = random();
  if (roll < 0.35) {
    // A ticket moves one column on (done goes back to the backlog: the stream never runs dry).
    const card = project.cards[Math.floor(random() * project.cards.length)]!;
    const from = card.status;
    const to = from === "review" && random() < 0.4 ? "in_progress" : STATUSES[(STATUSES.indexOf(from) + 1) % STATUSES.length]!;
    const byAgent = to === "in_progress" || to === "review";
    card.status = to;
    card.assignee = byAgent ? project.out.lead : to === "done" ? (card.assignee ?? null) : null;
    card.statusChangedAt = iso(at);
    card.updatedAt = iso(at);
    renumber(project.cards);
    project.out.counts = counts(project.cards);
    out.push({
      type: "event",
      envelope: envelope("ticket.moved", project, card, byAgent ? project.out.lead : PERSON, {
        from,
        to,
        position: card.position,
        ...(from === "review" && to === "in_progress" ? { reason: "review_reply" } : {}),
      }),
    });
  } else if (roll < 0.8) {
    // A progress line from a worker (through its lead) or a rover in one of its two buildings.
    const card = project.cards[Math.floor(random() * project.cards.length)]!;
    const rover = random() < 0.15 ? Math.floor(random() * ROVERS) + 1 : 0;
    let agent = project.out.lead.id,
      text: string;
    let home = project;
    if (rover) {
      agent = `rover-${rover}`;
      home = state.projects[random() < 0.5 ? (rover * 3) % STRESS_BUILDINGS : (rover * 3 + 1) % STRESS_BUILDINGS]!;
      text = `Looking at ${home.out.key}-${1 + Math.floor(random() * TICKETS_PER_PROJECT)} now.`;
    } else {
      const worker = project.workers[Math.floor(random() * project.workers.length)]!;
      text = `${worker}: step ${index % 97} of ${card.key}`;
    }
    const ticket = rover ? home.cards[Math.floor(random() * home.cards.length)]! : card;
    out.push({
      type: "event",
      envelope: envelope("ticket.progress", home, ticket, agentRef(agent), {
        ticket: ticket.key,
        agent,
        kind: (["update", "update", "start", "done"] as const)[Math.floor(random() * 4)]!,
        text,
      }),
    });
  } else if (roll < 0.9) {
    // A letter for a lead or a rover: the postman walks it over.
    const recipient = random() < 0.2 ? `rover-${1 + Math.floor(random() * ROVERS)}` : project.out.lead.id;
    const id = `dl_stress_${state.nextDelivery++}`;
    state.deliveries.push({ id, due: at + 3 * SECOND, recipient, slug: project.out.slug, state: "pending" });
    out.push({ type: "event", envelope: envelope("delivery.created", project, null, { id: "system", kind: "system", displayName: "system" }, { deliveryId: id, recipientId: recipient, reason: "comment" }) });
  }
  if (Math.floor(at / TEAM_EVERY_MS) !== Math.floor((at - STEP_MS) / TEAM_EVERY_MS)) {
    // The probe uploads: a tenth of the lanes flip between working and idle.
    for (const lane of state.lanes) {
      if (random() >= 0.1) continue;
      lane.status = lane.status === "working" ? "idle" : "working";
    }
    state.team = snapshotTeam(state, at);
    out.push({ type: "event", envelope: envelope("team.updated", null, null, agentRef("probe"), {}) });
    out.push({ type: "team", team: structuredClone(state.team) });
  }
  return out;
}

export function createStressSource(options: StressSourceOptions): WorldSource & { readonly mode: "demo"; readonly playback: PlaybackControls } {
  const scheduler = options.scheduler;
  const epoch = options.epochMs ?? DEMO_EPOCH_MS;
  let state = initial(epoch);
  let position = 0;
  let steps = 0;
  let speed: PlaybackSpeed = 1;
  let loop = 0;
  let lastWall = scheduler.now();
  let interval: unknown = null;
  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();
  const base = () => epoch + loop * DURATION_MS;
  const send = (message: SourceMessage) => {
    for (const listener of [...listeners]) listener(message);
  };
  const changed = () => {
    for (const listener of [...changeListeners]) listener();
  };

  const snapshot = (): SourceMessage => {
    const boards: Record<string, BoardResponse> = {};
    for (const p of state.projects)
      boards[p.out.slug] = { columns: STATUSES.map((status) => ({ status, tickets: p.cards.filter((c) => c.status === status).map((c) => structuredClone(c)) })) };
    const principals: PrincipalOut[] = [
      { id: PERSON.id, kind: "user", displayName: PERSON.displayName },
      ...agents(state).map((a) => ({ id: a.id, kind: "agent" as const, displayName: a.displayName })),
    ];
    const watchdog: WatchdogResponse = { mode: "observe", open: [] };
    return {
      type: "snapshot",
      snapshot: {
        cursor: state.seq,
        projects: state.projects.map((p) => structuredClone(p.out)),
        archivedProjects: [],
        boards,
        team: structuredClone(state.team),
        agents: agents(state),
        principals,
        watchdog,
        milestones: {},
        releases: {},
      },
    };
  };

  /** Rebuilds the state for this loop and replays the stream silently up to `to`. */
  function rebuild(to: number): void {
    state = initial(base());
    state.seq += loop * 1_000_000;
    steps = 0;
    while ((steps + 1) * STEP_MS <= to) {
      steps++;
      step(state, steps, base() + steps * STEP_MS);
    }
    position = to;
    state.now = base() + position;
  }

  function playTo(target: number): void {
    while ((steps + 1) * STEP_MS <= target) {
      if ((steps + 1) * STEP_MS >= DURATION_MS) {
        loop++;
        target -= DURATION_MS;
        rebuild(0);
        send(snapshot());
        continue;
      }
      steps++;
      for (const message of step(state, steps, base() + steps * STEP_MS)) send(message);
    }
    position = target;
    state.now = base() + position;
  }

  function tick(): void {
    const wall = scheduler.now();
    const elapsed = Math.min(5 * SECOND, Math.max(0, wall - lastWall));
    lastWall = wall;
    if (speed === 0 || elapsed === 0) return;
    playTo(position + elapsed * speed);
    changed();
  }

  const playback: PlaybackControls = {
    durationMs: DURATION_MS,
    positionMs: () => position,
    speed: () => speed,
    setSpeed(value) {
      lastWall = scheduler.now();
      speed = value;
      changed();
    },
    seek(to) {
      rebuild(Math.min(Math.max(0, Math.round(to)), DURATION_MS - 1));
      lastWall = scheduler.now();
      if (listeners.size) send(snapshot());
      changed();
    },
    loop: () => loop,
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };

  const findCard = (ref: string) => {
    for (const p of state.projects) {
      const card = p.cards.find((c) => c.id === ref || c.key === ref);
      if (card) return { p, card };
    }
    return null;
  };

  return {
    mode: "demo",
    playback,
    now: () => base() + position,
    start(listener) {
      listeners.add(listener);
      listener(snapshot());
      if (interval === null) {
        lastWall = scheduler.now();
        interval = scheduler.setInterval(tick, TICK_MS);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && interval !== null) {
          scheduler.clearInterval(interval);
          interval = null;
        }
      };
    },
    getTicket: async (ref): Promise<Ticket | null> => {
      const found = findCard(ref);
      if (!found) return null;
      const { p, card } = found;
      return {
        ...structuredClone(card),
        project: { slug: p.out.slug, key: p.out.key },
        createdAt: card.updatedAt,
        createdBy: PERSON,
      };
    },
    getProject: async (slug) => structuredClone(state.projects.find((p) => p.out.slug === slug)?.out ?? null),
    getBoard: async (slug) => {
      const p = state.projects.find((x) => x.out.slug === slug);
      return p ? { columns: STATUSES.map((status) => ({ status, tickets: p.cards.filter((c) => c.status === status).map((c) => structuredClone(c)) })) } : null;
    },
    getWatchdog: async () => ({ mode: "observe", open: [] }),
    getMilestones: async () => [],
    getReleases: async () => [],
    getComments: async () => [],
    getProgress: async () => [],
  };
}
