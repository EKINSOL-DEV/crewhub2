/**
 * The port `npm run loops:fake -- --port <port>` may take (round 36). Never the Mac app's (8091: a host's discovery would
 * take a fake there for the app; 8000 and 9443: the app's other listeners) and never 5180, the world host's default,
 * where somebody's real `npm run world` listens. Pure; the test is `test/fakePort.test.ts`.
 */
export const FAKE_DEFAULT_PORT = 8391;
export const FAKE_REFUSED_PORTS: readonly number[] = [8091, 8000, 9443, 5180];

export type FakePortVerdict = { ok: true; port: number } | { ok: false; reason: string };

export function fakePortVerdict(text: string | undefined, fallback: number = FAKE_DEFAULT_PORT): FakePortVerdict {
  const given = text === undefined ? String(fallback) : text.trim();
  const port = Number(given);
  if (given === "" || !Number.isInteger(port) || port < 0 || port > 65535) return { ok: false, reason: `--port must be a port number, not "${given}"` };
  if (port === 5180) return { ok: false, reason: `--port ${port}: that is the world host's default port, where somebody's real npm run world listens; a fake takes a port of its own` };
  if (FAKE_REFUSED_PORTS.includes(port)) return { ok: false, reason: `--port ${port}: that is the Mac app's port, never a fake's (a host's discovery would take the fake for the app)` };
  return { ok: true, port };
}
