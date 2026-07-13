// =============================================================================
// Worker d'encodage Worimo.
//
// Boucle : réclame un job 'queued' (RPC atomique) -> télécharge la source
// depuis le bucket staging -> valide (durée 15-60 s, vertical) -> transcode
// en HLS 480p/720p/1080p -> pousse vers le bucket public -> met à jour
// property_media -> supprime la source staging.
//
// Conteneur Docker portable : tourne à l'identique en local (docker compose),
// sur Google Cloud Run (niveau gratuit) ou sur n'importe quel VPS.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { ValidationError } from "./errors.js";
import { probeAndValidate } from "./probe.js";
import { deleteObject, downloadObject, uploadDirectory } from "./storage.js";
import { extractThumbnail, transcodeToHls } from "./transcode.js";

interface VideoJob {
  id: string;
  media_id: string;
  property_id: string;
  staging_key: string;
  attempts: number;
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
let shuttingDown = false;

async function processJob(job: VideoJob): Promise<void> {
  const workDir = path.resolve(config.tmpDir, job.id);
  const inputPath = path.join(workDir, `source${path.extname(job.staging_key) || ".mp4"}`);
  const hlsDir = path.join(workDir, "hls");

  try {
    await mkdir(hlsDir, { recursive: true });

    console.log(`[${job.id}] Téléchargement de ${job.staging_key}…`);
    await downloadObject(config.stagingBucket, job.staging_key, inputPath);

    console.log(`[${job.id}] Validation ffprobe…`);
    const info = await probeAndValidate(inputPath);
    console.log(
      `[${job.id}] OK : ${info.durationSeconds.toFixed(1)} s, ${info.width}x${info.height}, audio=${info.hasAudio}`,
    );

    console.log(`[${job.id}] Transcodage HLS…`);
    const { renditions } = await transcodeToHls(inputPath, hlsDir, info);
    await extractThumbnail(inputPath, path.join(hlsDir, "thumbnail.jpg"));

    const keyPrefix = `videos/${job.property_id}/${job.media_id}`;
    console.log(`[${job.id}] Upload vers ${config.publicBucket}/${keyPrefix} (${renditions.join(", ")})…`);
    await uploadDirectory(hlsDir, keyPrefix);

    const { error: mediaError } = await supabase
      .from("property_media")
      .update({
        manifest_url: `${config.publicBaseUrl}/${keyPrefix}/master.m3u8`,
        thumbnail_url: `${config.publicBaseUrl}/${keyPrefix}/thumbnail.jpg`,
        storage_prefix: keyPrefix,
        duration_seconds: Math.round(info.durationSeconds * 100) / 100,
        width: info.width,
        height: info.height,
        status: "ready",
      })
      .eq("id", job.media_id);
    if (mediaError) throw new Error(`Mise à jour property_media : ${mediaError.message}`);

    await supabase.from("video_jobs")
      .update({ status: "completed", error: null })
      .eq("id", job.id);

    // La source staging ne sert plus à rien : on libère l'espace.
    await deleteObject(config.stagingBucket, job.staging_key).catch((err) =>
      console.warn(`[${job.id}] Nettoyage staging impossible :`, err.message),
    );
    console.log(`[${job.id}] Terminé ✔`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof ValidationError;
    const retryable = !permanent && job.attempts < config.maxAttempts;

    console.error(`[${job.id}] Échec (${permanent ? "permanent" : `tentative ${job.attempts}`}) : ${message}`);

    await supabase.from("video_jobs")
      .update({ status: retryable ? "queued" : "failed", error: message })
      .eq("id", job.id);

    if (!retryable) {
      await supabase.from("property_media")
        .update({ status: "failed" })
        .eq("id", job.media_id);
      if (permanent) {
        // Fichier invalide : on nettoie aussi la source.
        await deleteObject(config.stagingBucket, job.staging_key).catch(() => {});
      }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function claimJob(): Promise<VideoJob | null> {
  const { data, error } = await supabase.rpc("claim_next_video_job");
  if (error) {
    console.error("claim_next_video_job :", error.message);
    return null;
  }
  const rows = data as VideoJob[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

async function main(): Promise<void> {
  console.log("Worker d'encodage Worimo démarré.");
  console.log(`  Supabase : ${config.supabaseUrl}`);
  console.log(`  S3       : ${config.s3Endpoint} (staging=${config.stagingBucket}, public=${config.publicBucket})`);

  while (!shuttingDown) {
    const job = await claimJob();
    if (job) {
      await processJob(job);
    } else {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
  console.log("Arrêt propre du worker.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
