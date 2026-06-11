// Paste-import for v1 blueprints (EKI-81). Deliberately a paste box, not a
// file picker — the webview has no fs access by design. Paste the
// custom_blueprints row (or just its blueprint_json) from v1, preview the
// result, apply to replace this room's props.
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_SIZE, type WorldZone } from "../lib/layout";
import { parseV1Blueprint } from "./parse-v1";
import type { PlacedProp } from "./placement";

export function ImportBlueprintDialog({
  zone,
  onApply,
  onClose,
}: {
  zone: WorldZone;
  onApply: (props: PlacedProp[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleImport = () => {
    const res = parseV1Blueprint(text, { width: ROOM_SIZE, depth: ROOM_SIZE });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.props.length === 0) {
      setError("Parsed fine, but there are no props to import.");
      setWarnings(res.warnings);
      return;
    }
    onApply(res.props);
    onClose();
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border bg-card p-4 text-sm shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">Import v1 blueprint → {zone.name}</span>
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
          Paste the blueprint JSON from CrewHub v1 (a <code>custom_blueprints</code> row or its{" "}
          <code>blueprint_json</code>). Unknown props become 📦 crates; everything is fitted into this room.
          Replaces the room&apos;s current props.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setWarnings([]);
          }}
          placeholder='{"name":"Cozy office","gridWidth":12,…,"placements":[…]}'
          spellCheck={false}
          rows={8}
          className="mb-2 w-full resize-none rounded border bg-background p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        {warnings.length > 0 && (
          <ul className="mb-2 space-y-0.5 text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" onClick={handleImport} disabled={text.trim() === ""}>
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
