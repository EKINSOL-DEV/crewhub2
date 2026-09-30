import "@fontsource-variable/archivo";
import "./styles/tokens.css";
import "./styles/kit.css";
import "./styles/world.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./state/theme";

const App = lazy(() => import("./App").then(({ App }) => ({ default: App })));
// Review-only route (not linked from the UI): the prop-builder examples drawn by the parts renderer.
const Page = window.location.pathname.replace(/\/$/, "") === "/props-preview" ? lazy(() => import("./PropsPreview")) : App;

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
