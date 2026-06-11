// Wizard step 1 (T8): the hello. Friendly, short, and honest about what the
// next steps will do — nothing here writes anything.
export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">👋 Welcome to CrewHub</h2>
      <p className="text-sm text-muted-foreground">
        CrewHub is mission control for your coding agents: chat with sessions, watch them work in the 3D
        world, and keep the board honest while they do.
      </p>
      <p className="text-sm text-muted-foreground">A couple of minutes of setup, all of it optional:</p>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>🔍 find your Claude Code CLI</li>
        <li>📁 register the projects you already work in</li>
        <li>🤖 hire your first crew member (or borrow our sample crew)</li>
        <li>🔌 opt into integrations — each one previewed before it touches anything</li>
      </ul>
      <p className="text-xs text-muted-foreground">
        You can skip any step (or all of them) — everything here also lives in Settings later.
      </p>
    </div>
  );
}
