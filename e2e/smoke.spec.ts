import { expect, $ } from "@wdio/globals";

describe("CrewHub shell", () => {
  it("boots and exposes backend version via IPC", async () => {
    const root = await $('[data-testid="app-root"]');
    await expect(root).toBeExisting();
    const version = await $('[data-testid="app-version"]');
    // proves the Rust <-> webview IPC round-trip works in the packaged app
    await expect(version).toHaveText(/v\d+\.\d+\.\d+/);
  });
});
