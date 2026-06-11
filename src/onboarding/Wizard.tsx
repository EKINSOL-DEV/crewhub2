// First-run wizard overlay (M6 T8, EKI-86 / D-M6-2): NOT a panel — a
// full-window overlay above the untouched WorkspaceShell whenever
// `onboarding.state` is pending. Every step is skippable ("Skip setup" →
// state=skipped, lands in the shell); quitting mid-wizard resumes at
// `onboarding.step` next launch. The finish step dissolves into the live
// workspace (Crew Cheer) — which is exactly why this lives in the main
// window instead of its own (D-M6-2 alternative, rejected).
import "./wizard.css";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/stores/onboarding";
import { nextStep, prevStep, stepIndex, STEP_LABELS, WIZARD_STEPS, type WizardStep } from "./step-machine";
import { CrewStep } from "./steps/Crew";
import { DetectStep } from "./steps/Detect";
import { FinishStep, enterWorkspace } from "./steps/Finish";
import { IntegrationsStep } from "./steps/Integrations";
import { ProjectsStep } from "./steps/Projects";
import { WelcomeStep } from "./steps/Welcome";

// ── Welcome Walk rail (D-M6-12) ──────────────────────────────────────────────

function StepRail({ step }: { step: WizardStep }) {
  const reduced = usePrefersReducedMotion();
  const idx = stepIndex(step);
  return (
    <div className="relative px-3 pt-6" data-testid="wizard-rail">
      <span
        aria-hidden
        data-testid="wizard-walker"
        className={cn("absolute top-0 -ml-2.5 text-lg", !reduced && "wizard-walker-wave")}
        // key restarts the wave each time the bot arrives at a new step
        key={step}
        style={{
          // each flex-1 rail item centers at (i + ½)/n of the row
          left: `${((idx + 0.5) / WIZARD_STEPS.length) * 100}%`,
          transition: reduced ? "none" : "left 400ms ease",
        }}
      >
        🤖
      </span>
      <ol className="flex items-start">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s}
            className="flex flex-1 flex-col items-center gap-1"
            aria-current={s === step ? "step" : undefined}
          >
            <span
              className={cn("h-2 w-2 rounded-full", i <= idx ? "bg-primary" : "bg-muted-foreground/30")}
            />
            <span
              className={cn(
                "text-[10px]",
                s === step ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {STEP_LABELS[s]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Step body ────────────────────────────────────────────────────────────────

function StepBody({ step }: { step: WizardStep }) {
  switch (step) {
    case "welcome":
      return <WelcomeStep />;
    case "detect":
      return <DetectStep />;
    case "projects":
      return <ProjectsStep />;
    case "crew":
      return <CrewStep />;
    case "integrations":
      return <IntegrationsStep />;
    case "finish":
      return <FinishStep />;
  }
}

const NEXT_LABEL: Record<WizardStep, string> = {
  welcome: "Let's go →",
  detect: "Continue →",
  projects: "Continue →",
  crew: "Continue →",
  integrations: "Continue →",
  finish: "Enter your workspace 🎉",
};

// ── The overlay ──────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const show = useOnboarding((s) => s.show);
  const loaded = useOnboarding((s) => s.loaded);
  const step = useOnboarding((s) => s.step);

  useEffect(() => {
    void useOnboarding.getState().load();
  }, []);

  if (!loaded || !show) return null;

  const s = useOnboarding.getState();
  const back = prevStep(step);

  function onContinue() {
    if (step === "finish") {
      enterWorkspace(); // seeded two-panel layout (chat + board), then done
      s.complete();
      return;
    }
    const next = nextStep(step);
    if (next) s.goTo(next);
  }

  return (
    <div
      data-testid="onboarding-wizard"
      role="dialog"
      aria-label="CrewHub setup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border bg-card shadow-xl">
        <StepRail step={step} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5" data-testid={`wizard-step-${step}`}>
          <StepBody step={step} />
        </div>
        <footer className="flex items-center gap-2 border-t px-5 py-3">
          {back && (
            <Button size="sm" variant="ghost" data-testid="wizard-back" onClick={() => s.goTo(back)}>
              ← Back
            </Button>
          )}
          <span className="flex-1" />
          {/* the app never holds the user hostage: skip works on EVERY step */}
          <Button size="sm" variant="ghost" data-testid="wizard-skip" onClick={() => s.skip()}>
            Skip setup
          </Button>
          <Button size="sm" data-testid="wizard-next" onClick={onContinue}>
            {NEXT_LABEL[step]}
          </Button>
        </footer>
      </div>
    </div>
  );
}
