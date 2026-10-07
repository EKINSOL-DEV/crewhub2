import "@fontsource-variable/archivo";
import "./styles/tokens.css";
import "./styles/kit.css";
import "./styles/world.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./state/theme";
import { probeHost } from "@crewhub/loops-client";
import { decideSource, needsPairing, readSourceSetting, setSourceDecision } from "./state/source";

/* The source (demo or live) is decided before the app's modules load: state/world.ts reads it at import. `auto` asks the
   host once; a silent host is the demo, said in one info line. */
async function decided() {
  const decision = await decideSource({ param: new URLSearchParams(window.location.search).get("source"), setting: readSourceSetting(), probe: (ms) => probeHost("", ms) });
  setSourceDecision(decision);
  if (decision.reason === "probe-silent") console.info("CrewHub World: no host answered /world-api/health; running the demo.");
  return decision;
}
/* Live mode with a host that has not paired this browser: the "Pair this browser" page instead of the world (plan 3.5). */
const App = lazy(() =>
  decided().then((decision) =>
    needsPairing(decision)
      ? import("./components/PairPage").then(({ PairPage }) => ({ default: PairPage }))
      : import("./App").then(({ App }) => ({ default: App })),
  ),
);
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
        : App;

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
