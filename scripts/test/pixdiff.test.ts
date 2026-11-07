/* The pixel diff behind tools/pixcheck.mjs (tools/lib/pixdiff.ts, tools/lib/png.ts): any channel, any delta, where
   the pixels are, the masks, the diff image, and the PNG reader and writer round trip. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
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
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A PNG of `img` with each row filtered by the type `filterOf(y)` picks (PNG 9.2, the encoder's side of the decoder's
 * formulas): what a browser's screenshot is, Sub, Up, Average and Paeth on almost every row; `encodePng` writes 0 only.
 */
function filteredPng(img: { width: number; height: number; data: Uint8Array }, channels: 3 | 4, filterOf: (y: number) => number): Buffer {
  const stride = img.width * channels;
  const rows = new Uint8Array(stride * img.height);
  for (let p = 0; p < img.width * img.height; p++) for (let c = 0; c < channels; c++) rows[p * channels + c] = img.data[p * 4 + c]!;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    const filter = filterOf(y);
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = rows[y * stride + i]!;
      const a = i >= channels ? rows[y * stride + i - channels]! : 0;
      const b = y > 0 ? rows[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= channels ? rows[(y - 1) * stride + i - channels]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predicted = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      raw[y * (stride + 1) + 1 + i] = (x - predicted) & 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("every PNG filter decodes (round 48, review F15): Sub, Up, Average and Paeth, row by row, RGB and RGBA", () => {
  // Values that wrap and tie, so every branch of Average and Paeth is met; the alpha varies for RGBA.
  const noisy = image(29, 17, (x, y) => [(x * 37 + y * 11) & 255, (x * x + 3 * y * y) & 255, (250 + x * 7 - y * 5) & 255, (x * 53 + y * 29) & 255]);
  const opaque = image(29, 17, (x, y) => [(x * 37 + y * 11) & 255, (x * x + 3 * y * y) & 255, (250 + x * 7 - y * 5) & 255, 255]);
  for (const filter of [1, 2, 3, 4]) {
    assert.deepEqual([...decodePng(filteredPng(noisy, 4, () => filter)).data], [...noisy.data], `RGBA, every row filter ${filter}`);
    assert.deepEqual([...decodePng(filteredPng(opaque, 3, () => filter)).data], [...opaque.data], `RGB, every row filter ${filter}`);
  }
  assert.deepEqual([...decodePng(filteredPng(opaque, 3, (y) => [3, 4, 1, 2, 0][y % 5]!)).data], [...opaque.data], "the filters mixed row by row, as a screenshot has them");
  // Paeth's ties, where the order of its tests decides: left a, above b, upper-left c for the pixel at (1, 1).
  // (5, 20, 10): pb = pc = 5 < pa = 10, so b; (6, 12, 10): pa = pc = 2 < pb = 4, so a.
  for (const [a, b, c] of [[5, 20, 10], [6, 12, 10]] as const) {
    const tie = image(2, 2, (x, y) => (x === 0 && y === 0 ? [c, c, c, 255] : x === 1 && y === 0 ? [b, b, b, 255] : x === 0 ? [a, a, a, 255] : [77, 77, 77, 255]));
    assert.deepEqual([...decodePng(filteredPng(tie, 3, () => 4)).data], [...tie.data], `Paeth's tie with a ${a}, b ${b}, c ${c}`);
  }
  assert.throws(() => decodePng(filteredPng(opaque, 3, () => 5)), /PNG filter 5 on row 0/);
});
