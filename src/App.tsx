import { lazy, Suspense, useEffect } from "react";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import { WorldView } from "@/app/WorldView";
import { useSettings } from "@/stores/settings";
import { useWorkspace } from "@/stores/workspace";

// `?perf` mounts the chat perf probe (D-M2-4) instead of the shell — a 5k-item
// synthetic transcript that reports frame percentiles on window.__CREWHUB_PERF__.
const PerfProbe = lazy(() => import("@/panels/chat/perf/PerfProbe").then((m) => ({ default: m.PerfProbe })));
// `?window=settings` is the dedicated settings window (EKI-20): same React
// bundle, settings panel only, own capability file (capabilities/settings.json).
const SettingsPanel = lazy(() => import("@/panels/settings/SettingsPanel"));
// First-run wizard overlay above the untouched shell (M6 T8, D-M6-2).
const OnboardingWizard = lazy(() =>
  import("@/onboarding/Wizard").then((m) => ({ default: m.OnboardingWizard })),
);
// "What's new" dialog from updater.pending_notes (M6 T11, D-M6-7).
const WhatsNewDialog = lazy(() =>
  import("@/components/WhatsNewDialog").then((m) => ({ default: m.WhatsNewDialog })),
);

// ── Main window (EKI-121, game-HUD shell): the ONE 3D world IS the app ──────
// There is no second view anymore — every panel renders as a drawer over the
// world (WorldOverlayHost inside WorldView). The first-run wizard and the
// what's-new dialog overlay the world like everything else.
function MainWindow() {
  return (
    <>
      <WorldView />
      <Suspense fallback={null}>
        <OnboardingWizard />
        <WhatsNewDialog />
      </Suspense>
    </>
  );
}

function App() {
  const loadSettings = useSettings((s) => s.load);
  const loadWorkspace = useWorkspace((s) => s.load);
  const search = new URLSearchParams(window.location.search);
  const windowRoute = search.get("window");

  useEffect(() => {
    void loadSettings();
    // The settings window needs no workspace state — settings only.
    if (windowRoute !== "settings") void loadWorkspace();
  }, [loadSettings, loadWorkspace, windowRoute]);

  if (windowRoute === "settings") {
    return (
      <Suspense fallback={null}>
        <div className="h-screen overflow-y-auto bg-background text-foreground">
          <SettingsPanel />
        </div>
      </Suspense>
    );
  }

  // `?window=workspace` (world-primary shell): panels in their own window —
  // WorkspaceShell only. No world (there is exactly ONE, in the main window),
  // no wizard, no view switching.
  if (windowRoute === "workspace") {
    return <WorkspaceShell />;
  }

  if (search.has("perf")) {
    return (
      <Suspense fallback={null}>
        <PerfProbe />
      </Suspense>
    );
  }

  return <MainWindow />;
}

export default App;
