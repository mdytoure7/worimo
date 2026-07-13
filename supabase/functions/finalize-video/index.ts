// =============================================================================
// POST /functions/v1/finalize-video
//
// Appelé par le client une fois l'upload de la vidéo terminé sur l'URL signée.
// Vérifie côté serveur que l'objet existe réellement dans le bucket staging
// et respecte la taille max, puis passe le job en 'queued' : le worker ffmpeg
// prend le relais (validation durée 15-60 s + transcodage + push R2).
//
// Corps attendu (JSON) : { job_id: uuid }
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { errorResponse, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { headObject, r2Config } from "../_shared/r2.ts";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Méthode non autorisée", 405);

  try {
    const { job_id } = await req.json();
    if (!job_id) return errorResponse("job_id requis", 400);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse("Non authentifié", 401);

    // video_jobs n'est lisible qu'en service_role : on vérifie nous-mêmes
    // que le job appartient bien à une annonce de l'appelant.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: job } = await serviceClient
      .from("video_jobs")
      .select("id, status, staging_key, media_id, properties!inner(owner_id)")
      .eq("id", job_id)
      .single();

    if (!job || (job.properties as { owner_id: string }).owner_id !== user.id) {
      return errorResponse("Job introuvable ou non autorisé", 404);
    }
    if (job.status !== "awaiting_upload") {
      return errorResponse(`Job déjà traité (statut : ${job.status})`, 409);
    }

    // Contrôle serveur : l'objet doit exister et respecter la taille max.
    const object = await headObject(r2Config.stagingBucket(), job.staging_key);
    if (!object) {
      return errorResponse("Aucun fichier reçu : l'upload n'a pas abouti", 400);
    }
    if (object.size > MAX_VIDEO_BYTES) {
      await serviceClient.from("video_jobs")
        .update({ status: "failed", error: "Fichier trop volumineux" })
        .eq("id", job.id);
      return errorResponse("Fichier trop volumineux (max 200 Mo)", 413);
    }

    await serviceClient.from("video_jobs")
      .update({ status: "queued", error: null })
      .eq("id", job.id);
    await serviceClient.from("property_media")
      .update({ status: "processing" })
      .eq("id", job.media_id);

    return jsonResponse({ ok: true, job_id: job.id, status: "queued" });
  } catch (err) {
    console.error("finalize-video:", err);
    return errorResponse("Erreur interne", 500);
  }
});
