// Start-meeting dialog (T10, EKI-14): topic/goal, ≥2 participants from the
// agents store, rounds (default 2), room (preselected from the filter — tasks
// converted later need one), context docs from the M3 docs tree, and the
// D-M4-3 model-policy row: participant ModelPicker pre-filled from
// `model_policy.meeting_participant` (haiku) and synthesis from
// `model_policy.meeting_synthesis` (sonnet) — defaults are data, never code.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModelPicker, MODEL_TIERS } from "@/components/ModelPicker";
import { commands, type DocEntry, type Meeting, type StartMeetingSpec } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { MODEL_POLICY_DEFAULTS, readModelPolicy, useMeetingsStore } from "@/stores/meetings";
import { useProjectsStore } from "@/stores/projects";
import { useRoomsStore } from "@/stores/rooms";

const DEFAULT_ROUNDS = 2;
const MAX_CONTEXT_DOCS = 8;

function glyphOf(model: string): string {
  return MODEL_TIERS.find((t) => t.id === model)?.glyph ?? "";
}

export interface StartMeetingDialogProps {
  /** Preselected room (the panel's room filter — the room_id lesson). */
  defaultRoomId: string | null;
  defaultProjectId: string | null;
  onClose: () => void;
  onStarted: (meeting: Meeting) => void;
}

export function StartMeetingDialog({
  defaultRoomId,
  defaultProjectId,
  onClose,
  onStarted,
}: StartMeetingDialogProps) {
  const agents = useAgentsStore((s) => s.agents);
  const rooms = useRoomsStore((s) => s.rooms);
  const projects = useProjectsStore((s) => s.projects);

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [participantModel, setParticipantModel] = useState<string>(MODEL_POLICY_DEFAULTS.participant);
  const [synthesisModel, setSynthesisModel] = useState<string>(MODEL_POLICY_DEFAULTS.synthesis);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-fill the policy row from settings — per-meeting override allowed,
  // expensive defaults never hardcoded (D-M4-3).
  useEffect(() => {
    let live = true;
    void readModelPolicy().then((p) => {
      if (!live) return;
      setParticipantModel(p.participant);
      setSynthesisModel(p.synthesis);
    });
    return () => {
      live = false;
    };
  }, []);

  // Context docs come from the project's M3 docs tree (paths only — the
  // engine inlines ≤2 KB each at prompt-build time). Selection resets in the
  // project onChange handler; this effect only synchronizes the fetched tree.
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    commands
      .listDocTree(projectId)
      .then((res) => {
        if (live && res.status === "ok" && Array.isArray(res.data)) {
          setDocs(res.data.filter((d) => !d.is_dir));
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);

  const toggleAgent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDoc = (relPath: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else if (next.size < MAX_CONTEXT_DOCS) next.add(relPath);
      return next;
    });
  };

  async function start() {
    const project = projects.find((p) => p.id === projectId);
    if (!title.trim()) {
      setError("give the meeting a topic");
      return;
    }
    if (selected.size < 2) {
      setError("a meeting needs at least 2 participants");
      return;
    }
    if (!project) {
      setError("pick a project — participant sessions need a working folder");
      return;
    }
    setBusy(true);
    setError(null);
    const spec: StartMeetingSpec = {
      title: title.trim(),
      goal: goal.trim() || null,
      room_id: roomId || null,
      project_id: project.id,
      project_path: project.folder_path,
      participants: agents
        .filter((a) => selected.has(a.id))
        .map((a) => ({ agent_id: a.id, name: a.name, persona: a.system_prompt })),
      rounds,
      turn_timeout_ms: null,
      participant_model: participantModel,
      synthesis_model: synthesisModel,
      context_docs: selectedDocs.size > 0 ? [...selectedDocs] : null,
    };
    const res = await useMeetingsStore.getState().start(spec);
    setBusy(false);
    if (res.status === "error") {
      setError(res.error);
      return;
    }
    onStarted(res.data);
  }

  return (
    <div
      data-testid="start-meeting-dialog"
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/60 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="w-[28rem] max-w-[92%] rounded-lg border bg-card p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">🎻 Gather the crew</h2>

        <div className="flex flex-col gap-2 text-xs">
          <label className="flex flex-col gap-1">
            topic
            <input
              aria-label="Meeting topic"
              className="rounded border bg-background px-2 py-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should the crew hash out?"
            />
          </label>
          <label className="flex flex-col gap-1">
            goal (optional)
            <input
              aria-label="Meeting goal"
              className="rounded border bg-background px-2 py-1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What does done look like?"
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">participants (≥2)</legend>
            {agents.length === 0 && (
              <p className="text-muted-foreground">no agents yet — hire a crew first</p>
            )}
            <div className="flex flex-wrap gap-1">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected.has(a.id)}
                  data-testid={`participant-${a.id}`}
                  onClick={() => toggleAgent(a.id)}
                  className={`rounded-full border px-2 py-0.5 ${
                    selected.has(a.id) ? "border-ring bg-muted font-medium" : "text-muted-foreground"
                  }`}
                >
                  {a.icon ?? "🤖"} {a.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              rounds
              <input
                aria-label="Discussion rounds"
                type="number"
                min={1}
                max={5}
                className="w-14 rounded border bg-background px-1 py-0.5"
                value={rounds}
                onChange={(e) => setRounds(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="flex items-center gap-1">
              room
              <select
                aria-label="Meeting room"
                className="rounded border bg-background px-1 py-0.5"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="">— none —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon ?? "🚪"} {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              project
              <select
                aria-label="Meeting project"
                className="rounded border bg-background px-1 py-0.5"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setDocs([]);
                  setSelectedDocs(new Set());
                }}
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? "📁"} {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!roomId && (
            <p className="text-[10px] text-muted-foreground">
              no room picked — converting action items to tasks will ask for one (tasks without a room don't
              show on any board)
            </p>
          )}

          {docs.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1">context docs (inlined ≤2 KB each)</legend>
              <div className="flex max-h-24 flex-col gap-0.5 overflow-y-auto">
                {docs.map((d) => (
                  <label key={d.rel_path} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      aria-label={`Context doc ${d.rel_path}`}
                      checked={selectedDocs.has(d.rel_path)}
                      onChange={() => toggleDoc(d.rel_path)}
                    />
                    <span className="truncate">📄 {d.rel_path}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* D-M4-3 model policy row — pre-filled from settings, overridable per meeting */}
          <div className="flex flex-col gap-2 rounded border p-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">model policy</span>
              <span
                data-testid="policy-badge-participant"
                className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title="every gathering & discussion turn runs on this model"
              >
                gathering {glyphOf(participantModel)} {participantModel}
              </span>
              <span
                data-testid="policy-badge-synthesis"
                className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title="the one explicitly upgraded step — quality compounds in synthesis"
              >
                synthesis {glyphOf(synthesisModel)} {synthesisModel}
              </span>
            </div>
            <ModelPicker label="Participant turns" value={participantModel} onChange={setParticipantModel} />
            <ModelPicker label="Synthesis" value={synthesisModel} onChange={setSynthesisModel} />
          </div>

          {error && (
            <p data-testid="start-meeting-error" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="xs" disabled={busy} data-testid="start-meeting-go" onClick={() => void start()}>
              {busy ? "Convening…" : "🎬 Start meeting"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
