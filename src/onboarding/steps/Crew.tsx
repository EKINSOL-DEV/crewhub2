// Wizard crew step (T9, EKI-86 part 2 + EKI-88): hire a first agent
// (haiku prefilled — nothing in the wizard defaults to an expensive model)
// or materialize the sample crew (D-M6-9: a real folder, two haiku agents,
// three starter tasks — ordinary data, deletable like anything else).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModelPicker, DEFAULT_MODEL } from "@/components/ModelPicker";
import { commands } from "@/ipc/bindings";
import { ConfettiBurst } from "@/panels/crew/ConfettiBurst";
import { useAgentsStore } from "@/stores/agents";
import { useOnboarding } from "@/stores/onboarding";
import { useProjectsStore } from "@/stores/projects";

export function CrewStep() {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🤖");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [hired, setHired] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sampleCrew = useOnboarding((s) => s.sampleCrew);
  const createdIds = useOnboarding((s) => s.createdProjectIds);

  async function hire() {
    setBusy(true);
    setError(null);
    const projects = useProjectsStore.getState().projects;
    const firstCreated = projects.find((p) => createdIds.includes(p.id));
    const res = await useAgentsStore.getState().create({
      name: name.trim(),
      icon: icon.trim() || null,
      color: null,
      default_model: model,
      project_path: firstCreated?.folder_path ?? null,
      permission_mode: null, // safe default: every tool asks
      system_prompt: null,
    });
    setBusy(false);
    if (res.status === "ok") {
      setHired(res.data.name);
      setCelebrate(true);
    } else {
      setError(res.error);
    }
  }

  async function sample() {
    setBusy(true);
    setError(null);
    try {
      const res = await commands.createSampleCrew();
      if (res.status === "ok") {
        useOnboarding.getState().setSampleCrew(res.data);
        setCelebrate(true);
        void useAgentsStore.getState().refresh();
        void useProjectsStore.getState().refresh();
      } else {
        setError(res.error); // e.g. the polite idempotent refusal
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-3">
      {celebrate && <ConfettiBurst onDone={() => setCelebrate(false)} />}
      <h2 className="text-lg font-semibold">🤖 Your first crew member</h2>
      <p className="text-sm text-muted-foreground">
        Agents are named, reusable identities for sessions — a face, a model, an optional home project.
      </p>

      {hired ? (
        <p className="text-sm" data-testid="agent-hired">
          🎉 {hired} just joined the crew!
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="hire-form">
          <div className="flex gap-1.5">
            <input
              aria-label="Agent icon"
              data-testid="agent-icon-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-12 rounded border bg-background px-2 py-1 text-center text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              aria-label="Agent name"
              data-testid="agent-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scout"
              className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <ModelPicker value={model} onChange={setModel} />
          <div>
            <Button
              size="sm"
              data-testid="hire-agent"
              disabled={name.trim() === "" || busy}
              onClick={() => void hire()}
            >
              🫱 Hire {name.trim() || "…"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t pt-3">
        {sampleCrew ? (
          <p className="text-sm" data-testid="sample-crew-done">
            🎉 Sample crew moved in: 1 project, {sampleCrew.room_ids.length} rooms,{" "}
            {sampleCrew.agent_ids.length} agents and {sampleCrew.task_ids.length} starter tasks. It's ordinary
            data — delete any of it whenever you like.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Just looking around? We'll set up <code className="font-mono">~/CrewHub Sample</code> with two
              thrifty haiku agents and a tiny board — nothing runs until you say so.
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                data-testid="sample-crew"
                disabled={busy}
                onClick={() => void sample()}
              >
                📦 Try with a sample crew
              </Button>
            </div>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
