import { lazy, Suspense, useEffect } from "react";
import { WorkspaceShell } from "@/app/WorkspaceShell";
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

function App() {
  const loadSettings = useSettings((s) => s.load);
  const loadWorkspace = useWorkspace((s) => s.load);
  const search = new URLSearchParams(window.location.search);
  const isSettingsWindow = search.get("window") === "settings";

  useEffect(() => {
    void loadSettings();
    // The settings window needs no workspace state — settings only.
    if (!isSettingsWindow) void loadWorkspace();
  }, [loadSettings, loadWorkspace, isSettingsWindow]);

  if (isSettingsWindow) {
    return (
      <Suspense fallback={null}>
        <div className="h-screen overflow-y-auto bg-background text-foreground">
          <SettingsPanel />
        </div>
      </Suspense>
    );
  }

  if (search.has("perf")) {
    return (
      <Suspense fallback={null}>
        <PerfProbe />
      </Suspense>
    );
  }

  return (
    <>
      <WorkspaceShell />
      <Suspense fallback={null}>
        <OnboardingWizard />
        <WhatsNewDialog />
      </Suspense>
    </>
  );
}

export default App;
