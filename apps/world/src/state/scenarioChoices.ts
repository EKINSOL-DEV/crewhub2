/* The Demo chip's picker (state/world.ts's `scenarioChoices`), from the page's query, path, scenario and stress size.
   Pure, so a node test can pin it: world.ts reads them at import. */
import { DEFAULT_SCENARIO, demoScenarios, STRESS_FIXTURES, STRESS_SIZES, type StressSize } from "@crewhub/demo";

export interface ScenarioChoice {
  id: string;
  name: string;
  summary: string;
  current: boolean;
  /** Where choosing it goes: this page with the scenario in the URL. */
  href: string;
}

export interface ScenarioPage {
  /** The page's query. */
  params: URLSearchParams;
  pathname: string;
  /** The scenario shown (the default one without `?scenario`). */
  scenarioId: string;
  /** The stress fixture shown, or null. */
  stressSize: StressSize | null;
  /** A dev build: the stress fixtures are offered too. */
  dev: boolean;
}

/** Every scenario, and in dev builds the stress fixtures. Choosing one reloads the page. */
export function scenarioChoicesFor(page: ScenarioPage): ScenarioChoice[] {
  const href = (set: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(page.params);
    params.delete("scenario");
    params.delete("stress");
    set(params);
    const query = params.toString();
    return `${page.pathname}${query ? `?${query}` : ""}`;
  };
  const choices: ScenarioChoice[] = demoScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    current: page.stressSize === null && s.id === page.scenarioId,
    href: href((params) => s.id !== DEFAULT_SCENARIO && params.set("scenario", s.id)),
  }));
  if (page.dev)
    for (const size of STRESS_SIZES)
      choices.push({
        id: `stress-${size}`,
        name: `Stress ${size}`,
        summary: `${STRESS_FIXTURES[size].agents} agents`,
        current: page.stressSize === size,
        href: href((params) => params.set("stress", String(size))),
      });
  return choices;
}
