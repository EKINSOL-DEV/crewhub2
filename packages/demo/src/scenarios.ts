/**
 * The demo's scenarios: each one is an installation (`DemoContent`) and a storyline over it, played by the same
 * `createDemoSource`. They show the world at every size, from no project at all to a studio of twenty. A scenario is
 * chosen by id (the world reads `?scenario=<id>` and offers a picker on the Demo chip) and keeps its own town
 * document, so plots and placements of one never mix into another. All of them are fiction.
 */
import type { TownZone } from "@crewhub/world-model";
import { type DemoContent, SMALL_TEAM } from "./content.ts";
import { type PropHome, type Story, SMALL_TEAM_STORY } from "./script.ts";
import { FIRST_PROJECT, FIRST_PROJECT_AT_MS, FRESH_CONTENT, FRESH_PROPS, FRESH_STORY } from "./scenarios/fresh.ts";
import { ONE_CONTENT, ONE_PROPS, ONE_STORY } from "./scenarios/one.ts";
import { STUDIO_CONTENT, STUDIO_PROPS, STUDIO_PROPS_PROJECT, STUDIO_STORY, STUDIO_TOWN_ZONES } from "./scenarios/studio.ts";

export const SCENARIO_IDS = ["fresh", "one", "small-team", "studio"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
/** The scenario the world opens with until a person chooses another. */
export const DEFAULT_SCENARIO: ScenarioId = "small-team";

export interface DemoScenario {
  id: ScenarioId;
  /** The picker's label. */
  name: string;
  /** A few words for the picker, beside the name: how big this installation is. */
  summary: string;
  content: DemoContent;
  story: Story;
  /** Where "Request a prop" lands, and from which script position it can (the project must exist). */
  props: PropHome & { fromMs: number; projectName: string };
  /**
   * The storage key of this scenario's town document (the world uses it as the name of its database). The default
   * scenario keeps the key the world always used, so a town somebody built before scenarios existed stays where it is.
   */
  townKey: string;
  /**
   * The zones a new town document of this scenario starts with: the look per district (style options, cast), keyed
   * by the group's id. Loops would not carry looks, so they are the town's, not the source's. Only Studio has any.
   */
  townZones: TownZone[];
}

const SCENARIOS: Record<ScenarioId, DemoScenario> = {
  fresh: {
    id: "fresh",
    name: "Fresh install",
    summary: "No project yet",
    content: FRESH_CONTENT,
    story: FRESH_STORY,
    props: { ...FRESH_PROPS, fromMs: FIRST_PROJECT_AT_MS, projectName: FIRST_PROJECT.name },
    townKey: "crewhub-world.fresh",
    townZones: [],
  },
  one: {
    id: "one",
    name: "One project",
    summary: "1 project",
    content: ONE_CONTENT,
    story: ONE_STORY,
    props: { ...ONE_PROPS, fromMs: 0, projectName: "Pocket Garden" },
    townKey: "crewhub-world.one",
    townZones: [],
  },
  "small-team": {
    id: "small-team",
    name: "Small team",
    summary: "4 projects",
    content: SMALL_TEAM,
    story: SMALL_TEAM_STORY,
    props: { project: "crewhub", lead: "cr-lead", person: "nicky", fromMs: 0, projectName: "CrewHub World" },
    townKey: "crewhub-world",
    townZones: [],
  },
  studio: {
    id: "studio",
    name: "Studio",
    summary: "20 projects, 4 groups",
    content: STUDIO_CONTENT,
    story: STUDIO_STORY,
    props: { ...STUDIO_PROPS, fromMs: 0, projectName: STUDIO_PROPS_PROJECT },
    townKey: "crewhub-world.studio",
    townZones: STUDIO_TOWN_ZONES,
  },
};

/** Every scenario, in the picker's order (smallest installation first). */
export function demoScenarios(): DemoScenario[] {
  return SCENARIO_IDS.map((id) => SCENARIOS[id]);
}

export function demoScenario(id: ScenarioId): DemoScenario {
  return SCENARIOS[id];
}

/** The scenario a URL parameter or a stored choice names; the default for anything unknown. */
export function parseScenarioId(value: string | null | undefined): ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value ?? "") ? (value as ScenarioId) : DEFAULT_SCENARIO;
}
