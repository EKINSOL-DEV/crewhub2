// M4 Lane H (T13–T15, EKI-30/35/39): automation panel E2E.
//
// ⚠️ PARKED — not yet in wdio.conf.ts `specs` (still smoke-only): this spec
// has never run against a packaged build (tauri-driver unavailable on the
// authoring machine), and unverified E2E must not gate CI. The T17
// integration sweep wires it in by adding "./automation.spec.ts" to `specs`
// and running the suite. Coverage: open via palette → Quiet Orchestra +
// honest copy → create a manual prompt run → row renders → cron preview in
// the editor → enable/disable toggle → delete. Deliberately NOT covered
// here: "run now" / near-future-cron firing (executes the real `claude`
// binary headlessly — needs the fake-claude harness wired into the E2E env
// first, also a T17 concern).
import { expect, $, browser } from "@wdio/globals";

async function openPalette(): Promise<void> {
  // mod+k: ⌘ on macOS, Ctrl elsewhere (keymap.ts)
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await browser.keys([mod, "k"]);
}

describe("Automation panel (M4 Lane H)", () => {
  it("opens via the palette and shows the honest scheduler copy", async () => {
    await openPalette();
    const palette = await $('[data-testid="command-palette"]');
    await expect(palette).toBeExisting();
    await browser.keys("automation");
    await $('[data-testid="palette-action-panel.open.automation"]').click();

    const panel = await $('[data-testid="automation-panel"]');
    await expect(panel).toBeExisting();
    // D-M4-4 AC: prominent, not a tooltip
    const copy = await $('[data-testid="scheduler-honest-copy"]');
    await expect(copy).toHaveText(expect.stringContaining("Schedules run only while CrewHub is open"));
  });

  it("creates a manual prompt run, previews a cron, toggles and deletes it", async () => {
    await $('[data-testid="new-schedule"]').click();
    const editor = await $('[data-testid="schedule-editor"]');
    await expect(editor).toBeExisting();

    await $('[aria-label="Run project path"]').setValue("/tmp");
    await $('[aria-label="Run prompt"]').setValue("e2e: say hello and exit");

    // live preview through the preview_cron IPC (next fires + honest note)
    await $('[aria-label="Cron expression"]').setValue("0 9 * * 1-5");
    await expect($('[data-testid="cron-preview"]')).toBeExisting();
    await expect($('[data-testid="cron-honest-note"]')).toBeExisting();
    // back to manual so nothing fires after the test
    await $('[aria-label="Cron expression"]').setValue("");

    await $('[data-testid="schedule-save"]').click();
    const row = await $('[data-testid^="run-row-"]');
    await expect(row).toBeExisting();

    // enabled toggle round-trips
    const toggle = await row.$('[data-testid^="run-enabled-"]');
    await toggle.click();
    await expect(toggle).toHaveText("off");

    // delete needs the confirm click
    await row.$("button=Delete").click();
    await row.$("button=Sure?").click();
    await expect($('[data-testid^="run-row-"]')).not.toBeExisting();
  });
});
