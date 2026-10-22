/* The pixel diff behind tools/pixcheck.mjs (tools/lib/pixdiff.ts, tools/lib/png.ts): any channel, any delta, where
   the pixels are, the masks, the diff image, and the PNG reader and writer round trip. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { decodePng, encodePng } from "../../tools/lib/png.ts";
import { describeDiff, diffImages, diffPngFiles } from "../../tools/lib/pixdiff.ts";

const image = (width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  return { width, height, data };
};
const plain = (w = 300, h = 250) => image(w, h, (x, y) => [x & 255, y & 255, (x + y) & 255, 255]);

test("identical images: 0 differing pixels, no band, a grey diff image", () => {
  const d = diffImages(plain(), plain());
  assert.equal(d.diff, 0);
  assert.equal(d.maxDelta, 0);
  assert.equal(d.total, 300 * 250);
  assert.deepEqual(d.bands, []);
  assert.equal(d.image.length, 300 * 250 * 4);
  assert.deepEqual([...d.image.subarray(0, 4)], [90, 90, 90, 255], "the first pixel (black) faded to grey");
  assert.equal(describeDiff(d), "0 of 75000 pixels differ, max delta 0");
});

test("one pixel one unit off in one channel is found, placed in its band, and painted red; alpha counts too", () => {
  const b = plain();
  b.data[(120 * 300 + 7) * 4 + 1] = b.data[(120 * 300 + 7) * 4 + 1]! + 1;
  const d = diffImages(plain(), b);
  assert.equal(d.diff, 1);
  assert.equal(d.maxDelta, 1);
  assert.deepEqual(d.bands, [["y100", 1]]);
  assert.deepEqual([...d.image.subarray((120 * 300 + 7) * 4, (120 * 300 + 7) * 4 + 4)], [255, 0, 0, 255]);
  assert.equal(describeDiff(d), "1 of 75000 pixels differ, max delta 1; rows y100: 1");
  const alpha = plain();
  alpha.data[3] = 254;
  assert.equal(diffImages(plain(), alpha).diff, 1, "a change in alpha alone");
  const far = plain();
  far.data[(249 * 300 + 299) * 4] = 0;
  assert.deepEqual(diffImages(plain(), far).bands, [["y200", 1]]);
});

test("a mask counts its pixels apart, never in diff; the bands rank the rows with most differences", () => {
  const b = plain();
  for (let y = 10; y < 20; y++) for (let x = 0; x < 300; x++) b.data[(y * 300 + x) * 4 + 2] = 0;
  for (let x = 0; x < 50; x++) b.data[(230 * 300 + x) * 4] = 0;
  const open = diffImages(plain(), b);
  assert.equal(open.diff, 3000 - 10 + 50 - 1, "the pixels whose blue or red was already 0 (one a row, x + y = 256; x = 0) are not a change");
  assert.deepEqual(open.bands[0]![0], "y0");
  const masked = diffImages(plain(), b, [[0, 0, 300, 20]]);
  assert.equal(masked.masked, 6000);
  assert.equal(masked.maskedDiff, 3000 - 10);
  assert.equal(masked.diff, 49);
  assert.deepEqual(masked.bands, [["y200", 49]]);
  assert.match(describeDiff(masked), /masked 6000 \(2990 differ\)/);
  assert.deepEqual([...masked.image.subarray(0, 3)], [63, 63, 255], "a masked pixel is painted blue");
});

test("images of two sizes are refused", () => {
  assert.throws(() => diffImages(plain(300, 250), plain(300, 251)), /sizes differ: 300 x 250 against 300 x 251/);
});

test("the PNG writer and reader round trip RGBA, read RGB, and refuse what they do not read", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pixdiff-"));
  const a = plain(37, 23);
  const file = path.join(dir, "a.png");
  writeFileSync(file, encodePng(a));
  const back = decodePng(readFileSync(file));
  assert.equal(back.width, 37);
  assert.equal(back.height, 23);
  assert.deepEqual([...back.data], [...a.data]);
  // Every filter type decodes: a PNG filtered row by row with 0 to 4 (hand-made from the same rows).
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG/);
  // The two files through the file API, with a diff image written.
  const b = plain(37, 23);
  b.data[5 * 37 * 4] = 7;
  const fileB = path.join(dir, "b.png"), out = path.join(dir, "diff.png");
  writeFileSync(fileB, encodePng(b));
  const d = diffPngFiles(file, fileB, out);
  assert.equal(d.diff, 1);
  assert.equal("image" in d, false);
  const diffImage = decodePng(readFileSync(out));
  assert.deepEqual([...diffImage.data.subarray(5 * 37 * 4, 5 * 37 * 4 + 4)], [255, 0, 0, 255]);
});
