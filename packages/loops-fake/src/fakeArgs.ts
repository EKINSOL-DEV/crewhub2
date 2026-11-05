/**
 * The command line of `npm run loops:fake` (round 64, L-1): one pure function over the arguments, so that nothing a person
 * mistypes reaches the listen. An unknown flag used to be ignored like a missing one, and `--help` or `--prot 5386` then
 * started the fake on its default port, a named port. `--help` wins wherever it stands; otherwise the flags are checked
 * first, then the port, the scenario and the speed. The tests are `test/fakeArgs.test.ts` and `test/mainArgs.test.ts`;
 * `--viewer-key` (round 65, C: the key reads the chat, as loops' viewer key does) is `test/viewerKeyArgs.test.ts`.
 */
import { type ScenarioId, DEFAULT_SCENARIO, SCENARIO_IDS, scenarioIdOf } from "@crewhub/demo";
import { FAKE_DEFAULT_PORT, FAKE_REFUSED_PORTS, fakePortVerdict } from "./ports.ts";

const FAKE_SPEEDS = [0, 1, 4, 16] as const;
const DEFAULT_SPEED = 1;
const VALUE_FLAGS: readonly string[] = ["--port", "--scenario", "--speed"];

const USAGE_LINE = `Usage: npm run loops:fake -- --port ${FAKE_DEFAULT_PORT} [--scenario ${DEFAULT_SCENARIO}] [--speed ${DEFAULT_SPEED}] [--builder-key] [--viewer-key] [--help]`;
const USAGE = [
  USAGE_LINE,
  `  --port <port>     the port on 127.0.0.1, default ${FAKE_DEFAULT_PORT}; 0 takes a free port; never ${FAKE_REFUSED_PORTS.join(", ")}`,
  `  --scenario <id>   the demo scenario, default ${DEFAULT_SCENARIO}; one of ${SCENARIO_IDS.join(", ")}`,
  `  --speed <n>       the pace, default ${DEFAULT_SPEED}; one of ${FAKE_SPEEDS.join(", ")}`,
  "  --builder-key     the key behaves like loops' builder key (tickets, comments and auth/me only; everything else 403)",
  "  --viewer-key      the key reads the chat, as loops' viewer key does: the world shows bubbles and Recent answers over it",
  "  --help, -h        this text; the fake does not start",
].join("\n");

export type FakeArgs =
  | { kind: "help"; text: string }
  | { kind: "refuse"; text: string }
  | { kind: "start"; port: number; scenario: ScenarioId; speed: (typeof FAKE_SPEEDS)[number]; builderKey: boolean; viewerKey: boolean };

function refuse(text: string): FakeArgs {
  return { kind: "refuse", text };
}

/** `argv` is what follows the script: `process.argv.slice(2)`. */
export function parseFakeArgs(argv: readonly string[]): FakeArgs {
  const values = new Map<string, string>();
  let builderKey = false;
  let viewerKey = false;
  let help = false;
  let flagRefusal: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index] as string;
    if (word === "--help" || word === "-h") help = true;
    else if (word === "--builder-key") builderKey = true;
    else if (word === "--viewer-key") viewerKey = true;
    else if (VALUE_FLAGS.includes(word)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) flagRefusal ??= `${word} needs a value`;
      else {
        if (!values.has(word)) values.set(word, value);
        index++;
      }
    } else if (word.startsWith("-")) flagRefusal ??= `"${word}" is not a flag of the fake\n${USAGE_LINE}`;
    else flagRefusal ??= `"${word}" is a stray word: the fake takes flags only\n${USAGE_LINE}`;
  }
  if (help) return { kind: "help", text: USAGE };
  if (flagRefusal !== undefined) return refuse(flagRefusal);
  // One key, one behaviour: loops' builder key never reads the chat, so the two flags cannot be meant together.
  if (builderKey && viewerKey) return refuse("--builder-key and --viewer-key cannot both be given: loops' builder key reads tickets, never the chat");

  // Never 8091 (the Mac app's port: a host's discovery would take a fake there for the app), its other ports, or 5180 (round 36).
  const portVerdict = fakePortVerdict(values.get("--port"));
  if (!portVerdict.ok) return refuse(portVerdict.reason);
  // An unknown id is refused (round 54): a typo must not play the default.
  const scenarioText = values.get("--scenario");
  const scenario = scenarioText === undefined ? DEFAULT_SCENARIO : scenarioIdOf(scenarioText);
  if (scenario === null) return refuse(`--scenario ${scenarioText}: no such demo scenario; one of ${SCENARIO_IDS.join(", ")}`);
  const speedNumber = Number(values.get("--speed") ?? DEFAULT_SPEED);
  const speed = FAKE_SPEEDS.find((known) => known === speedNumber);
  if (speed === undefined) return refuse(`--speed must be one of ${FAKE_SPEEDS.join(", ")}`);

  return { kind: "start", port: portVerdict.port, scenario, speed, builderKey, viewerKey };
}
