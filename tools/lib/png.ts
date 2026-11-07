/* PNG in and out, no dependency: what a pixel check needs. `decodePng(buffer)` reads an 8-bit RGB or RGBA image
   (what a headless browser's screenshot is: non-interlaced, one IDAT stream) into RGBA bytes; `encodePng(image)`
   writes RGBA bytes as a PNG (filter none, one deflate stream). Node's zlib does the compression. */
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** RGBA, 4 bytes a pixel, rows top down. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The image in a PNG buffer (8-bit RGB or RGBA, not interlaced), as RGBA. Throws on anything else. */
export function decodePng(buffer: Buffer): Image {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("latin1", at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8]!, color = data[9]!, interlace = data[12]!;
      if (depth !== 8) throw new Error(`PNG bit depth ${depth}: only 8 is read`);
      if (color !== 2 && color !== 6) throw new Error(`PNG colour type ${color}: only RGB (2) and RGBA (6) are read`);
      if (interlace !== 0) throw new Error("interlaced PNG: not read");
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!width || !height || !channels) throw new Error("PNG without a header");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG data ${raw.length} bytes for ${width} x ${height} x ${channels}`);
  const rows = new Uint8Array(stride * height);
  // The filters, byte by byte against the pixel to the left (bpp back), the row above, or both (PNG 9.2).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    const above = y > 0 ? (y - 1) * stride : -1;
    for (let i = 0; i < stride; i++) {
      const x = raw[from + i]!;
      const a = i >= channels ? rows[to + i - channels]! : 0;
      const b = above >= 0 ? rows[above + i]! : 0;
      const c = above >= 0 && i >= channels ? rows[above + i - channels]! : 0;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`PNG filter ${filter} on row ${y}`);
      rows[to + i] = v & 255;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let p = 0, q = 0; p < rows.length; p += 3, q += 4) {
    data[q] = rows[p]!;
    data[q + 1] = rows[p + 1]!;
    data[q + 2] = rows[p + 2]!;
    data[q + 3] = 255;
  }
  return { width, height, data };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** An RGBA image as a PNG buffer (8-bit RGBA, filter none on every row). */
export function encodePng({ width, height, data }: Image): Buffer {
  if (data.length !== width * height * 4) throw new Error(`${data.length} bytes for ${width} x ${height} RGBA`);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
