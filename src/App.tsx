import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type AppInfo } from "@/ipc/bindings";
import { useSettings } from "@/stores/settings";
import { THEME_NAMES, type ThemeName } from "@/theme/themes";

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { theme, setTheme, load } = useSettings();

  useEffect(() => {
    void load();
    commands
      .appInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [load]);

  return (
    <main data-testid="app-root" className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">CrewHub</h1>
      <p className="text-sm text-muted-foreground">Foundation build — M0</p>
      <p data-testid="app-version" className="font-mono text-xs text-muted-foreground">
        {info ? `v${info.version}` : "backend: connecting…"}
      </p>
      <Button variant="outline">It works</Button>
      <select
        data-testid="theme-select"
        className="rounded border bg-card px-2 py-1 text-sm"
        value={theme}
        onChange={(e) => void setTheme(e.target.value as ThemeName)}
      >
        {THEME_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </main>
  );
}

export default App;
