// Wizard step machine (M6 T8, EKI-86 / D-M6-2): pure functions only — the
// overlay renders whatever this returns and never invents its own order.
// Steps: welcome → detect → projects → crew → integrations → finish.
// `onboarding.state` drives visibility (absent == pending: Lane 0's
// fresh-install check leaves genuinely fresh installs unset and writes
// "done" for installs that already have data); `onboarding.step` is the
// resumable position (quit mid-wizard, resume on next launch).

export const WIZARD_STEPS = ["welcome", "detect", "projects", "crew", "integrations", "finish"] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const ONBOARDING_STATES = ["pending", "done", "skipped"] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export const ONBOARDING_STATE_KEY = "onboarding.state";
export const ONBOARDING_STEP_KEY = "onboarding.step";

export function isWizardStep(v: string | null | undefined): v is WizardStep {
  return WIZARD_STEPS.includes(v as WizardStep);
}

export function isOnboardingState(v: string | null | undefined): v is OnboardingState {
  return ONBOARDING_STATES.includes(v as OnboardingState);
}

/**
 * Should the overlay greet this boot? Absent key == genuinely fresh install
 * (pending); "done" and "skipped" both land straight in the shell — the app
 * never holds the user hostage (D-M6-2).
 */
export function shouldShowWizard(state: string | null): boolean {
  return state === null || state === "pending";
}

/** Resume position: the persisted step when valid, else start at welcome. */
export function initialStep(saved: string | null): WizardStep {
  return isWizardStep(saved) ? saved : "welcome";
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

/** The step after `step`, or null past the end (finish completes, not next). */
export function nextStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) + 1] ?? null;
}

/** The step before `step`, or null at welcome. */
export function prevStep(step: WizardStep): WizardStep | null {
  const i = stepIndex(step);
  return i > 0 ? WIZARD_STEPS[i - 1]! : null;
}

/** Step rail labels (Welcome Walk, D-M6-12). */
export const STEP_LABELS: Record<WizardStep, string> = {
  welcome: "Welcome",
  detect: "CLI",
  projects: "Projects",
  crew: "Crew",
  integrations: "Integrations",
  finish: "Finish",
};
