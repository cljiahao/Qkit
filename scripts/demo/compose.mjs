// QKit demo compositor — takes the raw recording + steps.json and produces the
// send-ready vertical mp4: phone capture centred on a 1080x1920 canvas with each
// beat's caption burned in, plus audio (Playwright records none):
//   • the order "ready" chime, mixed in at the moment the live order lands —
//     synthesised to match the app's real chime (G5·C6·E6 ×2, src/lib/order-alerts.ts)
//   • optional background music: drop a royalty-free track at
//     scripts/demo/assets/music.{mp3,m4a,wav,ogg} and it's mixed under the video
//     (low volume, faded in/out). No file → chime only.
//
// Prereq: ffmpeg + ffprobe on PATH; scripts/demo/out/{<video>.webm, steps.json}.
// Run: node scripts/demo/compose.mjs  →  scripts/demo/out/demo.mp4

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const ASSETS = path.join(HERE, "assets");
const BG = "0x241a12"; // Kraft & Ember dark — the pillarbox backdrop
// Bold font for captions. Override with DEMO_FONT if this path is absent.
const FONT = process.env.DEMO_FONT ?? "C:/Windows/Fonts/arialbd.ttf";

// The app's real "order ready" chime (src/lib/order-alerts.ts): a major triad
// rising, played twice. Replicated here so the demo's ding matches the product.
const CHIME_NOTES = [784, 1047, 1319, 784, 1047, 1319];
const CHIME_SPACING_MS = 200;

function ffEscapeText(s) {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
function ffEscapePath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function probeDuration(src) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      src,
    ],
    { encoding: "utf8" },
  );
  const d = parseFloat((r.stdout || "").trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

function findMusic() {
  if (!fs.existsSync(ASSETS)) return null;
  const hit = fs
    .readdirSync(ASSETS)
    .find((f) => /^music\.(mp3|m4a|wav|ogg|aac)$/i.test(f));
  return hit ? path.join(ASSETS, hit) : null;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, "steps.json"), "utf8"));
  const src = path.join(OUT, meta.video);
  if (!meta.video || !fs.existsSync(src)) {
    throw new Error(`Recording not found (${meta.video}). Run record.mjs first.`);
  }
  if (!fs.existsSync(FONT.replace(/\\:/g, ":"))) {
    console.warn(
      `! Font not found at ${FONT} — set DEMO_FONT to a .ttf if captions are blank.`,
    );
  }

  const dur = probeDuration(src) ?? meta.steps.at(-1).endMs / 1000 + 1;
  const fontPath = ffEscapePath(FONT);
  const music = findMusic();

  // Chime placement: the recorded pop time, or a sensible fallback near the end.
  const popSec =
    meta.popMs && meta.popMs > 0 ? meta.popMs / 1000 : Math.max(0, dur - 5);

  // ── Video chain: fit + pillarbox + per-beat captions ──────────────────────
  const vfilters = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG}`,
    "setsar=1",
  ];
  for (const s of meta.steps) {
    const start = (s.startMs / 1000).toFixed(2);
    const end = (s.endMs / 1000).toFixed(2);
    vfilters.push(
      `drawtext=fontfile='${fontPath}':text='${ffEscapeText(s.caption)}':` +
        `fontsize=52:fontcolor=white:box=1:boxcolor=0x000000@0.55:boxborderw=22:` +
        `x=(w-text_w)/2:y=h-380:enable='between(t,${start},${end})'`,
    );
  }

  // ── Audio chains ──────────────────────────────────────────────────────────
  const graph = [`[0:v]${vfilters.join(",")}[v]`];

  // Chime: one decaying note per tone, delayed onto the timeline.
  const noteLabels = [];
  CHIME_NOTES.forEach((freq, i) => {
    const delay = Math.round(popSec * 1000 + i * CHIME_SPACING_MS);
    const lbl = `n${i}`;
    noteLabels.push(`[${lbl}]`);
    graph.push(
      // ffmpeg's sine source is ~-18 dB, so volume=3 lifts the chime to a
      // clear ~-9 dB peak that sits above the background music.
      `sine=frequency=${freq}:duration=0.28:sample_rate=44100,` +
        `afade=t=in:st=0:d=0.006,afade=t=out:st=0.08:d=0.2,` +
        `volume=3.0,adelay=${delay}|${delay}[${lbl}]`,
    );
  });
  graph.push(
    `${noteLabels.join("")}amix=inputs=${CHIME_NOTES.length}:normalize=0[chime]`,
  );

  // Full-length silent base so the audio track spans the whole video.
  graph.push(`anullsrc=r=44100:cl=stereo,atrim=0:${dur.toFixed(2)}[base]`);

  const mixIns = ["[base]", "[chime]"];
  if (music) {
    graph.push(
      `[1:a]atrim=0:${dur.toFixed(2)},aresample=44100,volume=0.18,` +
        `afade=t=in:st=0:d=2,afade=t=out:st=${(dur - 3).toFixed(2)}:d=3[music]`,
    );
    mixIns.push("[music]");
  }
  graph.push(
    `${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0:duration=first[a]`,
  );

  const dst = path.join(OUT, "demo.mp4");
  const args = [
    "-y",
    "-i",
    src,
    ...(music ? ["-stream_loop", "-1", "-i", music] : []),
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-shortest",
    dst,
  ];

  console.log(
    `Running ffmpeg… chime @ ${popSec.toFixed(1)}s; ` +
      (music ? `music: ${path.basename(music)}` : "no music track (chime only)"),
  );
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.status !== 0) throw new Error("ffmpeg failed — see output above.");

  console.log(`\n✓ ${dst}`);
  if (!music) {
    console.log(
      "ℹ For background music, drop a royalty-free track at " +
        "scripts/demo/assets/music.mp3 and re-run.",
    );
  }
}

try {
  main();
} catch (err) {
  console.error("\n✗ Compose failed:", err.message);
  process.exit(1);
}
