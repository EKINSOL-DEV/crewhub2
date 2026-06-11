#!/usr/bin/env python3
"""Generate the three Tray Mood icon variants (D-M6-12: calm/busy/waiting).

Pure-stdlib PNG writer so the assets are reproducible from the repo:
    python3 scripts/gen-tray-icons.py
Writes 32x32 RGBA dots into src-tauri/icons/tray/.
"""
import struct, zlib, os

SIZE = 32
MOODS = {
    "calm": (74, 222, 128),     # green: nothing needs you
    "busy": (251, 191, 36),     # amber: sessions working
    "waiting": (248, 113, 113), # red: waiting on you
}

def chunk(tag, data):
    raw = tag + data
    return struct.pack(">I", len(data)) + raw + struct.pack(">I", zlib.crc32(raw))

def png(rgb):
    cx = cy = (SIZE - 1) / 2
    radius = SIZE * 0.42
    rows = b""
    for y in range(SIZE):
        row = b"\x00"
        for x in range(SIZE):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            # soft edge: 1px antialias band
            if d <= radius - 1:
                a = 255
            elif d <= radius:
                a = int(255 * (radius - d))
            else:
                a = 0
            row += bytes(rgb) + bytes([a])
        rows += row
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))

out_dir = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons", "tray")
os.makedirs(out_dir, exist_ok=True)
for name, rgb in MOODS.items():
    path = os.path.join(out_dir, f"{name}.png")
    with open(path, "wb") as fh:
        fh.write(png(rgb))
    print(f"wrote {path}")
