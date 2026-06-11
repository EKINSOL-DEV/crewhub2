// Wizard happy path (M6 T9 AC, EKI-86/88): fresh profile → wizard greets →
// detect (found or guided-install branch — CI has no real CLI, both are
// legitimate) → projects → sample crew → skip hooks (plain Continue) →
// finish lands in a working chat+board workspace. Runs after smoke.spec
// against the same fresh profile, so onboarding.state is still unset.
import { expect, $ } from "@wdio/globals";

async function next() {
  await $('[data-testid="wizard-next"]').click();
}

describe("First-run wizard", () => {
  it("greets a fresh profile with the welcome step", async () => {
    await expect($('[data-testid="onboarding-wizard"]')).toBeExisting();
    await expect($('[data-testid="wizard-step-welcome"]')).toBeExisting();
    await expect($('[data-testid="wizard-walker"]')).toBeExisting(); // Welcome Walk
  });

  it("detect step resolves to the found or the guided-install branch", async () => {
    await next();
    await expect($('[data-testid="wizard-step-detect"]')).toBeExisting();
    // CI machines have no Claude CLI — the missing branch is a first-class
    // screen (manual path picker), never an error toast. Dev machines hit
    // the found branch. Either satisfies the step.
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="detect-found"]').isExisting()) ||
        (await $('[data-testid="detect-missing"]').isExisting()),
      { timeoutMsg: "detect step never settled" },
    );
  });

  it("projects step renders (scan or manual picker)", async () => {
    await next();
    await expect($('[data-testid="wizard-step-projects"]')).toBeExisting();
    await expect($('[data-testid="pick-folder"]')).toBeExisting();
  });

  it("sample crew moves in on the crew step (EKI-88)", async () => {
    await next();
    await expect($('[data-testid="wizard-step-crew"]')).toBeExisting();
    await $('[data-testid="sample-crew"]').click();
    await expect($('[data-testid="sample-crew-done"]')).toBeExisting();
  });

  it("integrations are individually declinable — skipping hooks is just Continue", async () => {
    await next();
    await expect($('[data-testid="wizard-step-integrations"]')).toBeExisting();
    // decline everything: no clicks, just continue
  });

  it("finish lands in a working two-panel workspace", async () => {
    await next();
    await expect($('[data-testid="wizard-step-finish"]')).toBeExisting();
    await next(); // "Enter your workspace 🎉"
    await expect($('[data-testid="onboarding-wizard"]')).not.toBeExisting();
    await expect($('[data-testid="panel-chat"]')).toBeExisting();
    await expect($('[data-testid="panel-board"]')).toBeExisting();
  });
});
