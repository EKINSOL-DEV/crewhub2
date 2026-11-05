/**
 * `npm run loops:fake -- --port 8391 [--scenario small-team] [--speed 1] [--builder-key] [--viewer-key] [--help]`: a fake
 * crewhub-loops on 127.0.0.1 for running the world in live mode before the install. `--builder-key` makes the key behave like
 * loops' builder key (tickets, comments and `auth/me` only; everything else 403), so the host shows Unauthorized.
 * `--viewer-key` (round 65) makes the key read the chat, as loops' viewer key does (`keyReadsChat`), so the world shows
 * bubbles and Recent answers over the fake; the two cannot be given together. The key lives in `tools/out/loops-fake.key` (mode 0600; reused
 * when it exists, so a restarted fake keeps the host's key valid) and is never printed. `--help` or `-h` prints the usage and
 * exits 0; an unknown flag, a stray word or a bad value is refused with exit 2 (`fakeArgs.ts`). Neither starts the fake.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLoopsFake } from "./fake.ts";
import { parseFakeArgs } from "./fakeArgs.ts";

const KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/out/loops-fake.key");

const args = parseFakeArgs(process.argv.slice(2));
if (args.kind === "help") {
  console.log(args.text);
  process.exit(0);
}
if (args.kind === "refuse") {
  console.error(args.text);
  process.exit(2);
}
const { port, scenario, speed, builderKey, viewerKey } = args;

let key: string | undefined;
try {
  key = (await readFile(KEY_FILE, "utf8")).trim() || undefined;
} catch {
  key = undefined;
}

const fake = await createLoopsFake({ port, scenario, speed, builderKey, keyReadsChat: viewerKey, ...(key === undefined ? {} : { key }) });
if (key === undefined) {
  await mkdir(path.dirname(KEY_FILE), { recursive: true });
  await writeFile(KEY_FILE, `${fake.key}\n`, { mode: 0o600 });
}
await chmod(KEY_FILE, 0o600);

console.log(`loops-fake listening on ${fake.url} (scenario ${scenario}, speed ${speed}, agent ${fake.keyName}${builderKey ? ", builder key: reads tickets only" : ""}${viewerKey ? ", viewer key: reads the chat" : ""})`);
console.log(`Key file: ${KEY_FILE} (${key === undefined ? "new" : "reused"}; mode 0600)`);
console.log("Start the host against it with:");
console.log(`CREWHUB_WORLD_LOOPS_URL=${fake.url}`);
console.log(`CREWHUB_WORLD_KEY_FILE=${KEY_FILE}`);

const shutdown = () => {
  void fake.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
