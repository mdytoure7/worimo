import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { ValidationError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface VideoInfo {
  durationSeconds: number;
  /** Dimensions effectives à l'affichage (rotation appliquée). */
  width: number;
  height: number;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
}

/**
 * Analyse le fichier avec ffprobe et applique les règles produit :
 * durée 15-60 s, format vertical (9:16 ou approchant), flux vidéo lisible.
 * C'est LA validation qui fait foi — celle du client n'est qu'un confort UX.
 */
export async function probeAndValidate(filePath: string): Promise<VideoInfo> {
  let raw: string;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ], { maxBuffer: 10 * 1024 * 1024 });
    raw = stdout;
  } catch {
    throw new ValidationError("Fichier vidéo illisible ou corrompu");
  }

  const probe = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: FfprobeStream[];
  };

  const videoStream = probe.streams?.find((s) => s.codec_type === "video");
  if (!videoStream || !videoStream.width || !videoStream.height) {
    throw new ValidationError("Aucun flux vidéo détecté dans le fichier");
  }

  const durationSeconds = Number(probe.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ValidationError("Durée de la vidéo indéterminable");
  }
  if (durationSeconds < config.minDurationSeconds) {
    throw new ValidationError(
      `Vidéo trop courte (${durationSeconds.toFixed(1)} s) : minimum 15 secondes`,
    );
  }
  if (durationSeconds > config.maxDurationSeconds) {
    throw new ValidationError(
      `Vidéo trop longue (${durationSeconds.toFixed(1)} s) : maximum 60 secondes`,
    );
  }

  // Les téléphones enregistrent souvent en paysage + métadonnée de rotation :
  // on applique la rotation avant de juger l'orientation.
  const rotation = Math.abs(
    videoStream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      Number(videoStream.tags?.rotate ?? 0),
  );
  const rotated = rotation % 180 === 90;
  const width = rotated ? videoStream.height : videoStream.width;
  const height = rotated ? videoStream.width : videoStream.height;

  if (height <= width) {
    throw new ValidationError(
      "La vidéo doit être filmée en format vertical (portrait, 9:16)",
    );
  }

  const hasAudio = probe.streams?.some((s) => s.codec_type === "audio") ?? false;
  return { durationSeconds, width, height, hasAudio };
}
