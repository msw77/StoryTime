/**
 * Download every classic-story image URL in src/data/storyImages.json into
 * a local scratch dir so agents can view them for review.
 *
 * Run with: node scripts/download-classic-images.mjs [--only=<id1,id2,...>]
 *
 * Writes:
 *   C:\Users\<user>\AppData\Local\Temp\classic-image-review\<storyId>\p<N>.png
 *
 * Idempotent — skips files already present on disk. Runs up to 8 downloads
 * in parallel to stay polite to fal's CDN.
 */

import { readFileSync, existsSync, mkdirSync, createWriteStream } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const OUT_DIR = join(tmpdir(), "classic-image-review");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const ONLY_ARG = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const onlyIds = ONLY_ARG ? new Set(ONLY_ARG.split(",").map((s) => s.trim())) : null;

const imageMap = JSON.parse(readFileSync(join(ROOT, "src/data/storyImages.json"), "utf-8"));

const jobs = [];
for (const [storyId, urls] of Object.entries(imageMap)) {
  if (!storyId.startsWith("classic_")) continue;
  if (onlyIds && !onlyIds.has(storyId)) continue;
  const dir = join(OUT_DIR, storyId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    const ext = url.endsWith(".png") ? "png" : "jpg";
    const dest = join(dir, `p${i + 1}.${ext}`);
    if (existsSync(dest)) continue;
    jobs.push({ url, dest, storyId, page: i + 1 });
  }
}

console.log(`${jobs.length} images to download → ${OUT_DIR}`);
if (jobs.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

function downloadOne({ url, dest }) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close();
      reject(err);
    });
  });
}

const CONCURRENCY = 8;
let inFlight = 0;
let idx = 0;
let completed = 0;
let failed = 0;

await new Promise((resolve) => {
  function kick() {
    while (inFlight < CONCURRENCY && idx < jobs.length) {
      const job = jobs[idx++];
      inFlight++;
      downloadOne(job)
        .then(() => { completed++; })
        .catch((err) => { failed++; console.error(`FAIL ${job.storyId}/p${job.page}: ${err.message}`); })
        .finally(() => {
          inFlight--;
          if (completed + failed === jobs.length) resolve();
          else kick();
        });
    }
  }
  kick();
});

console.log(`Done — ${completed} downloaded, ${failed} failed.`);
console.log(`Root: ${OUT_DIR}`);
