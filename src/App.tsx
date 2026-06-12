import { lazy, Suspense, useEffect } from "react";
import { matchViewKey } from "@/app/keymap";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import { WorldView } from "@/app/WorldView";
import { useAppView } from "@/stores/appView";
import { useOnboarding } from "@/stores/onboarding";
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

// ── Main window: the ONE 3D world is primary, the workspace is a visit ───────
// Always boots into the world (appView is deliberately not persisted). The
// first-run wizard wins: while it shows, the classic shell sits underneath so
// the overlay dissolves into it exactly as designed. ⌘1/⌘2 switch views from
// anywhere — matched in the capture phase so ⌘1 beats the shell's
// focus-panel-1, while ⌘2 inside the workspace still falls through to
// focus-panel-2 (the matcher only fires when the view actually changes).
function MainWindow() {
  const view = useAppView((s) => s.view);
  const wizardActive = useOnboarding((s) => s.show);
  const effectiveView = wizardActive ? "workspace" : view;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = matchViewKey({
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        inEditable: false, // view switches are global, inputs included
      });
      if (!target || target === useAppView.getState().view) return;
      e.preventDefault();
      e.stopPropagation();
      useAppView.getState().setView(target);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <>
      {/* key remounts on switch → the quick view-fade plays (CSS handles
          reduced motion: instant). */}
      <div key={effectiveView} className="view-fade h-screen">
        {effectiveView === "world" ? <WorldView /> : <WorkspaceShell />}
      </div>
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
