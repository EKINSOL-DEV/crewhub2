/* The page, read once: its query, its path, the build's flag and the source decision main.tsx made before mount become
   one PageConfig, from which state/runtimes.ts builds the world's runtimes. `readPageConfig` is pure, so a node test
   pins every fact a page's address decides; `pageConfig()` reads the browser's once, on the first call (after main.tsx
   decided the source, as the import-time reads this replaces did). */
import { DEFAULT_SCENARIO, demoScenario, demoScenarios, parseScenarioId, parseStressSize, STRESS_FIXTURES, STRESS_SIZES, type DemoScenario, type StressSize } from "@crewhub/demo";
import { sourceDecision, townCopySource, townKeyFor, type SourceDecision } from "./source.ts";

export interface ScenarioChoice {
  id: string;
  name: string;
  summary: string;
  current: boolean;
  /** Where choosing it goes: this page with the scenario in the URL. */
  href: string;
}

export interface PageConfig {
  /**
   * `?stress=12` and `?stress=20` (dev builds only): the synthetic stress towns (12 buildings with 100 agents, or 20
   * buildings with 200 agents in four groups) through the same seam, with a frame-time overlay. Null otherwise.
   */
  stressSize: StressSize | null;
  stress: boolean;
  /**
   * `?buildings=N` (dev builds only): the world shows only the first N projects of its source; NaN for all. With the
   * same town document, raising N step by step is a town growing.
   */
  buildingLimit: number;
  /** `?scenario=<id>`: which demo installation the world shows; the default storyline without it. */
  scenario: DemoScenario;
  /** The source this page runs on, decided before mount (main.tsx): the demo, or the live host. */
  source: SourceDecision;
  live: boolean;
  /** The storage key of the town document: the live town of this crewhub-loops installation, else one per scenario and per stress fixture. */
  townKey: string;
  /** A live town made before the key carried the installation (the plain live key) is copied once into townKey; null for a demo page. */
  townCopyFrom: string | null;
  /** The Demo chip's picker: every scenario, and in dev builds the stress fixtures. Choosing one reloads the page. */
  scenarioChoices: ScenarioChoice[];
}

export interface PageInput {
  /** The page's query (`location.search`). */
  search: string;
  pathname: string;
  /** A dev build (`import.meta.env.DEV`): the stress fixtures and `?buildings` count. */
  dev: boolean;
  decision: SourceDecision;
}

export function readPageConfig(input: PageInput): PageConfig {
  const params = new URLSearchParams(input.search);
  const stressSize = input.dev ? parseStressSize(params.get("stress")) : null;
  const buildingLimit = input.dev ? Math.max(0, Math.floor(Number(params.get("buildings") ?? NaN))) : NaN;
  const scenario = demoScenario(parseScenarioId(params.get("scenario")));
  const source = input.decision;
  const townKey = townKeyFor({ source: source.source, scenarioTownKey: scenario.townKey, stressSize, loopsWebUrl: source.health?.loopsWebUrl ?? null });
  return {
    stressSize,
    stress: stressSize !== null,
    buildingLimit,
    scenario,
    source,
    live: source.source === "live",
    townKey,
    townCopyFrom: townCopySource({ source: source.source, townKey }),
    scenarioChoices: scenarioChoicesFor(params, input.pathname, scenario.id, stressSize, input.dev),
  };
}

/** Every scenario, and in dev builds the stress fixtures; each href is this page with the scenario (or stress) in the query. */
function scenarioChoicesFor(page: URLSearchParams, pathname: string, scenarioId: string, stressSize: StressSize | null, dev: boolean): ScenarioChoice[] {
  const href = (set: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(page);
    params.delete("scenario");
    params.delete("stress");
    set(params);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };
  const choices: ScenarioChoice[] = demoScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    current: stressSize === null && s.id === scenarioId,
    href: href((params) => s.id !== DEFAULT_SCENARIO && params.set("scenario", s.id)),
  }));
  if (dev)
    for (const size of STRESS_SIZES)
      choices.push({
        id: `stress-${size}`,
        name: `Stress ${size}`,
        summary: `${STRESS_FIXTURES[size].agents} agents`,
        current: stressSize === size,
        href: href((params) => params.set("stress", String(size))),
      });
  return choices;
}

let page: PageConfig | null = null;

/** This page's config, read once from the address bar, the build and the source decision. */
export function pageConfig(): PageConfig {
  page ??= readPageConfig({ search: globalThis.location?.search ?? "", pathname: globalThis.location?.pathname ?? "/", dev: import.meta.env.DEV, decision: sourceDecision() });
  return page;
}
