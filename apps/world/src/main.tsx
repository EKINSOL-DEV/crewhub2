import "@fontsource-variable/archivo";
import "./styles/tokens.css";
import "./styles/kit.css";
import "./styles/world.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./state/theme";

const App = lazy(() => import("./App").then(({ App }) => ({ default: App })));
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
