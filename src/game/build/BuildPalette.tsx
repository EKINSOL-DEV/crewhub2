// Build tool palette (M3 T3): left-edge vertical game card, mounted by
// GameShell only while build mode is active (mode.ts). Picking a tool just
// updates the store — placement itself (drag, ghost preview, ESC) is
// Task 4 scope.
// Left, not right (T4 review fold-in): chat windows dock bottom-right and
// the palette's original right-edge placement overlapped them. The HUD
// chips sit bottom-left but stop well short of vertical-center, so the
// palette is clear there too.
import { playSfx } from "@/game/audio/sfx";
import { PLACEABLE_KINDS, type PlaceableKind } from "./edits";
import { useBuildMode, type BuildTool } from "./mode";

const ITEM_LABELS: Record<PlaceableKind, { emoji: string; label: string }> = {
  "tree-default": { emoji: "🌳", label: "Tree" },
  "tree-pine": { emoji: "🌲", label: "Pine" },
  "tree-oak": { emoji: "🌰", label: "Oak" },
  bush: { emoji: "🌿", label: "Bush" },
  "flower-red": { emoji: "🌸", label: "Red flower" },
  "flower-yellow": { emoji: "🌼", label: "Yellow flower" },
  "rock-large": { emoji: "🪨", label: "Rock" },
  lantern: { emoji: "🏮", label: "Lantern" },
  bench: { emoji: "🪑", label: "Bench" },
  hedge: { emoji: "🧱", label: "Hedge" },
};

function sameTool(a: BuildTool, b: BuildTool): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "item" && b.kind === "item" ? a.item === b.item : true;
}

function toolButtonClass(active: boolean): string {
  return `pointer-events-auto rounded-full border-2 px-3 py-1.5 text-left text-sm font-bold shadow transition-transform hover:scale-105 ${
    active
      ? "border-white bg-amber-500 text-white"
      : "border-white/60 bg-white/80 text-slate-900 backdrop-blur"
  }`;
}

export function BuildPalette() {
  const tool = useBuildMode((s) => s.tool);
  const setTool = useBuildMode((s) => s.setTool);
  const deactivate = useBuildMode((s) => s.deactivate);

  return (
    <div className="pointer-events-none fixed left-4 top-1/2 flex -translate-y-1/2 flex-col gap-1.5 rounded-3xl border-2 border-white/60 bg-white/70 p-2 shadow-2xl backdrop-blur">
      {PLACEABLE_KINDS.map((kind) => {
        const { emoji, label } = ITEM_LABELS[kind];
        const t: BuildTool = { kind: "item", item: kind };
        const active = sameTool(tool, t);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            title={label}
            className={toolButtonClass(active)}
            onClick={() => {
              playSfx("click");
              setTool(t);
            }}
          >
            {emoji} {label}
          </button>
        );
      })}
      <div className="my-1 border-t-2 border-slate-900/10" />
      <button
        type="button"
        aria-pressed={sameTool(tool, { kind: "building" })}
        className={toolButtonClass(sameTool(tool, { kind: "building" }))}
        onClick={() => {
          playSfx("click");
          setTool({ kind: "building" });
        }}
      >
        🏠 Building
      </button>
      <button
        type="button"
        aria-pressed={sameTool(tool, { kind: "select" })}
        className={toolButtonClass(sameTool(tool, { kind: "select" }))}
        onClick={() => {
          playSfx("click");
          setTool({ kind: "select" });
        }}
      >
        👆 Select
      </button>
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-rose-700/80 px-3 py-1.5 text-sm font-bold text-white shadow backdrop-blur transition-transform hover:scale-105"
        onClick={deactivate}
      >
        ✕ Done
      </button>
    </div>
  );
}
