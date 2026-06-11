import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { applySettingChange, useSettings } from "../stores/settings";

afterEach(clearMocks);

function mockSettings(kv: Record<string, string>) {
  const writes: Array<{ key: string; value: string }> = [];
  mockIPC((cmd, args) => {
    const a = args as { key: string; value?: string };
    if (cmd === "get_setting") return kv[a.key] ?? null;
    if (cmd === "set_setting") {
      writes.push({ key: a.key, value: a.value ?? "" });
      return null;
    }
    return null;
  });
  return writes;
}

test("load applies stored theme, density, font size and spawn model", async () => {
  mockSettings({
    theme: "nord",
    "ui.density": "compact",
    "ui.font_size": "l",
    "model.default_spawn": "sonnet",
  });
  await useSettings.getState().load();
  const s = useSettings.getState();
  expect(s.theme).toBe("nord");
  expect(s.density).toBe("compact");
  expect(s.fontSize).toBe("l");
  expect(s.defaultSpawnModel).toBe("sonnet");
  expect(s.loaded).toBe(true);
  expect(document.documentElement.dataset.theme).toBe("nord");
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(document.documentElement.style.fontSize).toBe("18px");
});

test("load falls back to defaults on unknown stored values", async () => {
  mockSettings({ theme: "not-a-theme", "ui.density": "cozy", "ui.font_size": "xxl" });
  await useSettings.getState().load();
  const s = useSettings.getState();
  expect(s.theme).toBe("tokyo-night");
  expect(s.density).toBe("comfortable");
  expect(s.fontSize).toBe("m");
  expect(s.defaultSpawnModel).toBe("haiku"); // haiku-default, D-M2-7
});

test("setTheme applies immediately and persists via backend", async () => {
  const writes = mockSettings({});
  await useSettings.getState().setTheme("solarized-light");
  expect(useSettings.getState().theme).toBe("solarized-light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(writes).toContainEqual({ key: "theme", value: "solarized-light" });
});

// Plan Appendix B: stores own the in-memory truth; `SettingChanged` events
// reconcile cross-window (settings window ↔ main window).
describe("event-driven refresh (SettingChanged)", () => {
  test("a watched key is re-read and applied", async () => {
    mockSettings({ theme: "dracula", "ui.density": "compact" });
    useSettings.setState({ theme: "nord", density: "comfortable" });
    await applySettingChange("theme");
    await applySettingChange("ui.density");
    expect(useSettings.getState().theme).toBe("dracula");
    expect(useSettings.getState().density).toBe("compact");
    expect(document.documentElement.dataset.theme).toBe("dracula");
    expect(document.documentElement.dataset.density).toBe("compact");
  });

  test("font size and spawn model reconcile too", async () => {
    mockSettings({ "ui.font_size": "s", "model.default_spawn": "opus" });
    useSettings.setState({ fontSize: "m", defaultSpawnModel: "haiku" });
    await applySettingChange("ui.font_size");
    await applySettingChange("model.default_spawn");
    expect(useSettings.getState().fontSize).toBe("s");
    expect(useSettings.getState().defaultSpawnModel).toBe("opus");
  });

  test("unwatched keys are ignored without an IPC read", async () => {
    const reads: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "get_setting") reads.push((args as { key: string }).key);
      return null;
    });
    await applySettingChange("perm.rules");
    await applySettingChange("workspace.tabs");
    expect(reads).toEqual([]);
  });

  test("an invalid broadcast value leaves current state untouched", async () => {
    mockSettings({ theme: "not-a-theme" });
    useSettings.setState({ theme: "nord" });
    await applySettingChange("theme");
    expect(useSettings.getState().theme).toBe("nord");
  });
});

test("setDensity / setFontSize / setDefaultSpawnModel persist their keys", async () => {
  const writes = mockSettings({});
  await useSettings.getState().setDensity("compact");
  await useSettings.getState().setFontSize("s");
  await useSettings.getState().setDefaultSpawnModel("opus");
  expect(writes).toContainEqual({ key: "ui.density", value: "compact" });
  expect(writes).toContainEqual({ key: "ui.font_size", value: "s" });
  expect(writes).toContainEqual({ key: "model.default_spawn", value: "opus" });
  expect(document.documentElement.style.getPropertyValue("--spacing")).toBe("0.2rem");
  expect(document.documentElement.style.fontSize).toBe("14px");
});
