"use client";

// =============================================================================
// Publication d'annonce en 3 étapes : Infos -> Photos & vidéo -> Détails.
//
// À la soumission :
//   1. INSERT properties (status 'draft', RLS : rôle seller/agency requis)
//   2. Vidéo : sign-upload -> PUT présigné (progression) -> finalize-video
//   3. Photos : sign-upload -> PUT présigné, une par une
//   4. UPDATE status -> 'pending' (modération admin)
// Puis suivi en direct du statut d'encodage (property_media.status).
//
// Les contrôles ici (durée 15-60 s, vertical, tailles) sont du confort UX :
// la validation qui fait foi est côté serveur (Edge Function + worker ffprobe).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import {
  callFunction,
  mediaContentType,
  probeVideoFile,
  putWithProgress,
  type VideoFileInfo,
} from "@/lib/upload";
import { PROPERTY_TYPE_LABELS, type OfferType, type PropertyType } from "@/lib/types";
import { CITIES } from "@/lib/constants";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 8;

interface FormState {
  title: string;
  type: PropertyType;
  offer_type: OfferType;
  price: string;
  city: string;
  district: string;
  description: string;
  surface: string;
  rooms: string;
  contact_phone: string;
  whatsapp_phone: string;
}

const initialForm: FormState = {
  title: "", type: "apartment", offer_type: "sale", price: "",
  city: "", district: "", description: "", surface: "", rooms: "",
  contact_phone: "", whatsapp_phone: "",
};

type Phase =
  | { name: "editing" }
  | { name: "creating" }
  | { name: "video"; progress: number }
  | { name: "images"; current: number; total: number }
  | { name: "submitting" }
  | { name: "done"; propertyId: string };

type AuthState =
  | { name: "loading" }
  | { name: "anonymous" }
  | { name: "forbidden" }
  | { name: "ready"; userId: string };

export default function PublishPage() {
  const [auth, setAuth] = useState<AuthState>({ name: "loading" });
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoFileInfo | null>(null);
  const [videoWarning, setVideoWarning] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return setAuth({ name: "anonymous" });
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).single();
      if (!profile || !["seller", "agency", "admin"].includes(profile.role)) {
        return setAuth({ name: "forbidden" });
      }
      setAuth({ name: "ready", userId: session.user.id });
    });
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleVideoChange(file: File | null) {
    setVideoFile(file);
    setVideoInfo(null);
    setVideoWarning(null);
    if (!file) return;

    if (file.size > MAX_VIDEO_BYTES) {
      setVideoFile(null);
      setVideoWarning("Vidéo trop volumineuse (max 200 Mo). Compressez-la ou filmez plus court.");
      return;
    }
    const info = await probeVideoFile(file);
    if (!info) {
      // Format illisible par le navigateur (.mov sous Chrome) : le serveur tranchera.
      setVideoWarning("Impossible de vérifier la vidéo dans le navigateur — elle sera contrôlée à l'envoi.");
      return;
    }
    setVideoInfo(info);
    if (info.duration < 15) {
      setVideoFile(null);
      setVideoWarning(`Vidéo trop courte (${Math.round(info.duration)} s) : minimum 15 secondes.`);
    } else if (info.duration > 60) {
      setVideoFile(null);
      setVideoWarning(`Vidéo trop longue (${Math.round(info.duration)} s) : maximum 60 secondes.`);
    } else if (info.height <= info.width) {
      setVideoFile(null);
      setVideoWarning("La vidéo doit être filmée en format vertical (portrait, 9:16).");
    }
  }

  function handleImagesChange(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files)
      .filter((f) => f.size <= MAX_IMAGE_BYTES)
      .slice(0, MAX_IMAGES);
    setImageFiles(accepted);
  }

  const step1Valid =
    form.title.trim().length >= 5 &&
    form.title.trim().length <= 120 &&
    Number(form.price) > 0 &&
    form.city.trim().length > 0;
  const step2Valid = videoFile !== null;

  async function submit() {
    if (auth.name !== "ready") return;
    setError(null);
    const supabase = getBrowserSupabase();
    let propertyId: string | null = null;

    try {
      setPhase({ name: "creating" });
      // L'annonce est rattachée à l'agence du compte, si elle existe.
      const { data: agency } = await supabase
        .from("agencies")
        .select("id")
        .eq("owner_id", auth.userId)
        .maybeSingle();

      const { data: property, error: insertError } = await supabase
        .from("properties")
        .insert({
          owner_id: auth.userId,
          agency_id: agency?.id ?? null,
          title: form.title.trim(),
          description: form.description.trim() || null,
          type: form.type,
          offer_type: form.offer_type,
          price: Math.round(Number(form.price)),
          surface: form.surface ? Number(form.surface) : null,
          rooms: form.rooms ? Number(form.rooms) : null,
          city: form.city.trim(),
          district: form.district.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          whatsapp_phone: form.whatsapp_phone.trim() || null,
          status: "draft",
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      propertyId = property.id;

      // --- Vidéo (obligatoire)
      setPhase({ name: "video", progress: 0 });
      const contentType = mediaContentType(videoFile!);
      const sign = await callFunction<{ job_id: string; upload_url: string }>(
        "sign-upload",
        {
          property_id: propertyId,
          kind: "video",
          content_type: contentType,
          size_bytes: videoFile!.size,
        },
      );
      await putWithProgress(sign.upload_url, videoFile!, contentType, (ratio) =>
        setPhase({ name: "video", progress: ratio }),
      );
      await callFunction("finalize-video", { job_id: sign.job_id });

      // --- Photos (optionnelles)
      for (let i = 0; i < imageFiles.length; i++) {
        setPhase({ name: "images", current: i + 1, total: imageFiles.length });
        const image = imageFiles[i];
        const imageType = mediaContentType(image);
        const imageSign = await callFunction<{ upload_url: string }>("sign-upload", {
          property_id: propertyId,
          kind: "image",
          content_type: imageType,
          size_bytes: image.size,
        });
        await putWithProgress(imageSign.upload_url, image, imageType);
      }

      // --- Soumission en modération
      setPhase({ name: "submitting" });
      const { error: updateError } = await supabase
        .from("properties")
        .update({ status: "pending" })
        .eq("id", propertyId);
      if (updateError) throw new Error(updateError.message);

      setPhase({ name: "done", propertyId: propertyId! });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setPhase({ name: "editing" });
      // L'annonce draft éventuellement créée reste visible dans le profil du
      // vendeur : il pourra réessayer sans tout resaisir (V1 : recommencer).
    }
  }

  // ---------------------------------------------------------------------------
  if (auth.name === "loading") {
    return <Shell><p className="text-white/60">Chargement…</p></Shell>;
  }
  if (auth.name === "anonymous") {
    return (
      <Shell>
        <p className="mb-4 text-white/80">Connectez-vous pour publier une annonce.</p>
        <Link href="/connexion?next=/publier" className="cta">Se connecter</Link>
      </Shell>
    );
  }
  if (auth.name === "forbidden") {
    return (
      <Shell>
        <p className="max-w-md text-white/80">
          Votre compte est un compte acheteur. Pour publier des annonces, créez
          un compte <strong>Vendeur</strong> ou <strong>Agence</strong> (ou
          contactez-nous pour changer de type de compte).
        </p>
      </Shell>
    );
  }
  if (phase.name === "done") {
    return <SuccessScreen propertyId={phase.propertyId} />;
  }

  const busy = phase.name !== "editing";

  return (
    <main className="min-h-dvh bg-night pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
        </Link>
        <span className="text-white/60">· Publier une annonce</span>
      </header>

      <div className="mx-auto max-w-xl p-4">
        {/* Indicateur d'étapes */}
        <ol className="mb-8 flex items-center gap-2">
          {["Infos", "Photos & vidéo", "Détails"].map((label, i) => (
            <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  step > i + 1
                    ? "bg-primary text-white"
                    : step === i + 1
                      ? "border-2 border-primary text-primary"
                      : "border border-white/25 text-white/40"
                }`}
              >
                {step > i + 1 ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${step === i + 1 ? "text-white" : "text-white/40"}`}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        {/* ---- Étape 1 : Infos ---- */}
        {step === 1 && (
          <section className="space-y-4">
            <Field label="Titre de l'annonce *">
              <input
                className="input"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Ex : Terrain 300 m² — Diamniadio, titre foncier"
                maxLength={120}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type de bien *">
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => update("type", e.target.value as PropertyType)}
                >
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Offre *">
                <select
                  className="input"
                  value={form.offer_type}
                  onChange={(e) => update("offer_type", e.target.value as OfferType)}
                >
                  <option value="sale">Vente</option>
                  <option value="rent">Location</option>
                </select>
              </Field>
            </div>
            <Field label={form.offer_type === "rent" ? "Loyer mensuel (FCFA) *" : "Prix (FCFA) *"}>
              <input
                className="input"
                type="number"
                min={1}
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="18500000"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville *">
                <input
                  className="input"
                  list="cities"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  placeholder="Dakar"
                />
                <datalist id="cities">
                  {CITIES.map((city) => <option key={city} value={city} />)}
                </datalist>
              </Field>
              <Field label="Quartier">
                <input
                  className="input"
                  value={form.district}
                  onChange={(e) => update("district", e.target.value)}
                  placeholder="Almadies"
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className="input min-h-28"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Décrivez le bien : situation, papiers, commodités…"
              />
            </Field>
          </section>
        )}

        {/* ---- Étape 2 : Photos & vidéo ---- */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h2 className="mb-1 font-semibold">Vidéo du bien *</h2>
              <p className="mb-3 text-sm text-white/60">
                Format vertical (9:16), entre 15 et 60 secondes, mp4 ou mov,
                200 Mo max. C&apos;est elle qui apparaît dans le feed.
              </p>
              <FilePicker
                accept="video/mp4,video/quicktime,.mp4,.mov"
                onChange={(files) => handleVideoChange(files?.[0] ?? null)}
                label={videoFile ? videoFile.name : "Choisir ou filmer une vidéo"}
                sublabel={
                  videoInfo
                    ? `${Math.round(videoInfo.duration)} s · ${videoInfo.width}×${videoInfo.height} ✓`
                    : undefined
                }
              />
              {videoWarning && (
                <p className="mt-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
                  {videoWarning}
                </p>
              )}
            </div>

            <div>
              <h2 className="mb-1 font-semibold">Photos</h2>
              <p className="mb-3 text-sm text-white/60">
                Jusqu&apos;à {MAX_IMAGES} photos (jpg, png, webp — 10 Mo max chacune).
              </p>
              <FilePicker
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleImagesChange}
                label={
                  imageFiles.length > 0
                    ? `${imageFiles.length} photo${imageFiles.length > 1 ? "s" : ""} sélectionnée${imageFiles.length > 1 ? "s" : ""}`
                    : "Choisir des photos"
                }
              />
            </div>
          </section>
        )}

        {/* ---- Étape 3 : Détails + envoi ---- */}
        {step === 3 && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Surface (m²)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.surface}
                  onChange={(e) => update("surface", e.target.value)}
                  placeholder="300"
                />
              </Field>
              <Field label="Nombre de pièces">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.rooms}
                  onChange={(e) => update("rooms", e.target.value)}
                  placeholder="4"
                />
              </Field>
            </div>
            <Field label="Téléphone (bouton Appeler)">
              <input
                className="input"
                type="tel"
                value={form.contact_phone}
                onChange={(e) => update("contact_phone", e.target.value)}
                placeholder="+221 77 123 45 67"
              />
            </Field>
            <Field label="WhatsApp">
              <input
                className="input"
                type="tel"
                value={form.whatsapp_phone}
                onChange={(e) => update("whatsapp_phone", e.target.value)}
                placeholder="+221 77 123 45 67"
              />
            </Field>

            <div className="rounded-xl bg-white/5 p-4 text-sm text-white/70">
              Après envoi, votre annonce est <strong>vérifiée par notre équipe</strong> avant
              publication. La vidéo est automatiquement optimisée pour toutes les connexions.
            </div>

            {busy && <ProgressPanel phase={phase} />}
            {error && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
            )}
          </section>
        )}

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={busy}
              className="flex-1 rounded-full border border-white/25 py-3 font-semibold transition hover:bg-white/10 disabled:opacity-40"
            >
              Retour
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !step1Valid : !step2Valid}
              className="flex-1 rounded-full bg-primary py-3 font-semibold transition hover:bg-primary-dark disabled:opacity-40"
            >
              Continuer
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 rounded-full bg-primary py-3 font-semibold transition hover:bg-primary-dark disabled:opacity-40"
            >
              {busy ? "Envoi en cours…" : "Envoyer pour vérification"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------

function ProgressPanel({ phase }: { phase: Phase }) {
  let label = "";
  let ratio: number | null = null;
  if (phase.name === "creating") label = "Création de l'annonce…";
  if (phase.name === "video") {
    label = `Envoi de la vidéo… ${Math.round(phase.progress * 100)} %`;
    ratio = phase.progress;
  }
  if (phase.name === "images") label = `Envoi des photos (${phase.current}/${phase.total})…`;
  if (phase.name === "submitting") label = "Soumission en modération…";

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="mb-2 text-sm">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: ratio !== null ? `${ratio * 100}%` : "100%" }}
        />
      </div>
    </div>
  );
}

/**
 * Écran de confirmation : suit en direct le statut d'encodage de la vidéo
 * (property_media.status : processing -> ready | failed), lisible par le
 * propriétaire grâce à la RLS.
 */
function SuccessScreen({ propertyId }: { propertyId: string }) {
  const [mediaStatus, setMediaStatus] = useState<string>("processing");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    async function poll() {
      const { data } = await supabase
        .from("property_media")
        .select("status")
        .eq("property_id", propertyId)
        .eq("kind", "video")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setMediaStatus(data.status);
      if (data && ["ready", "failed"].includes(data.status) && timer.current) {
        clearInterval(timer.current);
      }
    }
    poll();
    timer.current = setInterval(poll, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [propertyId]);

  return (
    <Shell>
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-3xl">
          ✓
        </span>
        <h1 className="text-2xl font-bold">Annonce envoyée !</h1>

        {mediaStatus === "ready" && (
          <p className="text-white/80">
            Votre vidéo est prête ✓. L&apos;annonce sera visible dans le feed dès
            validation par notre équipe.
          </p>
        )}
        {mediaStatus === "failed" && (
          <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">
            Votre vidéo n&apos;a pas pu être traitée (durée hors 15-60 s, format
            non vertical ou fichier corrompu). Publiez à nouveau avec une autre
            vidéo.
          </p>
        )}
        {!["ready", "failed"].includes(mediaStatus) && (
          <p className="text-white/80">
            Votre vidéo est en cours d&apos;optimisation
            <AnimatedDots /> Vous pouvez quitter cette page, le traitement
            continue tout seul.
          </p>
        )}

        <div className="flex justify-center gap-3 pt-2">
          <Link href="/" className="cta">Retour au feed</Link>
          <Link
            href="/publier"
            className="rounded-full border border-white/25 px-6 py-3 font-semibold transition hover:bg-white/10"
          >
            Publier une autre
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function AnimatedDots() {
  return <span className="inline-block w-6 animate-pulse text-left">…</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <Link href="/" className="mb-8 text-3xl font-bold">
        <span className="text-primary">Wori</span>mo
      </Link>
      {children}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/70">{label}</span>
      {children}
    </label>
  );
}

function FilePicker({
  accept,
  multiple,
  onChange,
  label,
  sublabel,
}: {
  accept: string;
  multiple?: boolean;
  onChange: (files: FileList | null) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/25 p-8 text-center transition hover:border-primary">
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => onChange(e.target.files)}
      />
      <span className="text-sm font-medium">{label}</span>
      {sublabel && <span className="text-xs text-primary">{sublabel}</span>}
    </label>
  );
}
