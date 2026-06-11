// Wizard step machine (M6 T8, §3.3): pure table tests — order, skip/resume
// from every step, fresh-install vs existing-data entry.
import {
  initialStep,
  isOnboardingState,
  isWizardStep,
  nextStep,
  prevStep,
  shouldShowWizard,
  stepIndex,
  WIZARD_STEPS,
} from "@/onboarding/step-machine";

test("step order is the D-M6-2 closed list", () => {
  expect(WIZARD_STEPS).toEqual(["welcome", "detect", "projects", "crew", "integrations", "finish"]);
});

test("nextStep walks forward and ends after finish", () => {
  expect(nextStep("welcome")).toBe("detect");
  expect(nextStep("detect")).toBe("projects");
  expect(nextStep("projects")).toBe("crew");
  expect(nextStep("crew")).toBe("integrations");
  expect(nextStep("integrations")).toBe("finish");
  expect(nextStep("finish")).toBeNull();
});

test("prevStep walks backward and stops at welcome", () => {
  expect(prevStep("welcome")).toBeNull();
  expect(prevStep("detect")).toBe("welcome");
  expect(prevStep("finish")).toBe("integrations");
});

test("stepIndex matches the rail position", () => {
  for (const [i, s] of WIZARD_STEPS.entries()) expect(stepIndex(s)).toBe(i);
});

// fresh-install vs existing-data entry (Lane 0 writes "done" for existing
// installs; absent == pending for genuinely fresh ones)
test.each([
  [null, true], // fresh install: key absent
  ["pending", true], // re-armed by "Re-run setup wizard"
  ["done", false], // finished or existing install
  ["skipped", false], // user said no — never hold them hostage
  ["garbage", false], // unknown value: fail closed, never block the shell
])("shouldShowWizard(%j) → %j", (state, expected) => {
  expect(shouldShowWizard(state)).toBe(expected);
});

// resume from every step; junk falls back to welcome
test.each([
  ...WIZARD_STEPS.map((s) => [s, s] as const),
  ["nonsense", "welcome"] as const,
  [null, "welcome"] as const,
])("initialStep(%j) → %j", (saved, expected) => {
  expect(initialStep(saved)).toBe(expected);
});

test("guards: isWizardStep / isOnboardingState", () => {
  expect(isWizardStep("crew")).toBe(true);
  expect(isWizardStep("hooks")).toBe(false);
  expect(isOnboardingState("skipped")).toBe(true);
  expect(isOnboardingState("paused")).toBe(false);
});
