// First-run welcome ceremony (M4 T6 — the switch): a game-style card that
// greets a fresh campus once (game.welcomed KV), then gets out of the way
// for good. Mounted at the top of GameShell so it overlays everything else.
import { useEffect } from "react";
import { useGameWelcome } from "./welcome";

export function WelcomeCard() {
  const loaded = useGameWelcome((s) => s.loaded);
  const welcomed = useGameWelcome((s) => s.welcomed);

  useEffect(() => {
    void useGameWelcome.getState().init();
  }, []);

  if (!loaded || welcomed) return null;

  return (
    // z-50 matches OnboardingWizard's (src/onboarding/Wizard.tsx) — on a
    // doubly-fresh profile both can render at once, and the tie is broken
    // by DOM order (App.tsx's MainWindow mounts the wizard after GameShell,
    // so it wins). See App.tsx's MainWindow comment before changing either.
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        data-testid="welcome-card"
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border-2 border-white/60 bg-card/95 p-6 text-center shadow-2xl backdrop-blur"
      >
        <h2 className="text-lg font-bold">🏫 Welcome to your campus</h2>
        <ul className="flex flex-col gap-1.5 text-left text-sm text-muted-foreground">
          <li>🤖 your Claude Code sessions walk in as robots</li>
          <li>💬 click a robot to talk</li>
          <li>🔨 Build to make it yours</li>
        </ul>
        <button
          type="button"
          data-testid="welcome-card-dismiss"
          onClick={() => useGameWelcome.getState().dismiss()}
          className="mt-1 self-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          Let's go
        </button>
      </div>
    </div>
  );
}
