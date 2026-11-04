/**
 * The pure part of `tools/regress.mjs`'s command line (round 57d, `docs/proposals/mutation-harness.md` §5b.1): which
 * groups run, whether the real development crewhub-loops is asked for, and which env file names it. The tool calls
 * `regressPlan` right after reading its command line, before a browser, a host or a fake starts. Nothing here touches
 * the disk or the network; the test is `scripts/test/regressArgs.test.ts`.
 *
 * - The default is the nine groups that use fakes and stubs. `real` and the connect group's real half run only when
 *   `real` is named in `--groups`: that is the one opt-in, and `--real` is refused with the way to say it.
 * - The env file of the real development loops is `--loops-env` and nothing else: no file is searched for in this
 *   worktree, the main checkout or `~/Documents/GitHub`. `real` without it is refused; without `real` it is not read.
 */

/** Every group, in `--groups`' order. The groups run in the order they stand in regress.mjs, whatever `--groups` lists. */
export const GROUPS: readonly string[] = ["connect", "walk", "demo", "tour", "live", "town", "ops", "chat", "rooms", "real"];
/** The groups of a run that does not name `--groups`: every group but `real`, which aims at the development loops. */
export const DEFAULT_GROUPS: readonly string[] = GROUPS.filter((name) => name !== "real");

export type RegressArgs = { groups: string; real: boolean; loopsEnv: string };
export type RegressPlan = { ok: true; groups: string[]; real: boolean; loopsEnv: string } | { ok: false; reason: string };

/**
 * `--groups` (a comma-separated list, "" when not given), `--real` (a flag, always refused) and `--loops-env` ("" when
 * not given). Answers the groups to run, whether the real development loops is asked for (the `real` group and the
 * connect group's real half) and the env file to read for it ("" when it is not asked for).
 */
export function regressPlan({ groups, real, loopsEnv }: RegressArgs): RegressPlan {
  if (real) return { ok: false, reason: "--real is not an option: name real in --groups (--groups real, or --groups connect,real for the connect group's real half too) to run against the development loops" };
  const asked = groups.split(",").map((name) => name.trim()).filter(Boolean);
  const unknown = asked.find((name) => !GROUPS.includes(name));
  if (unknown !== undefined) return { ok: false, reason: `unknown group "${unknown}"; known: ${GROUPS.join(", ")}` };
  const chosen = asked.length === 0 ? [...DEFAULT_GROUPS] : asked;
  const wantsReal = chosen.includes("real");
  const file = loopsEnv.trim();
  if (wantsReal && file === "") return { ok: false, reason: "real reads the development loops from --loops-env <file> only (its LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE): name the file, no file is searched for" };
  return { ok: true, groups: chosen, real: wantsReal, loopsEnv: wantsReal ? file : "" };
}
