/**
 * The pure part of `tools/timeworld.mjs`'s command line (round 57d, `docs/proposals/mutation-harness.md` §5b.2): which
 * crewhub-loops the timed `npm run world` reads. The tool calls `timeworldTarget` right after reading its command line,
 * before `--cold` removes a build, a fake starts or a browser opens. Nothing here touches the disk or the network; the
 * test is `scripts/test/timeworldArgs.test.ts`.
 *
 * - `--fake <port>`: a fake crewhub-loops the tool starts on a port of yours.
 * - `--loops-env <file>`: the development loops, its key file named by that env file's `LOOPS_DEV_KEY_FILE`.
 * - Neither: refused. No env file is searched for (before, the first `tools/out/loops-dev.env` of this worktree or the
 *   main checkout was taken, and the host aimed at the development loops on 8291 without being asked).
 * - Both: refused, they name two different crewhub-loops.
 */

export type TimeworldArgs = { fake: string; loopsEnv: string };
export type TimeworldTarget = { ok: true; fake: string; loopsEnv: "" } | { ok: true; fake: ""; loopsEnv: string } | { ok: false; reason: string };

/** `--fake` and `--loops-env`, each "" when not given. Answers the one that is given. */
export function timeworldTarget({ fake, loopsEnv }: TimeworldArgs): TimeworldTarget {
  const port = fake.trim();
  const file = loopsEnv.trim();
  if (port !== "" && file !== "") return { ok: false, reason: "--fake and --loops-env name two different crewhub-loops: give one of them" };
  if (port !== "") return { ok: true, fake: port, loopsEnv: "" };
  if (file !== "") return { ok: true, fake: "", loopsEnv: file };
  return { ok: false, reason: "timeworld needs a crewhub-loops to time against: --fake <port> (a fake it starts on a port of yours) or --loops-env <file> (the development loops' env file); no env file is searched for" };
}
