/* The pixel diff behind `tools/pixcheck.mjs` (TypeScript, as lib/seed.ts: node runs it, the check types it): two RGBA images of one size, every pixel compared on every channel
   (red, green, blue, alpha), any difference at all counted; where the differing pixels are, in 100 px bands of rows;
   and a diff image: the first image faded to grey, red where a pixel differs, blue where a mask covers it (a mask is
   a rectangle `[x, y, width, height]` whose pixels are counted apart, never in `diff`). Pure: no browser, no file
   (`diffPngFiles` reads and writes them). */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng, type Image } from "./png.ts";

/** A rectangle of pixels counted apart: x, y, width, height. */
export type Mask = [number, number, number, number];

/**
 * `diff` differing pixels outside the masks, `maxDelta` the largest channel difference among them, `masked` the
 * pixels under a mask and `maskedDiff` those of them that differ, `bands` the five row bands with most differing
 * pixels (`y700`: rows 700 to 799), `image` the diff image (RGBA).
 */
export interface Diff {
  width: number;
  height: number;
  total: number;
  diff: number;
  maxDelta: number;
  masked: number;
  maskedDiff: number;
  bands: [string, number][];
  image: Uint8Array;
}

/** The diff of two images (see above). Throws when their sizes differ. */
export function diffImages(a: Image, b: Image, masks: readonly Mask[] = []): Diff {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`sizes differ: ${a.width} x ${a.height} against ${b.width} x ${b.height}`);
  const { width, height } = a;
  const pa = a.data, pb = b.data;
  const image = new Uint8Array(width * height * 4);
  const inMask = (x: number, y: number) => masks.some(([mx, my, mw, mh]) => x >= mx && x < mx + mw && y >= my && y < my + mh);
  let diff = 0, masked = 0, maskedDiff = 0, maxDelta = 0;
  const bands = new Map<string, number>();
  for (let i = 0, p = 0; i < pa.length; i += 4, p++) {
    const x = p % width, y = (p - x) / width;
    const d = Math.max(Math.abs(pa[i]! - pb[i]!), Math.abs(pa[i + 1]! - pb[i + 1]!), Math.abs(pa[i + 2]! - pb[i + 2]!), Math.abs(pa[i + 3]! - pb[i + 3]!));
    const g = Math.round(0.6 * (0.3 * pa[i]! + 0.59 * pa[i + 1]! + 0.11 * pa[i + 2]!) + 90);
    image[i] = g;
    image[i + 1] = g;
    image[i + 2] = g;
    image[i + 3] = 255;
    if (masks.length && inMask(x, y)) {
      masked++;
      if (d > 0) maskedDiff++;
      image[i] = Math.round(g * 0.7);
      image[i + 1] = Math.round(g * 0.7);
      image[i + 2] = 255;
      continue;
    }
    if (d > 0) {
      diff++;
      if (d > maxDelta) maxDelta = d;
      const band = `y${y - (y % 100)}`;
      bands.set(band, (bands.get(band) ?? 0) + 1);
      image[i] = 255;
      image[i + 1] = 0;
      image[i + 2] = 0;
    }
  }
  return { width, height, total: width * height, diff, maxDelta, masked, maskedDiff, bands: [...bands].sort((p, q) => q[1] - p[1]).slice(0, 5), image };
}

/** The diff of two PNG files; with `diffOut`, the diff image written there. The result without the image bytes. */
export function diffPngFiles(fileA: string, fileB: string, diffOut: string | null = null, masks: readonly Mask[] = []): Omit<Diff, "image"> {
  const result = diffImages(decodePng(readFileSync(fileA)), decodePng(readFileSync(fileB)), masks);
  if (diffOut) writeFileSync(diffOut, encodePng({ width: result.width, height: result.height, data: result.image }));
  const { image: _image, ...rest } = result;
  return rest;
}

/** One line for a pair, as `pixcheck.mjs` prints it. */
export function describeDiff(result: Omit<Diff, "image">): string {
  const bands = result.bands.length ? `; rows ${result.bands.map(([band, n]) => `${band}: ${n}`).join(", ")}` : "";
  const masked = result.masked ? `; masked ${result.masked} (${result.maskedDiff} differ)` : "";
  return `${result.diff} of ${result.total} pixels differ, max delta ${result.maxDelta}${bands}${masked}`;
}
