// Notification rules CRUD (T14, EKI-99): the settings panel's Notifications
// section. Per-rule enable toggle = the "per-rule mute" Epic-22 contract —
// M6 swaps the toast sink for the OS sink behind these same rules. Lives in
// the board lane's dir; the settings panel only mounts it.
import { useEffect, useState } from "react";
import { useProjects } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { commands, type NotificationRule } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { NOTIFICATION_TRIGGERS, useToasts } from "@/stores/toasts";

const TRIGGER_LABELS: Record<string, string> = {
  task_moved: "🙌 task moved",
  task_blocked: "🚧 task blocked",
  task_assigned: "🫱 task assigned",
  task_mention: "💬 @mention",
};

export function NotificationRulesSection() {
  const rules = useToasts((s) => s.rules);
  const agents = useAgentsStore((s) => s.agents);
  const projects = useProjects((s) => s.projects);
  const [trigger, setTrigger] = useState<string>("task_moved");
  const [scope, setScope] = useState<string>("global");
  const [scopeId, setScopeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useToasts.getState().init();
    void useAgentsStore.getState().init();
    void useProjects.getState().load();
  }, []);

  const refresh = () => void useToasts.getState().refreshRules();

  async function add() {
    if (scope !== "global" && !scopeId) {
      setError("pick what the rule is scoped to");
      return;
    }
    setError(null);
    try {
      const res = await commands.createNotificationRule({
        scope,
        scope_id: scope === "global" ? null : scopeId,
        trigger,
        config_json: null,
        enabled: true,
      });
      if (res.status === "error") setError(res.error);
      else refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggle(rule: NotificationRule) {
    try {
      await commands.updateNotificationRule({ ...rule, enabled: !rule.enabled });
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await commands.deleteNotificationRule(id);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  const scopeName = (rule: NotificationRule): string => {
    if (rule.scope === "project") return projects.find((p) => p.id === rule.scope_id)?.name ?? "a project";
    if (rule.scope === "agent") return agents.find((a) => a.id === rule.scope_id)?.name ?? "an agent";
    return "everywhere";
  };

  return (
    <div className="flex flex-col gap-2" data-testid="notification-rules">
      <p className="text-xs text-muted-foreground">
        In-app toasts when cards move — rules are opt-in, the toggle is a per-rule mute.
      </p>
      {rules.length === 0 && (
        <p className="text-xs italic text-muted-foreground" data-testid="no-rules">
          🔕 no rules yet — the board stays quiet until you add one
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-xs" data-testid={`rule-${rule.id}`}>
            <label className="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Enable rule ${TRIGGER_LABELS[rule.trigger] ?? rule.trigger}`}
                checked={rule.enabled}
                onChange={() => void toggle(rule)}
              />
              <span className={rule.enabled ? undefined : "text-muted-foreground line-through"}>
                {TRIGGER_LABELS[rule.trigger] ?? rule.trigger} · {scopeName(rule)}
              </span>
            </label>
            <Button size="xs" variant="ghost" aria-label="Delete rule" onClick={() => void remove(rule.id)}>
              🗑️
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <select
          aria-label="New rule trigger"
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          {NOTIFICATION_TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="New rule scope"
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setScopeId("");
          }}
        >
          <option value="global">everywhere</option>
          <option value="project">one project</option>
          <option value="agent">one agent</option>
        </select>
        {scope !== "global" && (
          <select
            aria-label="New rule scope target"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
          >
            <option value="">—</option>
            {(scope === "project" ? projects : agents).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        <Button size="xs" data-testid="add-rule" onClick={() => void add()}>
          ➕ Add rule
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
