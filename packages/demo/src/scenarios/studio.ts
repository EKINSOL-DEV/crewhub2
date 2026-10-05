/**
 * "Studio": a busy installation of twenty projects in four groups, the size at which the world becomes a region of
 * districts. It tells no single story; it keeps every district alive and makes sure that somewhere a person is always
 * needed (a ticket waits on a person, the watchdog reports a stall or asks for attention), so the beacons of the
 * zoomed-out view have something to show. Releases and archive batches send the truck, and the postman keeps walking.
 *
 * FUTURE (proposal L22 "project groups"): the groups are the one field here that crewhub-loops does not have today.
 * They leave the source as `ProjectOut.groupId`, `LoopsSnapshot.groups` and `listProjectGroups()`. The looks of the
 * four districts are not loops data at all: they are this scenario's town document seed (`STUDIO_TOWN_ZONES`).
 * All of it is fiction; see CONTENT.md.
 */
import type { ProgressKind, ProjectColor, ProjectIcon } from "@crewhub/loops-client";
import type { TownZone } from "@crewhub/world-model";
import type { AgentSeed, DemoContent, LaneSeed, ProjectGroupSeed, ProjectSeed, TicketSeed } from "../content.ts";
import { mulberry32 } from "../prng.ts";
import type { PropHome, ScriptBuilder, Story } from "../script.ts";
import { DAY, MINUTE, SECOND, at } from "../time.ts";
import { GLOBAL_LABELS } from "./shared.ts";

interface GroupPlan {
  id: string;
  slug: string;
  name: string;
  color: ProjectColor;
  icon: ProjectIcon;
  /** The district's look in the town document seed: Greenhouse style options and a cast. */
  look: { season: string; planting: string; castId: string };
  /** Name, key, and whether releases are on. */
  projects: [name: string, key: string, releases?: boolean][];
}

const GROUPS: GroupPlan[] = [
  {
    id: "pg_demo_apps",
    slug: "apps",
    name: "Apps",
    color: "coral",
    icon: "home",
    look: { season: "summer", planting: "market", castId: "classic-bots" },
    projects: [["Pocket Garden", "PG", true], ["Field Notes", "FN"], ["Trail Maps", "TM", true], ["Recipe Box", "RB"], ["Bird Log", "BL"]],
  },
  {
    id: "pg_demo_platform",
    slug: "platform",
    name: "Platform",
    color: "ink",
    icon: "bot",
    look: { season: "october", planting: "waterside", castId: "overgrown-bots" },
    projects: [["Accounts", "AC", true], ["Sync Engine", "SY", true], ["Billing", "BI"], ["Notifications", "NT"], ["Search", "SE"]],
  },
  {
    id: "pg_demo_brand",
    slug: "brand",
    name: "Brand",
    color: "tangerine",
    icon: "spark",
    look: { season: "spring", planting: "orchard", castId: "sprouts" },
    projects: [["Website", "WB"], ["Launch Week", "LW"], ["Help Centre", "HC"], ["Newsletter", "NL"], ["Brand Kit", "BK"]],
  },
  {
    id: "pg_demo_lab",
    slug: "lab",
    name: "Lab",
    color: "mist",
    icon: "star",
    look: { season: "october", planting: "meadow", castId: "potlings" },
    projects: [["Voice Notes", "VN"], ["Offline Mode", "OF"], ["Widgets", "WG"], ["Importers", "IM"], ["Translations", "TR"]],
  },
];

const COLORS: ProjectColor[] = ["coral", "tangerine", "circle", "mist", "ink"];
const ICONS: ProjectIcon[] = ["home", "inbox", "bot", "spark", "users", "star", "folder"];
/** Workers per project, by its place in the group: 14 per group, 56 in all. */
const WORKERS = [3, 2, 4, 3, 2];

/** What the eight tickets of a project are about; each project starts at its own place in the list. */
const WORK: [title: string, body: string][] = [
  ["Onboarding in three screens", "What it is, what it needs, and a first thing to do."],
  ["Settings page clean-up", "Group the switches; drop the two nobody uses."],
  ["Faster first load", "Measure, then cut what the first screen does not need."],
  ["Empty states", "Every list says what belongs in it and how to add one."],
  ["Keyboard shortcuts", "The five actions people repeat most."],
  ["Error messages people can act on", "Say what happened and what to do next."],
  ["Export to a file", "One button; the file opens in a spreadsheet."],
  ["Undo for the last change", "One step back, shown as a short notice."],
  ["Search that forgives typos", "A near match beats no match."],
  ["Dark theme pass", "Check every screen; fix the three that glare."],
  ["Usage numbers we can explain", "Only counters with a question behind them."],
  ["Accessibility review", "Labels, focus order and contrast on the main flows."],
  ["Release notes template", "What changed, for whom, and what to do."],
  ["Flaky test hunt", "The four tests that fail once a week."],
  ["Dependency updates", "Minor versions; one pull request per package group."],
  ["Help page for the new flow", "Screenshots and the two questions support gets."],
];

interface Plan {
  seed: ProjectSeed;
  key: string;
  lead: string;
  workers: string[];
  /** Index over all twenty. */
  index: number;
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function plans(): Plan[] {
  const out: Plan[] = [];
  for (const group of GROUPS) {
    group.projects.forEach(([name, key, releases], place) => {
      const index = out.length;
      const stem = key.toLowerCase();
      const count = WORKERS[place] as number;
      const workers = [index % 2 === 0 ? `${stem}-design-1` : `${stem}-analyst-1`];
      for (let n = 1; workers.length < count; n++) workers.push(`${stem}-dev-${n}`);
      out.push({
        index,
        key,
        lead: `${stem}-lead`,
        workers,
        seed: {
          id: `pr_demo_studio${String(index + 1).padStart(2, "0")}`,
          slug: slugOf(name),
          key,
          name,
          // The group's colour for three of five, so a district reads as one family without being uniform.
          color: place < 3 ? group.color : (COLORS[(index + place) % COLORS.length] as ProjectColor),
          icon: place === 0 ? group.icon : (ICONS[(index * 3 + place) % ICONS.length] as ProjectIcon),
          leadId: `${stem}-lead`,
          description: `${name}, one of the studio's ${group.name.toLowerCase()} projects.`,
          features: { milestones: false, releases: releases === true, watchdog_nudge: true },
          archivedAgo: null,
          groupId: group.id,
        },
      });
    });
  }
  return out;
}

const PLANS = plans();
/** Projects whose review ticket (number 3) waits on Nicky at the start: a name tag in five buildings. */
const reviewWaits = (p: Plan) => p.index % 4 === 0;
/** Projects whose quiet ticket (number 5) waits on a person at the start: waiting on a human in four buildings. */
const startsWaiting = (p: Plan) => p.index % 5 === 2;
const personFor = (p: Plan) => (p.index % 3 === 0 ? "sam" : "nicky");

function tickets(p: Plan): TicketSeed[] {
  const work = (n: number) => WORK[(p.index * 5 + n) % WORK.length] as [string, string];
  const ticket = (n: number, rest: Omit<TicketSeed, "key" | "title" | "body" | "kind" | "priority">): TicketSeed => ({
    key: `${p.key}-${n}`,
    title: work(n)[0],
    body: work(n)[1],
    kind: (["feature", "task", "feature", "bug"] as const)[(p.index + n) % 4] ?? "task",
    priority: (["normal", "high", "normal", "low", "urgent"] as const)[(p.index * 2 + n) % 5] ?? "normal",
    ...rest,
  });
  return [
    ticket(1, { status: "done", assignee: p.lead, closedAgo: 6 * DAY }),
    ticket(2, { status: "done", assignee: p.lead, closedAgo: 2 * DAY }),
    ticket(3, { status: "review", assignee: p.lead, ...(reviewWaits(p) ? { waitingOn: "nicky" } : {}) }),
    ticket(4, { status: "in_progress", assignee: p.lead }),
    ticket(5, { status: "in_progress", assignee: p.lead, ...(startsWaiting(p) ? { waitingOn: personFor(p) } : {}) }),
    ticket(6, { status: "planned", assignee: p.lead }),
    ticket(7, { status: "backlog" }),
    ticket(8, { status: "backlog" }),
  ];
}

const GROUP_SEEDS: ProjectGroupSeed[] = GROUPS.map((g, order) => ({ id: g.id, slug: g.slug, name: g.name, order: order + 1, color: g.color, icon: g.icon }));

/**
 * The town document seed of Studio: one zone entry per group (same id, so it dresses that group's zone) with the
 * district's look. Names, order, colour and emblem come from the group; only the look is local to the world.
 */
export const STUDIO_TOWN_ZONES: TownZone[] = GROUPS.map((g) => ({
  id: g.id,
  look: { styleOptions: { season: g.look.season, planting: g.look.planting }, castId: g.look.castId },
}));

const idle = (p: Plan, w: number) => (p.index + w) % 4 === 0;

export const STUDIO_CONTENT: DemoContent = {
  session: "ekinsol",
  people: [
    { id: "nicky", displayName: "Nicky", role: "admin" },
    { id: "sam", displayName: "Sam", role: "member" },
  ],
  agents: [
    { id: "g-man", displayName: "G-Man", role: "lead", isCrewhubLead: true, memberOf: [] },
    ...PLANS.map((p): AgentSeed => ({ id: p.lead, displayName: `${p.key} Lead`, role: "lead", isCrewhubLead: false, memberOf: [] })),
    { id: "postman", displayName: "Postman", role: "router", isCrewhubLead: false, memberOf: [] },
    { id: "team-probe", displayName: "Team probe", role: "probe", isCrewhubLead: false, memberOf: [] },
  ],
  projects: PLANS.map((p) => p.seed),
  groups: GROUP_SEEDS,
  labels: GLOBAL_LABELS,
  milestones: [],
  releases: [],
  nextReleaseNumber: {},
  tickets: PLANS.flatMap(tickets),
  nextTicketNumber: Object.fromEntries(PLANS.map((p) => [p.key, 9])),
  lanes: [
    { name: "g-man", status: "idle", contextLine: null },
    ...PLANS.flatMap((p): LaneSeed[] => [
      { name: p.lead, status: "working", contextLine: `${p.key}-4: ${(WORK[(p.index * 5 + 4) % WORK.length] as [string, string])[0].toLowerCase()}`, workspace: `w${1 + Math.floor(p.index / 5)}` },
      ...p.workers.map((name, w): LaneSeed => ({ name, status: idle(p, w) ? "idle" : "working", contextLine: idle(p, w) ? null : `${p.key}-${4 + (w % 2)}: on it`, workspace: `w${1 + Math.floor(p.index / 5)}` })),
    ]),
    { name: "postman", status: "idle", contextLine: null },
  ],
  comments: PLANS.filter(reviewWaits).map((p) => ({ ticket: `${p.key}-3`, author: p.lead, ago: (30 + p.index * 7) * MINUTE, text: "Ready for review. One open point is in the description." })),
  progress: PLANS.map((p) => ({ ticket: `${p.key}-4`, agent: p.lead, kind: "start" as ProgressKind, text: "picked up; first pass today", ago: (40 + p.index * 9) * MINUTE })),
  dmHistory: [
    { agent: "g-man", author: "nicky", ago: 16 * 60 * MINUTE, text: "Twenty projects now. Tell me where I am needed, not everything." },
    { agent: "g-man", author: "g-man", ago: 16 * 60 * MINUTE - 2 * MINUTE, text: "Will do: only what waits on a person, per group." },
  ],
};

/** Prop requests land in the first project of the first group. */
export const STUDIO_PROPS: PropHome = { project: (PLANS[0] as Plan).seed.slug, lead: (PLANS[0] as Plan).lead, person: "nicky" };
export const STUDIO_PROPS_PROJECT = (PLANS[0] as Plan).seed.name;

const DURATION_MS = at("16:00");
const STEPS = ["first pass done", "edge cases listed", "tests added", "review notes worked in", "tried on a phone", "copy tightened", "measured before and after", "second pass done"];
const QUESTIONS = ["Is the short version enough for the first release?", "Keep the old behaviour behind a switch, or drop it?", "Which of the two wordings do we ship?", "Does this need to work offline too?"];
const ANSWERS = ["The short version, yes.", "Drop it; nobody asked for the old one.", "The second wording.", "Not in this round."];

function storyline(s: ScriptBuilder): void {
  // The authored times come from a fixed generator, so the story is the same for every jitter seed.
  const random = mulberry32(20261006);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)] as T;
  const end = DURATION_MS - 12 * SECOND;
  const by = (key: string) => PLANS.find((p) => p.key === key) as Plan;

  for (const p of PLANS) {
    const t4 = `${p.key}-4`;
    const t5 = `${p.key}-5`;
    // Steady work in every building: a progress line on the busy ticket about every 45 s.
    for (let t = 3 * SECOND + p.index * 2100; t < end; t += 41 * SECOND + Math.floor(random() * 9 * SECOND)) {
      s.add(t, { type: "progress", ticket: t4, agent: p.lead, worker: pick(p.workers), kind: "update", text: pick(STEPS) });
    }
    // Workers come and go between working and idle.
    for (let t = 20 * SECOND + p.index * 3700; t < end; t += 70 * SECOND + Math.floor(random() * 40 * SECOND)) {
      const name = pick(p.workers);
      const working = random() < 0.6;
      s.add(t, { type: "lane", name, status: working ? "working" : "idle", contextLine: working ? `${t4}: ${pick(STEPS)}` : null });
    }

    // Somewhere a person is needed, all loop long. The quiet ticket of each project has one or two episodes.
    const person = personFor(p);
    const ask = (t: number) => {
      s.add(t, { type: "progress", ticket: t5, agent: p.lead, kind: "question", text: pick(QUESTIONS) });
      s.add(t + 2 * SECOND, { type: "waitOn", by: p.lead, ticket: t5, on: person });
    };
    const answer = (t: number) => s.post(t, { type: "comment", by: person, ticket: t5, text: pick(ANSWERS) });
    if (startsWaiting(p)) {
      // Waits on a person from the start; answered, and asked again later.
      const answered = (70 + ((p.index * 97) % 240)) * SECOND;
      answer(answered);
      ask(answered + 5 * MINUTE);
      if (answered + 9 * MINUTE < end) answer(answered + 9 * MINUTE);
    } else {
      // The watchdog: a stall with a nudge (the postman brings it) or a call for attention, closed a few minutes later.
      const period = 6 * MINUTE + 30 * SECOND;
      const first = (12 + ((p.index * 131) % 390)) * SECOND;
      for (let t = first, round = 0; t + 3 * MINUTE < end; t += period, round++) {
        if ((p.index + round) % 3 === 2) {
          ask(t);
          answer(t + 150 * SECOND);
        } else if ((p.index + round) % 2 === 0) {
          s.post(t, { type: "stall", ticket: t5, reason: "stalled", quietMinutes: 20 + (p.index % 9), nudge: true });
          s.add(t + 140 * SECOND, { type: "progress", ticket: t5, agent: p.lead, kind: "update", text: "back on it after the nudge" });
          s.add(t + 146 * SECOND, { type: "resume", ticket: t5, resolution: "activity" });
        } else {
          s.add(t, { type: "stall", ticket: t5, reason: "attention", quietMinutes: 3 + (p.index % 4), nudge: false });
          s.add(t + 170 * SECOND, { type: "resume", ticket: t5, resolution: "attending" });
        }
      }
    }

    // One piece of traffic with a person per project, spread over the loop: each sends the postman out.
    const when = (50 + ((p.index * 43) % 800)) * SECOND;
    if (reviewWaits(p)) {
      // Nicky closes the review that waited on them; the lead sends the next ticket to review, waiting again.
      const next = `${p.key}-6`;
      s.add(when, { type: "move", by: "nicky", ticket: `${p.key}-3`, to: "done" });
      s.add(when + 50 * SECOND, { type: "move", by: p.lead, ticket: next, to: "in_progress" });
      s.add(when + 55 * SECOND, { type: "progress", ticket: next, agent: p.lead, kind: "start", text: "picked up after the review" });
      if (when + 4 * MINUTE < end) {
        s.add(when + 230 * SECOND, { type: "move", by: p.lead, ticket: next, to: "review" });
        s.add(when + 233 * SECOND, { type: "waitOn", by: p.lead, ticket: next, on: "nicky" });
      }
    } else if (p.index % 4 === 1) {
      s.post(when, { type: "comment", by: "sam", ticket: `${p.key}-3`, text: "Read it. One question in the description, otherwise good." });
    } else if (p.index % 4 === 2) {
      s.post(when, { type: "move", by: "nicky", ticket: `${p.key}-7`, to: "planned" });
    } else {
      s.post(when, { type: "createTicket", by: "sam", project: p.seed.slug, title: `Bug: ${p.seed.name} shows yesterday's data after waking up`, kind: "bug", priority: "high", body: "Seen twice this week on a laptop that slept overnight." });
    }
  }

  // Releases and archive batches: the truck visits three districts.
  const sync = by("SY");
  const release = s.post("4:10", { type: "releaseCreate", by: "nicky", project: sync.seed.slug, title: "Faster first sync", version: "2.4.0", tickets: ["SY-1", "SY-2"] });
  s.post("6:02", { type: "releaseRequestPublish", by: "nicky", project: sync.seed.slug });
  s.add("6:34", { type: "releasePublish", by: sync.lead, project: sync.seed.slug });
  s.add("8:50", { type: "move", by: "nicky", ticket: `@${release}`, to: "done" });
  s.add("9:40", { type: "archiveDone", by: "nicky", project: by("WB").seed.slug, tickets: ["WB-1", "WB-2"] });
  s.post("11:20", { type: "releaseCreate", by: "nicky", project: by("PG").seed.slug, title: "Rainy days", version: "1.3.0", tickets: ["PG-1", "PG-2"] });
  s.add("13:05", { type: "archiveDone", by: "sam", project: by("VN").seed.slug, tickets: ["VN-1", "VN-2"] });

  // A worker stuck on a permission prompt, and the operator asked where to look.
  s.add("7:10", { type: "lane", name: by("TM").workers[0] as string, status: "blocked", contextLine: "Allow write access to ./maps/cache? (y/n)" });
  s.add("9:15", { type: "lane", name: by("TM").workers[0] as string, status: "working", contextLine: "TM-4: tiles cached" });
  const where = s.post("2:40", { type: "dm", from: "nicky", agent: "g-man", text: "Where am I needed right now?" });
  s.add("2:58", { type: "dmReply", agent: "g-man", replyToClientId: `demo-a${where}`, text: "Five reviews wait on you, and four tickets wait on an answer. Brand and Lab are the quiet ones." });
}

export const STUDIO_STORY: Story = { durationMs: DURATION_MS, storyline, probeSilence: null };
