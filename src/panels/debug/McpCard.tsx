import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { commands, type McpStatus, type Project } from "@/ipc/bindings";

export function McpCard({ onError }: { onError: (msg: string) => void }) {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const st = await commands.mcpStatus();
      if (cancelled) return;
      if (st.status === "ok") {
        setStatus(st.data);
        setStatusError(null);
      } else {
        setStatus(null);
        setStatusError(st.error);
      }
      const ps = await commands.listProjects();
      if (cancelled || ps.status === "error") return;
      setProjects(ps.data);
      const flags: Record<string, boolean> = {};
      await Promise.all(
        ps.data.map(async (p) => {
          const v = await commands.getSetting(`mcp_enabled:${p.id}`);
          flags[p.id] = v.status === "ok" && v.data === "true";
        }),
      );
      if (!cancelled) setEnabled(flags);
    };
    refresh().catch(() => {
      // backend unavailable (unit tests) — leave defaults
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (projectId: string, enable: boolean) => {
    setBusy(projectId);
    try {
      const res = enable
        ? await commands.enableMcpForProject(projectId)
        : await commands.disableMcpForProject(projectId);
      if (res.status === "error") onError(res.error);
      else setEnabled((prev) => ({ ...prev, [projectId]: enable }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card size="sm" data-testid="mcp-card">
      <CardHeader>
        <CardTitle>CrewHub MCP server</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        {status ? (
          <p className="font-mono">
            🟢 listening on port {status.port} — {status.url}
          </p>
        ) : (
          <p className="text-destructive">🔚 {statusError ?? "loading…"}</p>
        )}
        {projects.length === 0 ? (
          <p className="text-muted-foreground">no projects registered — create one to enable MCP for it</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="min-w-32">{p.name}</span>
                <span className="flex-1 truncate font-mono text-muted-foreground">{p.folder_path}</span>
                <span>{enabled[p.id] ? "🟢 enabled" : "💤 disabled"}</span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy === p.id || !status}
                  onClick={() => void toggle(p.id, !enabled[p.id])}
                >
                  {enabled[p.id] ? "Disable" : "Enable"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
