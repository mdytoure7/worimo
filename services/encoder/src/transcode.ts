import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoInfo } from "./probe.js";

// ffmpeg recopie les chemins de sortie dans les URI du manifeste maître :
// sous Windows, path.join produirait des antislashs illisibles pour les
// lecteurs HLS. ffmpeg accepte les slashs sur toutes les plateformes.
function posixJoin(...parts: string[]): string {
  return path.join(...parts).split(path.sep).join("/");
}

interface Rendition {
  name: string;
  width: number;   // côté court (vidéo verticale) : 480p = 480 px de large
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
}

const RENDITIONS: Rendition[] = [
  { name: "480p",  width: 480,  videoBitrate: "800k",  maxrate: "900k",  bufsize: "1400k", audioBitrate: "64k" },
  { name: "720p",  width: 720,  videoBitrate: "1800k", maxrate: "2000k", bufsize: "3000k", audioBitrate: "96k" },
  { name: "1080p", width: 1080, videoBitrate: "3500k", maxrate: "3900k", bufsize: "5500k", audioBitrate: "128k" },
];

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg a échoué (code ${code}) :\n${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Transcode la vidéo source en ladder HLS adaptatif (jusqu'à 3 rendus),
 * en une seule passe ffmpeg. Produit dans outDir :
 *   master.m3u8            <- manifeste maître (stocké en base)
 *   480p/index.m3u8 + seg_*.ts, 720p/…, 1080p/…
 * Ne génère pas de rendu plus large que la source (pas d'upscale inutile).
 */
export async function transcodeToHls(
  inputPath: string,
  outDir: string,
  info: VideoInfo,
): Promise<{ renditions: string[] }> {
  const usable = RENDITIONS.filter((r) => r.width <= info.width);
  const renditions = usable.length > 0 ? usable : [RENDITIONS[0]];

  for (const r of renditions) {
    await mkdir(path.join(outDir, r.name), { recursive: true });
  }

  // split -> N branches redimensionnées. h=-2 garantit une hauteur paire.
  const labels = renditions.map((_, i) => `[v${i}]`).join("");
  const filter =
    `[0:v]split=${renditions.length}${labels};` +
    renditions
      .map((r, i) => `[v${i}]scale=w=${r.width}:h=-2[v${i}out]`)
      .join(";");

  const args: string[] = ["-y", "-i", inputPath, "-filter_complex", filter];

  renditions.forEach((r, i) => {
    args.push(
      "-map", `[v${i}out]`,
      `-c:v:${i}`, "libx264",
      `-b:v:${i}`, r.videoBitrate,
      `-maxrate:v:${i}`, r.maxrate,
      `-bufsize:v:${i}`, r.bufsize,
    );
  });

  // Réglages communs à tous les rendus : keyframes alignées sur les segments.
  args.push(
    "-preset", "veryfast",
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
  );

  if (info.hasAudio) {
    renditions.forEach((r, i) => {
      args.push("-map", "0:a:0", `-b:a:${i}`, r.audioBitrate);
    });
    args.push("-c:a", "aac", "-ac", "2", "-ar", "44100");
  }

  const streamMap = renditions
    .map((r, i) => (info.hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`))
    .join(" ");

  args.push(
    "-f", "hls",
    "-hls_time", "4",
    "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", posixJoin(outDir, "%v", "seg_%03d.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    posixJoin(outDir, "%v", "index.m3u8"),
  );

  await runFfmpeg(args);

  // Filet de sécurité : aucun antislash ne doit subsister dans le manifeste.
  const masterPath = path.join(outDir, "master.m3u8");
  const master = await readFile(masterPath, "utf8");
  await writeFile(masterPath, master.replaceAll("\\", "/"), "utf8");

  return { renditions: renditions.map((r) => r.name) };
}

/** Extrait une miniature jpg (poster du feed) vers outPath. */
export async function extractThumbnail(inputPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-ss", "1",
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=720:-2",
    "-q:v", "3",
    outPath,
  ]);
}
