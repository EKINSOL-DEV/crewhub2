import { applyTheme } from "../theme/apply";

test("applyTheme sets CSS vars and dark class", () => {
  applyTheme("tokyo-night");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("#1a1b26");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  applyTheme("solarized-light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.dataset.theme).toBe("solarized-light");
});
