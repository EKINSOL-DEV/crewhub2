// The game-HUD drawer (EKI-121): renders the active overlay panel in a
// playful right-hand drawer over the 3D world — the world never leaves the
// stage. Escape or the backdrop closes it; the panel inside is the exact
// same component the workspace tree used, fed through PanelProps.
import { Suspense, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/PopIn";
import { PANELS } from "./panel-registry";
import { useOverlays } from "./overlays";

export function WorldOverlayHost() {
  const overlay = useOverlays((s) => s.overlay);
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the drawer on open so Escape lands here, not in the world.
  useEffect(() => {
    if (overlay) panelRef.current?.focus();
  }, [overlay?.kind]); // eslint-disable-line react-hooks/exhaustive-deps -- refocus per panel, not per param

  if (!overlay) return null;
  const def = PANELS[overlay.kind];
  const Panel = def.component;

  const drawer = (
    <div
      ref={panelRef}
      tabIndex={-1}
      data-testid="world-overlay"
      className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 bg-card/95 shadow-2xl outline-none backdrop-blur"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          useOverlays.getState().close();
          return;
        }
        // Typing in a panel input must not reach the HUD's digit shortcuts;
        // keys on non-editable panel chrome may bubble (digit-toggles work).
        const t = e.target as HTMLElement | null;
        if (t?.closest('input, textarea, select, [contenteditable="true"]')) e.stopPropagation();
      }}
    >
      <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3.5 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-lg">
          {def.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{def.label}</div>
          <div className="truncate text-[10px] text-muted-foreground">{def.description}</div>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-muted hover:text-foreground"
          onClick={() => useOverlays.getState().close()}
        >
          <X size={15} />
        </button>
      </div>
      <div className="world-drawer min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {def.emoji} setting things up…
            </div>
          }
        >
          <Panel
            leafId="world-overlay"
            params={overlay.params}
            setParams={(p) => useOverlays.getState().merge(p)}
          />
        </Suspense>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-30">
      {/* Soft backdrop — the world dims but stays visible; click closes. */}
      <div
        data-testid="world-overlay-backdrop"
        className="absolute inset-0 bg-black/25"
        onClick={() => useOverlays.getState().close()}
      />
      <div className="pointer-events-none absolute bottom-3 right-3 top-3 w-[620px] max-w-[94vw]">
        {reduced ? (
          drawer
        ) : (
          <motion.div
            className="h-full w-full"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
          >
            {drawer}
          </motion.div>
        )}
      </div>
    </div>
  );
}
