import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const Page =
  window.location.pathname.replace(/\/$/, "") === "/design-system"
    ? lazy(() => import("./design-system/DesignSystem"))
    : lazy(() => import("./App").then(({ App }) => ({ default: App })));

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={<p role="status">Opening CrewHub…</p>}>
      <Page />
    </Suspense>
  </StrictMode>,
);
