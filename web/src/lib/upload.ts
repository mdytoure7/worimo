import { getBrowserSupabase } from "./supabase-browser";

/**
 * Appelle une Edge Function avec le JWT de la session courante et remonte
 * les messages d'erreur français renvoyés par le backend.
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const supabase = getBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée : reconnectez-vous.");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    },
  );

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error ?? `Erreur serveur (${response.status})`);
  }
  return json as T;
}

/**
 * PUT du fichier vers l'URL présignée R2, avec progression.
 * XMLHttpRequest car fetch n'expose pas la progression d'upload.
 */
export function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Le Content-Type fait partie de la signature : il doit correspondre.
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`L'upload a échoué (code ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });
}

export interface VideoFileInfo {
  duration: number;
  width: number;
  height: number;
}

/**
 * Lit les métadonnées de la vidéo dans le navigateur (durée, dimensions).
 * Pur confort UX : la validation qui fait foi est celle du worker ffprobe.
 * Renvoie null si le navigateur ne sait pas lire le format (ex. .mov sous
 * Chrome) — dans ce cas on laisse passer et le serveur tranchera.
 */
export function probeVideoFile(file: File): Promise<VideoFileInfo | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

/** Déduit le content-type quand le navigateur ne le fournit pas. */
export function mediaContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
