#!/usr/bin/env node
// Copies six picked Kenney Interface Sounds files into public/assets/sfx/
// (committed — they're a few KB each, no build step needed unlike the glTF
// models). Source names carry no game meaning, so the mapping below is the
// only place that decision lives; sfx.ts just imports the stable output ids.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "assets-src/interface-sounds/Audio");
const OUT = path.join(ROOT, "public/assets/sfx");

const SFX = {
  click: "click_001.ogg",
  place: "drop_002.ogg",
  remove: "minimize_002.ogg",
  "chat-open": "open_002.ogg",
  send: "confirmation_002.ogg",
  hire: "bong_001.ogg",
};

mkdirSync(OUT, { recursive: true });

let failed = false;
for (const [id, file] of Object.entries(SFX)) {
  const src = path.join(SRC, file);
  if (!existsSync(src)) {
    console.error(`✗ ${id}: ${file} not found in interface-sounds — run \`pnpm assets:fetch\` first`);
    failed = true;
    continue;
  }
  copyFileSync(src, path.join(OUT, `${id}.ogg`));
  console.log(`✓ ${id}.ogg`);
}

writeFileSync(
  path.join(OUT, "LICENSE.txt"),
  "Sounds in this directory are picks from Kenney's Interface Sounds pack (kenney.nl):\n" +
    "- Interface Sounds — https://kenney.nl/assets/interface-sounds\n" +
    "License: Creative Commons Zero (CC0). Attribution appreciated, not required.\n",
);

if (failed) process.exit(1);
