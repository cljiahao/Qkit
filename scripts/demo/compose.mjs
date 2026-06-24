// QKit demo compositor — takes the raw recording + steps.json and produces the
// send-ready vertical mp4: phone capture centred on a 1080x1920 canvas with each
// beat's caption burned in over its time window. No audio.
//
// Prereq: ffmpeg on PATH; scripts/demo/out/{<video>.webm, steps.json} from
// record.mjs. Run: node scripts/demo/compose.mjs  →  scripts/demo/out/demo.mp4

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const BG = "0x241a12"; // Kraft & Ember dark — the pillarbox backdrop
// Bold font for captions. Override with DEMO_FONT if this path is absent.
const FONT = process.env.DEMO_FONT ?? "C:/Windows/Fonts/arialbd.ttf";

function ffEscapeText(s) {
  // Escape the characters ffmpeg drawtext treats specially.
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
function ffEscapePath(p) {
  // Windows drive colon must be escaped inside a filter value.
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function main() {
  const meta = JSON.parse(
    fs.readFileSync(path.join(OUT, "steps.json"), "utf8"),
  );
  const src = path.join(OUT, meta.video);
  if (!meta.video || !fs.existsSync(src)) {
    throw new Error(
      `Recording not found (${meta.video}). Run record.mjs first.`,
    );
  }
  if (!fs.existsSync(FONT.replace(/\\:/g, ":"))) {
    console.warn(
      `! Font not found at ${FONT} — set DEMO_FONT to a .ttf if captions are blank.`,
    );
  }

  const fontPath = ffEscapePath(FONT);

  // Fit the phone capture inside 1080x1920 (pillarboxed — the phone is taller
  // than 9:16), then burn one drawtext per beat, gated to its time window.
  const filters = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG}`,
    "setsar=1",
  ];

  for (const s of meta.steps) {
    const start = (s.startMs / 1000).toFixed(2);
    const end = (s.endMs / 1000).toFixed(2);
    const text = ffEscapeText(s.caption);
    filters.push(
      `drawtext=fontfile='${fontPath}':text='${text}':` +
        `fontsize=52:fontcolor=white:box=1:boxcolor=0x000000@0.55:boxborderw=22:` +
        `x=(w-text_w)/2:y=h-380:` +
        `enable='between(t,${start},${end})'`,
    );
  }

  const dst = path.join(OUT, "demo.mp4");
  const args = [
    "-y",
    "-i",
    src,
    "-vf",
    filters.join(","),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    dst,
  ];

  console.log("Running ffmpeg…");
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error("ffmpeg failed — see output above.");
  }
  console.log(`\n✓ ${dst}`);
}

try {
  main();
} catch (err) {
  console.error("\n✗ Compose failed:", err.message);
  process.exit(1);
}
