import { lazy, Suspense, useEffect } from "react";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import { useSettings } from "@/stores/settings";
import { useWorkspace } from "@/stores/workspace";

// `?perf` mounts the chat perf probe (D-M2-4) instead of the shell — a 5k-item
// synthetic transcript that reports frame percentiles on window.__CREWHUB_PERF__.
const PerfProbe = lazy(() => import("@/panels/chat/perf/PerfProbe").then((m) => ({ default: m.PerfProbe })));

function App() {
  const loadSettings = useSettings((s) => s.load);
  const loadWorkspace = useWorkspace((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadWorkspace();
  }, [loadSettings, loadWorkspace]);

  if (new URLSearchParams(window.location.search).has("perf")) {
    return (
      <Suspense fallback={null}>
        <PerfProbe />
      </Suspense>
    );
  }

  return <WorkspaceShell />;
}

export default App;
