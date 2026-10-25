import "@fontsource-variable/archivo";
import "./styles/tokens.css";
import "./styles/kit.css";
import "./styles/world.css";
import { lazy, StrictMode, Suspense, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./state/theme";
import { answerTabs, askTabsForPairing, prefetchSnapshot, probeHost, readPairing, redeemPairToken, takeFragmentToken, type HostHealth, type HostSourceOptions } from "@crewhub/loops-client";
import { decideSource, PROBE_TIMEOUT_MS, readSourceSetting, setFirstSnapshot, setSourceDecision, type SourceDecision } from "./state/source";
import { pairedDecision, pairingPlan } from "./state/pairing";
import { connectScreen } from "./state/connect";
import { ConnectPage } from "./components/ConnectPage";

/* The source (demo or live) is decided before the app's modules load: state/world.ts reads it at import. `auto` asks the
   host once; a silent host is the demo, said in one info line. The tab's pairing goes with it (round 27, per-tab bearer;
   state/pairing.ts has the order): a token in the URL fragment is exchanged for this tab's bearer first and taken out of
   the URL, so the probe sees `paired`; a tab without one asks the other tabs of this origin for theirs (300 ms) only when
   the decision is live and the host says this tab is not paired (round 39: the demo, a silent host, a tab that holds a
   bearer or came in through the link never wait), and a sibling's answer is followed by one more probe with the bearer.
   A paired tab answers such asks while it is open. */
async function decided() {
  const decision = await pairedDecision({
    plan: pairingPlan({ token: takeFragmentToken(), bearer: readPairing() }),
    redeem: async (token) => {
      const outcome = await redeemPairToken(token);
      if (outcome.kind === "refused") console.info(`CrewHub World: the pairing link was refused (${outcome.reason}).`);
    },
    decide: () => decideSource({ param: new URLSearchParams(window.location.search).get("source"), setting: readSourceSetting(), probe: (ms) => probeHost("", ms) }),
    ask: () => askTabsForPairing(),
    probe: () => probeHost("", PROBE_TIMEOUT_MS),
  });
  answerTabs();
  setSourceDecision(decision);
  if (decision.reason === "probe-silent") console.info("CrewHub World: no host answered /world-api/health; running the demo.");
  return decision;
}
/* The world's module, loaded once the decision is recorded. On the direct road to the world (the demo, a silent host, a
   host that is connected) it is awaited before the first render, so nothing suspends: React holds the commit of a
   Suspense boundary's resolution for up to 300 ms after the fallback it showed (the retry throttle), which was a
   quarter of a warm start. The lazy form serves the gate's later turn from a Connect screen to the world. */
const loadApp = () => import("./App").then(({ App }) => ({ default: App }));
const LazyApp = lazy(loadApp);

/* The gate (spec addendum "a smooth connection"): live mode shows one Connect screen per state of the host's connection
   (no loops found, pair this browser, connect, checking, key rejected) and follows the host's health until nothing stands
   between the browser and the town; then the world loads, with the fresh decision recorded first (state/world.ts reads it
   at import). The demo and a silent host go straight to the world. */
function Gate({ initial, app }: { initial: SourceDecision; app: ComponentType | null }) {
  const [decision, setDecision] = useState(initial);
  const screen = connectScreen(decision);
  if (screen === null || decision.health === null) {
    setSourceDecision(decision);
    const App = app ?? LazyApp;
    return <App />;
  }
  return <ConnectPage screen={screen} health={decision.health} onHealth={(health: HostHealth) => setDecision((before) => ({ ...before, health }))} />;
}
/* Live, straight to the world: the host's snapshot is asked for at once and given to the world's source (state/world.ts
   creates it at import) so the very first model has the town and the scene lays it out once. A snapshot that has
   arrived within SNAPSHOT_AHEAD_MS goes in as a body (the warm case: it is there before the world's module is); a
   slower one goes in as the pending response, the source's first read, and the world opens with its "first snapshot"
   note as before. */
const SNAPSHOT_AHEAD_MS = 150;
async function snapshotAhead(): Promise<HostSourceOptions["firstSnapshot"]> {
  const response = prefetchSnapshot();
  const arrived = await Promise.race([response, new Promise<null>((resolve) => setTimeout(() => resolve(null), SNAPSHOT_AHEAD_MS))]).catch(() => null);
  if (arrived === null || !arrived.ok) return { response };
  const body: unknown = await arrived
    .clone()
    .json()
    .catch(() => null);
  return body === null ? { response } : { body };
}
/** The world's page: the decision, then (straight to the world) the world's module, before the first render. */
async function world(): Promise<ComponentType> {
  const initial = await decided();
  const direct = connectScreen(initial) === null || initial.health === null;
  if (!direct) return () => <Gate initial={initial} app={null} />;
  if (initial.source === "live") setFirstSnapshot(await snapshotAhead());
  const app = (await loadApp()).default;
  return () => <Gate initial={initial} app={app} />;
}
// Two side pages, each loaded only when asked for: the prop-builder examples drawn by the parts renderer (review only,
// not linked from the UI) and the casting room (linked from Settings).
const path = window.location.pathname.replace(/\/$/, "");
const side =
  path === "/props-preview"
    ? lazy(() => import("./PropsPreview"))
    : path === "/tiers-preview"
      ? lazy(() => import("./TiersPreview"))
      : path === "/cast-preview"
        ? lazy(() => import("./CastPreview"))
        : null;

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

// index.html carries the same "Opening CrewHub…" line until the first render replaces it.
const render = (Page: ComponentType) =>
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <Suspense fallback={<p role="status">Opening CrewHub…</p>}>
          <Page />
        </Suspense>
      </ThemeProvider>
    </StrictMode>,
  );
if (side) render(side);
else void world().then(render);
