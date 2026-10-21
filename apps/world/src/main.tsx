import "@fontsource-variable/archivo";
import "./styles/tokens.css";
import "./styles/kit.css";
import "./styles/world.css";
import { lazy, StrictMode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./state/theme";
import { probeHost, type HostHealth } from "@crewhub/loops-client";
import { decideSource, readSourceSetting, setSourceDecision, type SourceDecision } from "./state/source";
import { connectScreen } from "./state/connect";
import { ConnectPage } from "./components/ConnectPage";

/* The source (demo or live) is decided before the app's modules load: state/world.ts reads it at import. `auto` asks the
   host once; a silent host is the demo, said in one info line. */
async function decided() {
  const decision = await decideSource({ param: new URLSearchParams(window.location.search).get("source"), setting: readSourceSetting(), probe: (ms) => probeHost("", ms) });
  setSourceDecision(decision);
  if (decision.reason === "probe-silent") console.info("CrewHub World: no host answered /world-api/health; running the demo.");
  return decision;
}
const App = lazy(() => import("./App").then(({ App }) => ({ default: App })));

/* The gate (spec addendum "a smooth connection"): live mode shows one Connect screen per state of the host's connection
   (no loops found, pair this browser, connect, checking, key rejected) and follows the host's health until nothing stands
   between the browser and the town; then the world loads, with the fresh decision recorded first (state/world.ts reads it
   at import). The demo and a silent host go straight to the world. */
function Gate({ initial }: { initial: SourceDecision }) {
  const [decision, setDecision] = useState(initial);
  const screen = connectScreen(decision);
  if (screen === null || decision.health === null) {
    setSourceDecision(decision);
    return <App />;
  }
  return <ConnectPage screen={screen} health={decision.health} onHealth={(health: HostHealth) => setDecision((before) => ({ ...before, health }))} />;
}
const decision = decided();
const Root = lazy(() => decision.then((initial) => ({ default: () => <Gate initial={initial} /> })));
// Two side pages, each loaded only when asked for: the prop-builder examples drawn by the parts renderer (review only,
// not linked from the UI) and the casting room (linked from Settings).
const path = window.location.pathname.replace(/\/$/, "");
const Page =
  path === "/props-preview"
    ? lazy(() => import("./PropsPreview"))
    : path === "/tiers-preview"
      ? lazy(() => import("./TiersPreview"))
      : path === "/cast-preview"
        ? lazy(() => import("./CastPreview"))
        : Root;

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <Suspense fallback={<p role="status">Opening CrewHub…</p>}>
        <Page />
      </Suspense>
    </ThemeProvider>
  </StrictMode>,
);
