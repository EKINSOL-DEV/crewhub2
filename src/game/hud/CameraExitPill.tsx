// Camera-exit pill (round 2 amendment): replaces HudOverlay's old bottom-left
// 🎥✕ chip, which direct user feedback called out as "absoluut niet
// duidelijk" — buried among six other small mode-toggle chips in the HUD
// row. This is a single, prominent, centered pill sitting well above that
// row instead, impossible to miss while a focus/follow shot is framing
// something. Mounted as a GameShell HTML sibling (not inside HudOverlay):
// it's a standalone affordance about camera STATE, not a member of the
// HUD's row of small mode-toggle chips — same reasoning that already put
// GamePanel's own docked cards outside HudOverlay.
//
// Visible only while camera mode ≠ free (subscribed, not .getState() — this
// pill's own visibility IS the render that must react to mode changing,
// same convention the old chip used and RoomCard/HqCard/DossierCard's
// ExitZoomButton (GamePanel.tsx) still uses). Both affordances stay: this
// pill for "I want out, from anywhere," and each panel's own header button
// for "I'm already looking at this card."
import { playSfx } from "@/game/audio/sfx";
import { useCameraDirector } from "@/game/engine/camera/director";

export function CameraExitPill() {
  const active = useCameraDirector((s) => s.mode.kind !== "free");
  if (!active) return null;
  return (
    <button
      type="button"
      data-testid="camera-exit-pill"
      title="Exit camera shot"
      onClick={() => {
        useCameraDirector.getState().exit();
        playSfx("click");
      }}
      className="pointer-events-auto fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-white/60 bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
    >
      🎥 Exit zoom
      <kbd className="rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/70">
        Esc
      </kbd>
    </button>
  );
}
