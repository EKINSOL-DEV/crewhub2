/**
 * `npm run loops:fake -- --port 8091 [--scenario small-team] [--speed 1] [--builder-key]`: a fake crewhub-loops on
 * 127.0.0.1 for running the world in live mode before the install. `--builder-key` makes the key behave like loops'
 * builder key (tickets, comments and `auth/me` only; everything else 403), so the host shows Unauthorized. The key lives in `tools/out/loops-fake.key` (mode 0600; reused
 * when it exists, so a restarted fake keeps the host's key valid) and is never printed.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenarioId } from "@crewhub/demo";
import { createLoopsFake } from "./fake.ts";

const KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/out/loops-fake.key");
const SPEEDS = [0, 1, 4, 16] as const;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

const builderKey = process.argv.includes("--builder-key");
const port = Number(option("port") ?? "8091");
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be a port number");
const scenario = parseScenarioId(option("scenario"));
const speed = Number(option("speed") ?? "1");
if (!(SPEEDS as readonly number[]).includes(speed)) throw new Error(`--speed must be one of ${SPEEDS.join(", ")}`);

let key: string | undefined;
try {
  key = (await readFile(KEY_FILE, "utf8")).trim() || undefined;
} catch {
  key = undefined;
}

const fake = await createLoopsFake({ port, scenario, speed: speed as 0 | 1 | 4 | 16, builderKey, ...(key === undefined ? {} : { key }) });
if (key === undefined) {
  await mkdir(path.dirname(KEY_FILE), { recursive: true });
  await writeFile(KEY_FILE, `${fake.key}\n`, { mode: 0o600 });
}
await chmod(KEY_FILE, 0o600);

console.log(`loops-fake listening on ${fake.url} (scenario ${scenario}, speed ${speed}, agent ${fake.keyName}${builderKey ? ", builder key: reads tickets only" : ""})`);
console.log(`Key file: ${KEY_FILE} (${key === undefined ? "new" : "reused"}; mode 0600)`);
console.log("Start the host against it with:");
console.log(`CREWHUB_WORLD_LOOPS_URL=${fake.url}`);
console.log(`CREWHUB_WORLD_KEY_FILE=${KEY_FILE}`);

const shutdown = () => {
  void fake.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
