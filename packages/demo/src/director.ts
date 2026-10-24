/**
 * The scripted director: an intent feed that stands in for the Haiku lane of LOOPS_INTEGRATION_PLAN.md section 7.3.
 * There is no model call anywhere. The feed reads the world model, writes intents, and sends them through the same
 * `validateIntents` and the same limits the real director would meet: scheduled plans, debounced quick plans,
 * hourly and daily caps, an input and an output budget. Everything is deterministic from the seed and the
 * sequence of models it is shown; the only clock is the models' own `now` (demo time).
 *
 * Every few plans the script adds one deliberately invalid intent (moving a working agent), so the rejection
 * is visible in the log. Prop tags come from the caller (`PropTags`): the same vocabulary the building template and
 * the walks use (`coffee`, `rest`, `greenery`, `mail`, `planning`, ...).
 */
import {
  DEFAULT_PRESENCE,
  estimateTokens,
  immovableReason,
  planInput,
  validateIntents,
} from "@crewhub/world-model";
import type {
  AgentPlacement,
  Building,
  Intent,
  PresenceSettings,
  Reachable,
  RejectedIntent,
  RoomKind,
  WorldModel,
} from "@crewhub/world-model";
import { mulberry32 } from "./prng.ts";
import { DAY, HOUR, MINUTE, SECOND } from "./time.ts";

/**
 * The prop tags an agent can reach in a room of a building. The app answers it from the navigation world (the tags
 * of the building template's props with a reachable approach cell); the script only picks from it, so a scripted
 * `goToProp` names a prop that exists.
 */
export type PropTags = (building: string, room: RoomKind) => readonly string[];

export const QUICK_DEBOUNCE_MS = 20 * SECOND;
export const QUICK_MIN_GAP_MS = MINUTE;
/** Every third plan of a building carries the deliberately invalid intent. */
const INVALID_EVERY = 3;

export type PlanTrigger = "scheduled" | "quick";

export interface PlanRecord {
  /** 1, 2, 3 ... in the order the feed made them. */
  id: number;
  trigger: PlanTrigger;
  /** What set off a quick plan, e.g. "CR-12 moved"; "interval" for a scheduled one. */
  reason: string;
  building: string;
  /** Demo time of the model the plan was made from. */
  at: number;
  /** Estimated tokens (characters / 4) of the plan-input JSON. */
  inputTokens: number;
  inputTruncated: boolean;
  /** Estimated tokens of the plan's output JSON. */
  outputTokens: number;
  accepted: Intent[];
  rejected: RejectedIntent[];
}

export interface FeedUsage {
  /** Plans within the feed's last 24 hours of demo time. */
  plansToday: number;
  plansThisHour: number;
  plansTotal: number;
  intentsAccepted: number;
  intentsRejected: number;
  inputTokens: number;
  /** Set while the hourly or daily cap stops the feed. */
  capReached: "hour" | "day" | null;
}

export interface DirectorFeed {
  /** Show the feed the next model; returns the plans it made (usually none). */
  step(model: WorldModel): PlanRecord[];
  setSettings(settings: PresenceSettings): void;
  usage(): FeedUsage;
}

export interface DirectorFeedOptions {
  seed: number;
  reachable: Reachable;
  propTags: PropTags;
  settings?: PresenceSettings;
}

/** Movement-relevant changes between two models, per building slug (plan 7.3 "Quick plan"). */
export function movementSignals(prev: WorldModel, next: WorldModel): Map<string, string> {
  const signals = new Map<string, string>();
  const note = (slug: string | null, reason: string) => {
    if (slug !== null && !signals.has(slug)) signals.set(slug, reason);
  };
  const before = new Map<string, { status: string; slug: string; key: string }>();
  for (const b of prev.buildings) for (const o of b.objects) before.set(o.ticketId, { status: o.status, slug: b.slug, key: o.key });
  for (const b of next.buildings) {
    for (const o of b.objects) {
      const was = before.get(o.ticketId);
      if (was && was.status !== o.status) note(b.slug, `${o.key} moved`);
    }
  }
  const spots = (m: WorldModel) => {
    const map = new Map<string, { slug: string | null; status: string }>();
    for (const b of m.buildings) for (const a of b.agents) if (a.presence === "real") map.set(a.key, { slug: b.slug, status: a.posture });
    for (const a of [...m.townHall, ...m.postOffice]) map.set(a.key, { slug: null, status: a.posture });
    return map;
  };
  const was = spots(prev);
  for (const [key, now] of spots(next)) {
    const old = was.get(key);
    if (!old) continue;
    if (old.slug !== now.slug) {
      note(now.slug, `${key} changed building`);
      note(old.slug, `${key} changed building`);
    } else if (old.status !== now.status) note(now.slug, `${key} changed status`);
  }
  return signals;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const real = (b: Building): AgentPlacement[] => b.agents.filter((a) => a.presence === "real");
const isIdle = (b: Building, a: AgentPlacement): boolean => immovableReason({ agent: a, building: b }) === null;

/**
 * One scripted plan for a building: a few idle agents each get a prop visit, a visit or a stay, and every
 * third plan also asks to move a working agent (which validation then rejects). Returns raw intents.
 */
export function scriptPlan(model: WorldModel, slug: string, seed: number, planNumber: number, propTags: PropTags): unknown[] {
  const building = model.buildings.find((b) => b.slug === slug);
  if (!building || building.archived) return [];
  const random = mulberry32(seed ^ hash(slug) ^ Math.imul(planNumber, 2654435761));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const idle = real(building).filter((a) => isIdle(building, a));
  const working = real(building).filter((a) => !isIdle(building, a) && immovableReason({ agent: a, building }) === "working");
  const intents: unknown[] = [];
  const pool = [...idle];
  // A seeded shuffle, then at most three agents move in one plan: the feed stays calm.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const meeting = building.rooms.some((r) => r.kind === "meeting");
  if (meeting && pool.length >= 2 && random() < 0.5) {
    intents.push({ kind: "gather", agents: pool.slice(0, 3).map((a) => a.key), room: "meeting", ttlMs: 2 * MINUTE });
    pool.splice(0, Math.min(3, pool.length));
  }
  const tagsIn = (room: RoomKind) => propTags(slug, room);
  const rooms = building.rooms.filter((r) => r.kind !== "meeting" && tagsIn(r.kind).length > 0);
  for (const agent of pool.slice(0, 3)) {
    const roll = random();
    const others = real(building).filter((a) => a.key !== agent.key);
    if (roll < 0.55 && rooms.length > 0) {
      const room = pick(rooms);
      intents.push({ kind: "goToProp", agent: agent.key, room: room.kind, tag: pick(tagsIn(room.kind)), ttlMs: 90 * SECOND });
    } else if (roll < 0.85 && others.length > 0) {
      intents.push({ kind: "visitAgent", agent: agent.key, target: pick(others).key, ttlMs: 60 * SECOND });
    } else intents.push({ kind: "stay", agent: agent.key, ttlMs: 60 * SECOND });
  }
  if (intents.length > 0 && planNumber % INVALID_EVERY === 0 && working.length > 0) {
    intents.push({ kind: "goToProp", agent: pick(working).key, room: "lobby", tag: "coffee", ttlMs: 90 * SECOND });
  }
  return intents;
}

interface BuildingClock {
  plans: number;
  nextScheduled: number;
  lastQuick: number;
  pendingReason: string | null;
  lastSignal: number;
}

export function createDirectorFeed(options: DirectorFeedOptions): DirectorFeed {
  let settings = options.settings ?? DEFAULT_PRESENCE;
  /** Accumulates only forward movement of demo time, so a loop or a seek never replays hours or days. */
  let clock = 0;
  let lastNow: number | null = null;
  let previous: WorldModel | null = null;
  let wasEnabled = false;
  let nextId = 1;
  const stamps: number[] = [];
  const perBuilding = new Map<string, BuildingClock>();
  const totals = { accepted: 0, rejected: 0, input: 0, plans: 0 };

  const windowCount = (span: number) => stamps.filter((s) => clock - s < span).length;
  const capHit = (): FeedUsage["capReached"] =>
    windowCount(HOUR) >= settings.plansPerHour ? "hour" : windowCount(DAY) >= settings.plansPerDay ? "day" : null;
  const intervalMs = () => settings.intervalMinutes * MINUTE;
  const fresh = (): BuildingClock => ({ plans: 0, nextScheduled: clock + intervalMs(), lastQuick: -Infinity, pendingReason: null, lastSignal: 0 });

  function makePlan(model: WorldModel, slug: string, trigger: PlanTrigger, reason: string, state: BuildingClock): PlanRecord | null {
    const input = planInput(model, slug, (room) => options.propTags(slug, room), settings.inputBudget);
    if (!input) return null;
    state.plans += 1;
    const intents = scriptPlan(model, slug, options.seed, state.plans, options.propTags);
    if (intents.length === 0) return null;
    const outputTokens = estimateTokens(JSON.stringify(intents));
    const overBudget = outputTokens > settings.outputBudget;
    const { accepted, rejected } = overBudget
      ? { accepted: [], rejected: intents.map((intent) => ({ intent, reason: `output is ${outputTokens} tokens, over the ${settings.outputBudget} budget` })) }
      : validateIntents(model, intents, options.reachable);
    stamps.push(clock);
    totals.plans += 1;
    totals.accepted += accepted.length;
    totals.rejected += rejected.length;
    totals.input += input.tokens;
    return { id: nextId++, trigger, reason, building: slug, at: model.now, inputTokens: input.tokens, inputTruncated: input.truncated, outputTokens, accepted, rejected };
  }

  return {
    setSettings(next) {
      settings = next;
    },
    usage: () => ({
      plansToday: windowCount(DAY),
      plansThisHour: windowCount(HOUR),
      plansTotal: totals.plans,
      intentsAccepted: totals.accepted,
      intentsRejected: totals.rejected,
      inputTokens: totals.input,
      capReached: settings.directorEnabled ? capHit() : null,
    }),
    step(model) {
      const made: PlanRecord[] = [];
      const backwards = lastNow !== null && model.now < lastNow;
      if (lastNow !== null && !backwards) clock += model.now - lastNow;
      const signals = previous && !backwards ? movementSignals(previous, model) : new Map<string, string>();
      lastNow = model.now;
      previous = model;
      // Switching on, or a seek or loop, starts every building's timers afresh: no plan fires for the past.
      if ((settings.directorEnabled && !wasEnabled) || backwards) perBuilding.clear();
      wasEnabled = settings.directorEnabled;
      if (!settings.directorEnabled) return made;
      for (const building of model.buildings) {
        if (building.archived) continue;
        const state = perBuilding.get(building.slug) ?? fresh();
        perBuilding.set(building.slug, state);
        const signal = signals.get(building.slug);
        if (signal !== undefined) {
          state.pendingReason = signal;
          state.lastSignal = clock;
        }
        const hasIdle = real(building).some((a) => isIdle(building, a));
        let trigger: PlanTrigger | null = null;
        let reason = "";
        if (settings.quickPlans && state.pendingReason !== null && clock - state.lastSignal >= QUICK_DEBOUNCE_MS && clock - state.lastQuick >= QUICK_MIN_GAP_MS) {
          trigger = "quick";
          reason = state.pendingReason;
        } else if (clock >= state.nextScheduled && hasIdle) {
          trigger = "scheduled";
          reason = "interval";
        }
        if (trigger === null) continue;
        if (capHit() !== null) break;
        if (trigger === "quick") {
          state.lastQuick = clock;
          state.pendingReason = null;
        } else state.nextScheduled = clock + intervalMs();
        const plan = makePlan(model, building.slug, trigger, reason, state);
        if (plan) made.push(plan);
      }
      return made;
    },
  };
}
