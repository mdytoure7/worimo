// =============================================================================
// POST /functions/v1/sign-upload
//
// Génère une URL présignée pour uploader un média d'annonce.
// Le client (Flutter/web) n'a JAMAIS les clés R2 : il reçoit une URL PUT
// à durée de vie courte, dont le Content-Type est verrouillé par la signature.
//
// Corps attendu (JSON) :
//   { property_id: uuid, kind: "video" | "image", content_type: string, size_bytes: number }
//
// - kind=video : objet créé dans le bucket STAGING (privé) + job d'encodage
//   'awaiting_upload'. Le client devra appeler finalize-video après l'upload.
// - kind=image : objet créé directement dans le bucket public.
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { errorResponse, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { presignPut, r2Config } from "../_shared/r2.ts";

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 60 s de vidéo mobile compressée << 200 Mo
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Méthode non autorisée", 405);

  try {
    const { property_id, kind, content_type, size_bytes } = await req.json();

    if (!property_id || !["video", "image"].includes(kind)) {
      return errorResponse("property_id et kind (video|image) sont requis", 400);
    }

    const typeMap = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const ext = typeMap[content_type];
    if (!ext) {
      return errorResponse(
        `Format refusé : ${content_type}. Formats acceptés : ${Object.keys(typeMap).join(", ")}`,
        415,
      );
    }

    const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!Number.isFinite(size_bytes) || size_bytes <= 0 || size_bytes > maxBytes) {
      return errorResponse(
        `Taille invalide (max ${Math.round(maxBytes / 1024 / 1024)} Mo)`,
        413,
      );
    }

    // --- Authentification : client lié au JWT de l'utilisateur appelant.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse("Non authentifié", 401);

    const { data: profile } = await userClient
      .from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["seller", "agency", "admin"].includes(profile.role)) {
      return errorResponse("Seuls les vendeurs et agences peuvent publier des médias", 403);
    }

    // --- L'annonce doit appartenir à l'appelant et ne pas être déjà publiée
    // (toute modification de média repasse par la modération). La RLS filtre
    // déjà : si l'annonce n'est pas à lui, la requête ne renvoie rien.
    const { data: property } = await userClient
      .from("properties")
      .select("id, owner_id, status")
      .eq("id", property_id)
      .single();
    if (!property || property.owner_id !== user.id) {
      return errorResponse("Annonce introuvable ou non autorisée", 404);
    }
    if (!["draft", "pending", "rejected"].includes(property.status)) {
      return errorResponse("Impossible de modifier les médias d'une annonce publiée", 409);
    }

    // --- Écritures en service_role (video_jobs est inaccessible aux clients).
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (kind === "video") {
      const { data: media, error: mediaError } = await serviceClient
        .from("property_media")
        .insert({ property_id, kind: "video", status: "uploading" })
        .select("id")
        .single();
      if (mediaError) throw mediaError;

      const stagingKey = `staging/${property_id}/${media.id}.${ext}`;
      const { data: job, error: jobError } = await serviceClient
        .from("video_jobs")
        .insert({
          media_id: media.id,
          property_id,
          staging_key: stagingKey,
          status: "awaiting_upload",
        })
        .select("id")
        .single();
      if (jobError) throw jobError;

      const uploadUrl = await presignPut(r2Config.stagingBucket(), stagingKey, content_type);
      return jsonResponse({ media_id: media.id, job_id: job.id, upload_url: uploadUrl });
    }

    // kind === "image" : upload direct vers le bucket public.
    const imageId = crypto.randomUUID();
    const imageKey = `images/${property_id}/${imageId}.${ext}`;
    const imageUrl = `${r2Config.publicBaseUrl()}/${imageKey}`;

    const { data: media, error: mediaError } = await serviceClient
      .from("property_media")
      .insert({
        property_id,
        kind: "image",
        url: imageUrl,
        storage_prefix: imageKey,
        status: "ready",
      })
      .select("id")
      .single();
    if (mediaError) throw mediaError;

    const uploadUrl = await presignPut(r2Config.publicBucket(), imageKey, content_type);
    return jsonResponse({ media_id: media.id, upload_url: uploadUrl, public_url: imageUrl });
  } catch (err) {
    console.error("sign-upload:", err);
    return errorResponse("Erreur interne", 500);
  }
});
