/**
 * "Fresh install": crewhub-loops right after the installer. A person, the crewhub lead, the router and the probe
 * exist; there is no project at all. A minute in, the person creates the first project (`project.created`, as loops
 * emits it), its lead's lane comes up, and the first tickets follow. All of it is fiction; see CONTENT.md.
 */
import type { DemoContent, ProjectSeed } from "../content.ts";
import { requestedProp } from "../props.ts";
import { type PropHome, type ScriptBuilder, type Story, propFlow } from "../script.ts";
import { at } from "../time.ts";
import { GLOBAL_LABELS } from "./shared.ts";

/** The project the person creates at 1:00. */
export const FIRST_PROJECT: ProjectSeed = {
  id: "pr_demo_fresh01",
  slug: "field-notes",
  key: "FN",
  name: "Field Notes",
  color: "mist",
  icon: "folder",
  leadId: "fn-lead",
  description: "A small notes app: the first project of this installation.",
  features: { milestones: false, releases: false, watchdog_nudge: false },
  archivedAgo: null,
};

/** When the first project exists: prop requests made before it start here. */
export const FIRST_PROJECT_AT_MS = at("1:00");

export const FRESH_CONTENT: DemoContent = {
  session: "ekinsol",
  people: [{ id: "nicky", displayName: "Nicky", role: "admin" }],
  agents: [
    { id: "g-man", displayName: "G-Man", role: "lead", isCrewhubLead: true, memberOf: [] },
    // Registered during onboarding (the "lead" step comes before the "project" step); its lane starts with the project.
    { id: "fn-lead", displayName: "FN Lead", role: "lead", isCrewhubLead: false, memberOf: [] },
    { id: "postman", displayName: "Postman", role: "router", isCrewhubLead: false, memberOf: [] },
    { id: "team-probe", displayName: "Team probe", role: "probe", isCrewhubLead: false, memberOf: [] },
  ],
  projects: [],
  groups: [],
  labels: GLOBAL_LABELS,
  milestones: [],
  releases: [],
  nextReleaseNumber: {},
  tickets: [],
  nextTicketNumber: {},
  lanes: [
    { name: "g-man", status: "idle", contextLine: null },
    { name: "postman", status: "idle", contextLine: null },
  ],
  comments: [],
  progress: [],
  dmHistory: [],
};

export const FRESH_PROPS: PropHome = { project: FIRST_PROJECT.slug, lead: "fn-lead", person: "nicky" };

function storyline(s: ScriptBuilder): void {
  // 0:00 to 1:00: nothing but the operator and the postman at home. One message, so the postman has a first walk.
  const hello = s.post("0:14", { type: "dm", from: "nicky", agent: "g-man", text: "Loops is installed. Are you there?" });
  s.add("0:30", { type: "dmReply", agent: "g-man", replyToClientId: `demo-a${hello}`, text: "Here. Create a project and I will show its lead around." });

  // 1:00: the first project. Its building goes up; the lead's lane starts a little later.
  s.add(FIRST_PROJECT_AT_MS, { type: "projectCreate", by: "nicky", project: FIRST_PROJECT }, false);
  s.add("1:10", { type: "laneJoin", name: "fn-lead", status: "idle", contextLine: null });
  const readme = s.post("1:26", {
    type: "createTicket",
    by: "nicky",
    project: "field-notes",
    title: "Write the README",
    kind: "task",
    priority: "normal",
    body: "What the app is, how to run it, where the notes are stored.",
  });
  s.post("1:44", { type: "move", by: "nicky", ticket: `@${readme}`, to: "planned" });
  s.add("2:02", { type: "assign", by: "fn-lead", ticket: `@${readme}`, assignee: "fn-lead" });
  s.add("2:06", { type: "move", by: "fn-lead", ticket: `@${readme}`, to: "in_progress" });
  s.add("2:08", { type: "lane", name: "fn-lead", status: "working", contextLine: "FN-1: outline of the README" });
  s.add("2:12", { type: "progress", ticket: `@${readme}`, agent: "fn-lead", kind: "start", text: "starting with the outline" });
  const list = s.post("2:30", {
    type: "createTicket",
    by: "nicky",
    project: "field-notes",
    title: "List notes by day",
    kind: "feature",
    priority: "high",
    body: "The home screen groups notes under the day they were written.",
  });
  s.add("2:44", { type: "laneJoin", name: "fn-dev-1", status: "working", contextLine: "FN-1: run instructions" });
  s.add("2:50", { type: "progress", ticket: `@${readme}`, agent: "fn-lead", worker: "fn-dev-1", kind: "update", text: "run instructions written and tried on a clean checkout" });
  const typo = s.post("3:08", {
    type: "createTicket",
    by: "nicky",
    project: "field-notes",
    title: "Bug: a note saved at midnight lands on the wrong day",
    kind: "bug",
    priority: "normal",
    body: "The day comes from UTC, not from the local clock.",
  });
  s.post("3:24", { type: "move", by: "nicky", ticket: `@${list}`, to: "planned" });
  s.add("3:40", { type: "progress", ticket: `@${readme}`, agent: "fn-lead", kind: "done", text: "README ready to read" });
  s.add("3:44", { type: "move", by: "fn-lead", ticket: `@${readme}`, to: "review" });
  s.add("3:46", { type: "waitOn", by: "fn-lead", ticket: `@${readme}`, on: "nicky" });
  s.add("3:50", { type: "comment", by: "fn-lead", ticket: `@${readme}`, text: "Ready for a read. The storage section is the part to check." });
  s.add("3:56", { type: "assign", by: "fn-lead", ticket: `@${list}`, assignee: "fn-lead" });
  s.add("4:00", { type: "move", by: "fn-lead", ticket: `@${list}`, to: "in_progress" });
  s.add("4:02", { type: "lane", name: "fn-lead", contextLine: "FN-2: grouping notes by day" });
  s.add("4:04", { type: "lane", name: "fn-dev-1", contextLine: "FN-2: the day header" });
  s.add("4:10", { type: "progress", ticket: `@${list}`, agent: "fn-lead", worker: "fn-dev-1", kind: "start", text: "day header and an empty state" });
  s.add("4:30", { type: "move", by: "nicky", ticket: `@${readme}`, to: "done" });
  s.add("4:52", { type: "progress", ticket: `@${list}`, agent: "fn-lead", kind: "update", text: "notes sort inside a day, newest first" });

  // 5:10: the first prop request, the same flow as in every scenario.
  propFlow(s, at("5:10"), { title: "Prop: a welcome mat", json: requestedProp("a welcome mat"), worker: "fn-dev-1", doneAfter: 132 }, FRESH_PROPS);
  s.add("5:52", { type: "lane", name: "fn-dev-1", contextLine: "FN-4: building the prop" });

  s.post("7:34", { type: "move", by: "nicky", ticket: `@${typo}`, to: "planned" });
  s.add("7:50", { type: "progress", ticket: `@${list}`, agent: "fn-lead", worker: "fn-dev-1", kind: "update", text: "the day header follows the local clock" });
  s.add("7:54", { type: "lane", name: "fn-dev-1", contextLine: "FN-2: the day header" });
  s.post("8:20", { type: "comment", by: "nicky", ticket: `@${list}`, text: "Looks right. Does an empty day show at all?" });
  s.add("8:40", { type: "comment", by: "fn-lead", ticket: `@${list}`, text: "No: only days with a note are listed." });
  s.add("9:00", { type: "move", by: "fn-lead", ticket: `@${list}`, to: "review" });
  s.add("9:04", { type: "lane", name: "fn-dev-1", status: "idle", contextLine: null });
  s.add("9:08", { type: "lane", name: "fn-lead", status: "idle", contextLine: null });
  s.add("9:30", { type: "move", by: "nicky", ticket: `@${list}`, to: "done" });
}

export const FRESH_STORY: Story = { durationMs: at("10:00"), storyline, probeSilence: null };
