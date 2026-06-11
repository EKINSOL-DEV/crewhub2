import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { commands, type PermissionMode } from "@/ipc/bindings";

// haiku is the default by product policy (cheap crew members first).
const MODELS = ["haiku", "sonnet", "opus"] as const;
const PERMISSION_MODES: PermissionMode[] = ["Default", "AcceptEdits", "Plan", "BypassPermissions"];

export function SpawnForm({ providers, onError }: { providers: string[]; onError: (msg: string) => void }) {
  const [provider, setProvider] = useState("claude-code");
  const [projectPath, setProjectPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("haiku");
  const [mode, setMode] = useState<PermissionMode>("Default");
  const [busy, setBusy] = useState(false);

  const spawn = async () => {
    if (!projectPath.trim()) {
      onError("project path is required");
      return;
    }
    setBusy(true);
    try {
      const res = await commands.spawnSession(provider, {
        project_path: projectPath.trim(),
        prompt: prompt.trim() ? prompt.trim() : null,
        model,
        permission_mode: mode,
        resume_session: null,
        fork: false,
        append_system_prompt: null,
        agent_id: null,
      });
      if (res.status === "error") onError(res.error);
      else setPrompt("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Spawn session</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          provider
          <select
            data-testid="spawn-provider"
            className="rounded border bg-card px-2 py-1 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {(providers.length ? providers : ["claude-code"]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs">
          project path
          <input
            data-testid="spawn-project-path"
            className="rounded border bg-card px-2 py-1 font-mono text-sm"
            placeholder="/path/to/project"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
          />
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs">
          prompt (optional)
          <input
            className="rounded border bg-card px-2 py-1 text-sm"
            placeholder="first message"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          model
          <select
            data-testid="spawn-model"
            className="rounded border bg-card px-2 py-1 text-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          permissions
          <select
            className="rounded border bg-card px-2 py-1 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as PermissionMode)}
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={busy} onClick={() => void spawn()}>
          {busy ? "Spawning…" : "Spawn"}
        </Button>
      </CardContent>
    </Card>
  );
}
