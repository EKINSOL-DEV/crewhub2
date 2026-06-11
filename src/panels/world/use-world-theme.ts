// Live theme → world palette (Epic 20): reads the active theme's CSS vars off
// :root and re-tints when applyTheme() swaps them (it writes inline style +
// data-theme on documentElement — a MutationObserver catches both).
import { useEffect, useState } from "react";
import { worldPaletteFrom, type WorldPalette } from "./lib/theme-palette";

function readPalette(): WorldPalette {
  const styles = getComputedStyle(document.documentElement);
  return worldPaletteFrom((name) => styles.getPropertyValue(name) || null);
}

export function useWorldTheme(): WorldPalette {
  const [palette, setPalette] = useState<WorldPalette>(readPalette);

  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);

  return palette;
}
