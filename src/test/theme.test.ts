import { applyDensity, applyFontSize, applyTheme } from "../theme/apply";
import { isDensity, isFontSize, isThemeName, THEME_NAMES, THEMES } from "../theme/themes";

test("applyTheme sets CSS vars and dark class", () => {
  applyTheme("tokyo-night");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("#1a1b26");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  applyTheme("solarized-light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.dataset.theme).toBe("solarized-light");
});

test("all 9 v1 themes are ported (EKI-20)", () => {
  expect(THEME_NAMES).toHaveLength(9);
  for (const ported of [
    "catppuccin-mocha",
    "dracula",
    "github-light",
    "gruvbox-dark",
    "one-dark",
    "solarized-dark",
    "tokyo-night",
    "nord",
    "solarized-light",
  ]) {
    expect(isThemeName(ported)).toBe(true);
  }
});

test("every theme exposes the identical var set, incl. status + chat-bubble vars", () => {
  const reference = Object.keys(THEMES["tokyo-night"].vars).sort();
  for (const name of THEME_NAMES) {
    expect(Object.keys(THEMES[name].vars).sort()).toEqual(reference);
  }
  for (const required of [
    "--background",
    "--primary",
    "--ring",
    "--status-success",
    "--status-warning",
    "--status-error",
    "--status-info",
    "--chat-user-bubble",
    "--chat-assistant-bubble",
  ]) {
    expect(reference).toContain(required);
  }
});

test("switching themes overwrites every var (no stale colors)", () => {
  applyTheme("dracula");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("#282a36");
  applyTheme("gruvbox-dark");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("#282828");
  expect(document.documentElement.style.getPropertyValue("--chat-user-bubble")).toBe("#504945");
});

test("applyDensity scales the Tailwind spacing var", () => {
  applyDensity("compact");
  expect(document.documentElement.style.getPropertyValue("--spacing")).toBe("0.2rem");
  expect(document.documentElement.dataset.density).toBe("compact");
  applyDensity("comfortable");
  expect(document.documentElement.style.getPropertyValue("--spacing")).toBe("0.25rem");
});

test("applyFontSize sets the root font size", () => {
  applyFontSize("s");
  expect(document.documentElement.style.fontSize).toBe("14px");
  applyFontSize("l");
  expect(document.documentElement.style.fontSize).toBe("18px");
  expect(document.documentElement.dataset.fontSize).toBe("l");
});

test("validators reject junk", () => {
  expect(isThemeName("vaporwave")).toBe(false);
  expect(isDensity("cozy")).toBe(false);
  expect(isFontSize("xl")).toBe(false);
  expect(isDensity("compact")).toBe(true);
  expect(isFontSize("m")).toBe(true);
});
