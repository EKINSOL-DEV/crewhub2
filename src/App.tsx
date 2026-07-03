import { lazy, Suspense, useEffect } from "react";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import { useSettings } from "@/stores/settings";
import { useWorkspace } from "@/stores/workspace";

// `?perf` mounts the chat perf probe (D-M2-4) instead of the shell — a 5k-item
// synthetic transcript that reports frame percentiles on window.__CREWHUB_PERF__.
const PerfProbe = lazy(() => import("@/panels/chat/perf/PerfProbe").then((m) => ({ default: m.PerfProbe })));
// The campus game shell (M0-M4) — now the main window (M4 T6, the switch).
const GameShell = lazy(() => import("@/game/app/GameShell"));
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

// ── Main window (M4 T6, "the switch"): the game IS the app ──────────────────
// The old 3D world (WorldView/WorldOverlayHost/GameHud, panels/world/**) is
// deleted — the campus game shell replaces it outright as the main window.
// The first-run wizard and the what's-new dialog overlay it, same as before.
//
// Partial-D4: the game shell has no panel-drawer bridge yet (the world's
// WorldOverlayHost died with it), so board/crew/sessions/settings/etc. are
// only reachable via the detached `?window=workspace` window for now — a
// follow-up task grows the game-native equivalent.
function MainWindow() {
  return (
    <Suspense fallback={null}>
      <GameShell />
      <OnboardingWizard />
      <WhatsNewDialog />
    </Suspense>
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

  // `?window=workspace`: panels in their own window — WorkspaceShell only.
  // No game (there is exactly ONE, in the main window), no wizard.
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

  // `?game` is a redundant alias now — MainWindow already is the game shell,
  // so it falls straight through to the same return below.
  return <MainWindow />;
}

export default App;
