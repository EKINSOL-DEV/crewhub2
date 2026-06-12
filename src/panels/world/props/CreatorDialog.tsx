// Creator mode (EKI-83): describe a prop, one cheap headless run dreams up
// blueprint JSON, the creator parser validates/clamps it, and it lands in the
// room ready for the placement editor. Generation goes through the provider
// seam (headless `-p` run) — no direct API key. Haiku by default; the picker
// keeps the choice honest for fancier requests.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_MODEL, ModelPicker, type ModelTierId } from "@/components/ModelPicker";
import { commands } from "@/ipc/bindings";
import type { WorldZone } from "../lib/layout";
import { buildCreatorPrompt, parseCreatorProp } from "./creator";
import { useCustomProps } from "./custom";
import { CORE_PROPS, type PropDefinition } from "./registry";

const DREAM_LINES = [
  "carving tiny voxels…",
  "mixing the paint roles…",
  "consulting the museum of small things…",
  "sanding the edges…",
] as const;

type Phase =
  | { kind: "idle" }
  | { kind: "dreaming" }
  | { kind: "ready"; def: PropDefinition; warnings: string[] }
  | { kind: "failed"; error: string };

export function CreatorDialog({
  zone,
  onPlace,
  onClose,
}: {
  zone: WorldZone;
  onPlace: (def: PropDefinition) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<ModelTierId>(DEFAULT_MODEL);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (phase.kind !== "dreaming") return;
    const t = setInterval(() => setTick((n) => n + 1), 1600);
    return () => clearInterval(t);
  }, [phase.kind]);

  const generate = async () => {
    setPhase({ kind: "dreaming" });
    try {
      const res = await commands.worldGenerateProp(buildCreatorPrompt(description.trim()), model);
      if (res.status === "error") {
        setPhase({ kind: "failed", error: res.error });
        return;
      }
      if (res.data.status !== "success") {
        setPhase({ kind: "failed", error: res.data.text || "The muse stayed quiet — try again?" });
        return;
      }
      const existing = new Set([...Object.keys(CORE_PROPS), ...Object.keys(useCustomProps.getState().defs)]);
      const parsed = parseCreatorProp(res.data.text, existing);
      if (!parsed.ok) {
        setPhase({ kind: "failed", error: parsed.error });
        return;
      }
      setPhase({ kind: "ready", def: parsed.def, warnings: parsed.warnings });
    } catch (e) {
      setPhase({ kind: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const dreaming = phase.kind === "dreaming";
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border bg-card p-4 text-sm shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">✨ Dream up a prop → {zone.name}</span>
          <button
            type="button"
            aria-label="Close"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Describe a little something for this room — a bot will sculpt it from boxes, cylinders, spheres and
          cones. You can move, spin and resize it afterwards in edit mode.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="a rubber-duck fountain · a stack of pizza boxes · a tiny rocket on a launchpad"
          spellCheck={false}
          rows={3}
          disabled={dreaming}
          className="mb-2 w-full resize-none rounded border bg-background p-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <ModelPicker value={model} onChange={setModel} className="mb-2" />
        {dreaming && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="creator-dreaming">
            ✨ {DREAM_LINES[tick % DREAM_LINES.length]}
          </p>
        )}
        {phase.kind === "failed" && <p className="mb-2 text-xs text-destructive">{phase.error}</p>}
        {phase.kind === "ready" && (
          <div className="mb-2 rounded border bg-background p-2" data-testid="creator-preview">
            <p className="text-sm">
              <span className="mr-1.5 text-2xl align-middle">{phase.def.emoji}</span>
              <span className="font-medium">{phase.def.label}</span>{" "}
              <span className="text-xs text-muted-foreground">· {phase.def.parts.length} parts</span>
            </p>
            {phase.warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {phase.warnings.map((w) => (
                  <li key={w}>⚠️ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" onClick={onClose} disabled={dreaming}>
            Cancel
          </Button>
          {phase.kind === "ready" ? (
            <>
              <Button size="xs" variant="outline" onClick={() => void generate()}>
                Try again
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  onPlace(phase.def);
                  onClose();
                }}
              >
                Place it
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              onClick={() => void generate()}
              disabled={dreaming || description.trim() === ""}
            >
              {dreaming ? "Dreaming…" : "Generate"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
