import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { useSettings } from "../stores/settings";

afterEach(clearMocks);

test("load applies stored theme from backend", async () => {
  mockIPC((cmd) => {
    if (cmd === "get_setting") return "nord";
    return null;
  });
  await useSettings.getState().load();
  expect(useSettings.getState().theme).toBe("nord");
  expect(useSettings.getState().loaded).toBe(true);
  expect(document.documentElement.dataset.theme).toBe("nord");
});

test("load falls back to default on unknown stored value", async () => {
  mockIPC((cmd) => (cmd === "get_setting" ? "not-a-theme" : null));
  await useSettings.getState().load();
  expect(useSettings.getState().theme).toBe("tokyo-night");
});

test("setTheme applies immediately and persists via backend", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    return null;
  });
  await useSettings.getState().setTheme("solarized-light");
  expect(useSettings.getState().theme).toBe("solarized-light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(calls.some((c) => c.cmd === "set_setting")).toBe(true);
});
