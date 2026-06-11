import { useEffect } from "react";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import { useSettings } from "@/stores/settings";
import { useWorkspace } from "@/stores/workspace";

function App() {
  const loadSettings = useSettings((s) => s.load);
  const loadWorkspace = useWorkspace((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadWorkspace();
  }, [loadSettings, loadWorkspace]);

  return <WorkspaceShell />;
}

export default App;
