import { expect, $, $$ } from "@wdio/globals";

describe("CrewHub shell", () => {
  it("boots and exposes backend version via IPC", async () => {
    // World-primary shell: the app boots into the fullscreen world — visit
    // the workspace first. (When the onboarding wizard is active instead,
    // the classic shell already sits underneath it and the button is absent.)
    const toWorkspace = await $('[data-testid="to-workspace"]');
    if (await toWorkspace.isExisting()) await toWorkspace.click();
    const root = await $('[data-testid="app-root"]');
    await expect(root).toBeExisting();
    const version = await $('[data-testid="app-version"]');
    // proves the Rust <-> webview IPC round-trip works in the packaged app
    await expect(version).toHaveText(/v\d+\.\d+\.\d+/);
  });

  it("renders the default cockpit preset: multiple panels + splitters", async () => {
    await expect($('[data-testid="panel-chat"]')).toBeExisting();
    await expect($('[data-testid="panel-sessions"]')).toBeExisting();
    await expect($('[data-testid="panel-activity"]')).toBeExisting();
    const splitters = await $$('[role="separator"]');
    expect(splitters.length).toBeGreaterThanOrEqual(2);
  });
});
