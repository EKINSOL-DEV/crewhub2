import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type AppInfo } from "@/ipc/bindings";

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    commands
      .appInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <main data-testid="app-root" className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">CrewHub</h1>
      <p className="text-sm text-muted-foreground">Foundation build — M0</p>
      <p data-testid="app-version" className="font-mono text-xs text-muted-foreground">
        {info ? `v${info.version}` : "backend: connecting…"}
      </p>
      <Button variant="outline">It works</Button>
    </main>
  );
}

export default App;
