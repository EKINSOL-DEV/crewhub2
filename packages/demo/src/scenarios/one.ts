/**
 * "One project": a small installation a few weeks in. One project with a lead and two workers, and a short
 * storyline: work in progress, a review that waits on a person, a quiet ticket the watchdog notices, a prop request.
 * All of it is fiction; see CONTENT.md.
 */
import type { DemoContent } from "../content.ts";
import { requestedProp } from "../props.ts";
import { type PropHome, type ScriptBuilder, type Story, propFlow } from "../script.ts";
import { DAY, HOUR, MINUTE, at } from "../time.ts";
import { GLOBAL_LABELS } from "./shared.ts";

export const ONE_CONTENT: DemoContent = {
  session: "ekinsol",
  people: [{ id: "nicky", displayName: "Nicky", role: "admin" }],
  agents: [
    { id: "g-man", displayName: "G-Man", role: "lead", isCrewhubLead: true, memberOf: [] },
    { id: "pg-lead", displayName: "PG Lead", role: "lead", isCrewhubLead: false, memberOf: [] },
    { id: "postman", displayName: "Postman", role: "router", isCrewhubLead: false, memberOf: [] },
    { id: "team-probe", displayName: "Team probe", role: "probe", isCrewhubLead: false, memberOf: [] },
  ],
  projects: [
    {
      id: "pr_demo_one0001",
      slug: "pocket-garden",
      key: "PG",
      name: "Pocket Garden",
      color: "tangerine",
      icon: "spark",
      leadId: "pg-lead",
      description: "A watering reminder for balcony plants.",
      features: { milestones: false, releases: false, watchdog_nudge: true },
      archivedAgo: null,
    },
  ],
  groups: [],
  labels: [...GLOBAL_LABELS, { id: "lb_pg_ui", projectId: "pr_demo_one0001", name: "ui", color: "mist", revision: 1 }],
  milestones: [],
  releases: [],
  nextReleaseNumber: {},
  tickets: [
    { key: "PG-1", title: "Project skeleton and CI", kind: "task", priority: "normal", status: "done", assignee: "pg-lead", closedAgo: 9 * DAY, body: "Build, lint and one smoke test." },
    { key: "PG-2", title: "Plant list with a photo per plant", kind: "feature", priority: "normal", status: "done", assignee: "pg-lead", closedAgo: 4 * DAY, labels: ["ui"], body: "A card per plant: name, photo, last watered." },
    { key: "PG-3", title: "Watering schedule per plant", kind: "feature", priority: "high", status: "done", assignee: "pg-lead", closedAgo: 1 * DAY, body: "Every n days, with a start date." },
    { key: "PG-4", title: "Reminder at a time the person picks", kind: "feature", priority: "high", status: "review", assignee: "pg-lead", waitingOn: "nicky", body: "One reminder a day that lists the plants that are due." },
    { key: "PG-5", title: "Skip a watering when it rained", kind: "feature", priority: "normal", status: "in_progress", assignee: "pg-lead", body: "The person marks a rainy day; outdoor plants move one day on." },
    { key: "PG-6", title: "Empty state for the plant list", kind: "task", priority: "normal", status: "in_progress", assignee: "pg-lead", labels: ["ui"], body: "A drawing and one button: add your first plant." },
    { key: "PG-7", title: "Bug: the photo rotates on some phones", kind: "bug", priority: "urgent", status: "planned", assignee: "pg-lead", body: "The orientation flag of the photo is ignored." },
    { key: "PG-8", title: "Which plants count as outdoor?", kind: "question", priority: "normal", status: "planned", body: "A switch per plant, or a place per plant?" },
    { key: "PG-9", title: "Export the schedule as a calendar file", kind: "feature", priority: "low", status: "backlog", body: "One event per watering day." },
    { key: "PG-10", title: "Dark theme", kind: "task", priority: "low", status: "backlog", labels: ["ui"], body: "Follows the system setting." },
    { key: "PG-11", title: "Prop: a watering can for the lobby", kind: "task", priority: "normal", status: "backlog", labels: ["prop"], body: "Build it with the prop-builder skill and post the JSON on this ticket." },
  ],
  nextTicketNumber: { PG: 12 },
  lanes: [
    { name: "g-man", status: "idle", contextLine: null },
    { name: "pg-lead", status: "working", contextLine: "PG-5: the rainy-day rule" },
    { name: "pg-dev-1", status: "working", contextLine: "PG-5: moving outdoor plants one day on" },
    { name: "pg-design-1", status: "working", contextLine: "PG-6: empty state drawing" },
    { name: "postman", status: "idle", contextLine: null },
  ],
  comments: [
    { ticket: "PG-4", author: "pg-lead", ago: 50 * MINUTE, text: "Ready for review: one reminder a day, at the time from Settings." },
    { ticket: "PG-8", author: "nicky", ago: 3 * HOUR, text: "I lean towards a place per plant: balcony, windowsill, garden." },
  ],
  progress: [
    { ticket: "PG-5", agent: "pg-lead", kind: "start", text: "starting with the rainy-day mark", ago: 2 * HOUR },
    { ticket: "PG-5", agent: "pg-lead", worker: "pg-dev-1", kind: "update", text: "outdoor plants shift one day", ago: 20 * MINUTE },
    { ticket: "PG-6", agent: "pg-lead", worker: "pg-design-1", kind: "update", text: "two drawings to choose from", ago: 30 * MINUTE },
  ],
  dmHistory: [
    { agent: "g-man", author: "nicky", ago: 20 * HOUR, text: "How is Pocket Garden doing?" },
    { agent: "g-man", author: "g-man", ago: 20 * HOUR - 2 * MINUTE, text: "Three tickets done, the reminder is next." },
  ],
};

export const ONE_PROPS: PropHome = { project: "pocket-garden", lead: "pg-lead", person: "nicky" };

function storyline(s: ScriptBuilder): void {
  // 0:00 to 2:00: steady work on the rainy-day rule and the empty state.
  s.add("0:03", { type: "progress", ticket: "PG-5", agent: "pg-lead", worker: "pg-dev-1", kind: "update", text: "a rainy day moves outdoor plants, indoor ones stay" });
  s.add("0:16", { type: "progress", ticket: "PG-6", agent: "pg-lead", worker: "pg-design-1", kind: "update", text: "the drawing with the single pot reads best" });
  s.post("0:34", { type: "comment", by: "nicky", ticket: "PG-8", text: "Decided: a place per plant. Balcony and garden count as outdoor." });
  s.add("0:52", { type: "comment", by: "pg-lead", ticket: "PG-8", text: "Clear. PG-5 will read the place." });
  s.add("1:10", { type: "progress", ticket: "PG-5", agent: "pg-lead", kind: "update", text: "the rule reads the plant's place" });
  s.add("1:30", { type: "lane", name: "pg-design-1", status: "idle", contextLine: null });
  // Nicky reads the reminder and sends it back with one remark: a review reply.
  s.post("1:48", { type: "comment", by: "nicky", ticket: "PG-4", text: "Works. Please name the plants in the reminder, not only the count." });
  s.add("2:06", { type: "lane", name: "pg-design-1", status: "working", contextLine: "PG-4: reminder wording" });
  s.add("2:12", { type: "progress", ticket: "PG-4", agent: "pg-lead", worker: "pg-design-1", kind: "update", text: "the reminder lists up to three plant names" });

  // 2:30: the prop from the backlog.
  propFlow(s, at("2:30"), { ticket: "PG-11", json: requestedProp("a watering can for the lobby"), worker: "pg-dev-1", doneAfter: 128 }, ONE_PROPS);
  s.add("3:12", { type: "lane", name: "pg-dev-1", contextLine: "PG-11: building the prop" });

  s.add("3:20", { type: "progress", ticket: "PG-4", agent: "pg-lead", kind: "done", text: "names in the reminder, with \"and 2 more\"" });
  s.add("3:26", { type: "move", by: "pg-lead", ticket: "PG-4", to: "review" });
  s.add("3:28", { type: "waitOn", by: "pg-lead", ticket: "PG-4", on: "nicky" });
  s.add("3:32", { type: "lane", name: "pg-design-1", status: "working", contextLine: "PG-6: empty state drawing" });
  const hello = s.post("3:44", { type: "dm", from: "nicky", agent: "g-man", text: "Anything I should look at today?" });
  s.add("4:02", { type: "dmReply", agent: "g-man", replyToClientId: `demo-a${hello}`, text: "The reminder is back in review and waits on you. The photo bug is planned next." });
  s.add("4:20", { type: "move", by: "nicky", ticket: "PG-4", to: "done" });
  s.add("4:36", { type: "move", by: "pg-lead", ticket: "PG-7", to: "in_progress" });
  s.add("4:40", { type: "progress", ticket: "PG-7", agent: "pg-lead", kind: "start", text: "reproduced with a portrait photo" });
  s.add("4:58", { type: "lane", name: "pg-dev-1", contextLine: "PG-7: reading the orientation flag" });

  // 5:20: the rainy-day ticket has been quiet; the watchdog notices and nudges the lead.
  s.post("5:20", { type: "stall", ticket: "PG-5", reason: "stalled", quietMinutes: 21, nudge: true });
  s.add("5:48", { type: "lane", name: "pg-lead", contextLine: "PG-5: the test for two rainy days in a row" });
  s.add("6:04", { type: "progress", ticket: "PG-5", agent: "pg-lead", kind: "update", text: "two rainy days in a row shift twice" });
  s.add("6:10", { type: "resume", ticket: "PG-5", resolution: "activity" });
  s.add("6:30", { type: "progress", ticket: "PG-6", agent: "pg-lead", worker: "pg-design-1", kind: "done", text: "empty state in place, with the add button" });
  s.add("6:36", { type: "move", by: "pg-lead", ticket: "PG-6", to: "review" });
  s.add("6:40", { type: "lane", name: "pg-design-1", status: "idle", contextLine: null });
  s.add("6:56", { type: "progress", ticket: "PG-7", agent: "pg-lead", worker: "pg-dev-1", kind: "update", text: "the photo is turned before it is stored" });
  const bug = s.post("7:14", {
    type: "createTicket",
    by: "nicky",
    project: "pocket-garden",
    title: "Bug: the reminder fires twice after a time zone change",
    kind: "bug",
    priority: "high",
    body: "Flying home made the phone remind me twice.",
  });
  s.add("7:32", { type: "move", by: "nicky", ticket: "PG-6", to: "done" });
  s.post("7:50", { type: "move", by: "nicky", ticket: `@${bug}`, to: "planned" });
  // The lead asks a question on the rainy-day ticket and waits for the person.
  s.add("8:08", { type: "progress", ticket: "PG-5", agent: "pg-lead", kind: "question", text: "does a rainy day also skip plants under a roof?" });
  s.add("8:10", { type: "waitOn", by: "pg-lead", ticket: "PG-5", on: "nicky" });
  s.add("8:14", { type: "lane", name: "pg-lead", status: "idle" });
  s.post("8:46", { type: "comment", by: "nicky", ticket: "PG-5", text: "No: under a roof counts as indoor." });
  s.add("9:00", { type: "lane", name: "pg-lead", status: "working", contextLine: "PG-5: the place \"covered balcony\"" });
  s.add("9:12", { type: "progress", ticket: "PG-7", agent: "pg-lead", kind: "done", text: "portrait and landscape photos both upright" });
  s.add("9:18", { type: "move", by: "pg-lead", ticket: "PG-7", to: "review" });
  s.add("9:22", { type: "lane", name: "pg-dev-1", contextLine: "PG-5: moving outdoor plants one day on" });
  s.add("9:40", { type: "progress", ticket: "PG-5", agent: "pg-lead", worker: "pg-dev-1", kind: "update", text: "covered places stay on their day" });
}

export const ONE_STORY: Story = { durationMs: at("10:00"), storyline, probeSilence: null };
