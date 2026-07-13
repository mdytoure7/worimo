"use client";

// =============================================================================
// Administration Worimo (V1) : modération des annonces + vérification foncière.
//
// La sécurité ne repose PAS sur cette page : la RLS n'expose les annonces
// non publiées qu'aux admins, et le trigger guard_property_status refuse
// publish/reject à quiconque n'est pas admin. Cette page n'est que l'outil.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import {
  PROPERTY_SELECT,
  formatPrice,
  getImages,
  getVerification,
  OFFER_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
  type PropertyMedia,
} from "@/lib/types";
import HlsPlayer from "@/components/HlsPlayer";
import VerificationEditor from "@/components/admin/VerificationEditor";

type Tab = "pending" | "published" | "rejected";

const TAB_LABELS: Record<Tab, string> = {
  pending: "En attente",
  published: "Publiées",
  rejected: "Refusées",
};

interface AdminProperty extends Property {
  status: string;
  created_at: string;
  rejection_reason: string | null;
  owner: { full_name: string; phone: string | null; email: string | null } | null;
}

const ADMIN_SELECT = `status, created_at, rejection_reason,
  owner:profiles!owner_id ( full_name, phone, email ),
  ${PROPERTY_SELECT}`;

type AuthState =
  | { name: "loading" }
  | { name: "denied" }
  | { name: "ready"; adminId: string };

/** Contrairement à getVideo (feed), l'admin voit la vidéo quel que soit son statut. */
function getAnyVideo(property: Property): PropertyMedia | null {
  return (
    property.property_media
      .filter((m) => m.kind === "video")
      .sort((a, b) => a.display_order - b.display_order)[0] ?? null
  );
}

export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>({ name: "loading" });
  const [tab, setTab] = useState<Tab>("pending");
  const [counts, setCounts] = useState<Record<Tab, number>>({ pending: 0, published: 0, rejected: 0 });
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return setAuth({ name: "denied" });
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role !== "admin") return setAuth({ name: "denied" });
      setAuth({ name: "ready", adminId: session.user.id });
    });
  }, []);

  const refresh = useCallback(async () => {
    const supabase = getBrowserSupabase();
    setLoading(true);

    const [{ data }, ...countResults] = await Promise.all([
      supabase
        .from("properties")
        .select(ADMIN_SELECT)
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(50),
      ...(["pending", "published", "rejected"] as Tab[]).map((status) =>
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ]);

    setProperties((data ?? []) as unknown as AdminProperty[]);
    setCounts({
      pending: countResults[0].count ?? 0,
      published: countResults[1].count ?? 0,
      rejected: countResults[2].count ?? 0,
    });
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (auth.name === "ready") refresh();
  }, [auth.name, refresh]);

  if (auth.name === "loading") {
    return <Centered>Chargement…</Centered>;
  }
  if (auth.name === "denied") {
    return (
      <Centered>
        <p className="mb-4">Accès réservé aux administrateurs.</p>
        <Link href="/connexion?next=/admin" className="cta">Se connecter</Link>
      </Centered>
    );
  }

  return (
    <main className="min-h-dvh bg-night pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
        </Link>
        <span className="text-white/60">· Administration</span>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        {/* Onglets */}
        <div className="mb-6 flex rounded-full bg-white/10 p-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelectedId(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
                tab === t ? "bg-primary text-white" : "text-white/70"
              }`}
            >
              {TAB_LABELS[t]}
              <span className={`ml-1.5 ${tab === t ? "text-white/80" : "text-white/40"}`}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {loading && <p className="py-8 text-center text-white/50">Chargement…</p>}
        {!loading && properties.length === 0 && (
          <p className="py-8 text-center text-white/50">
            Aucune annonce {TAB_LABELS[tab].toLowerCase()}.
          </p>
        )}

        <ul className="space-y-3">
          {properties.map((property) => (
            <li key={property.id}>
              <PropertyRow
                property={property}
                expanded={selectedId === property.id}
                onToggle={() =>
                  setSelectedId(selectedId === property.id ? null : property.id)
                }
                adminId={auth.adminId}
                onChanged={refresh}
              />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------

function PropertyRow({
  property,
  expanded,
  onToggle,
  adminId,
  onChanged,
}: {
  property: AdminProperty;
  expanded: boolean;
  onToggle: () => void;
  adminId: string;
  onChanged: () => void;
}) {
  const video = getAnyVideo(property);
  const verification = getVerification(property);

  return (
    <div className="overflow-hidden rounded-2xl bg-white/5">
      {/* Ligne résumé */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/5"
      >
        {video?.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-16 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs text-white/40">
            —
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{property.title}</span>
          <span className="block text-sm text-white/60">
            {PROPERTY_TYPE_LABELS[property.type]} · {property.city} ·{" "}
            {formatPrice(property.price, property.offer_type)}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <VideoStatusChip status={video?.status ?? "absente"} hasVideo={!!video} />
            {verification?.status === "verified" && (
              <Chip className="bg-primary/20 text-primary">Vérifié Worimo</Chip>
            )}
          </span>
        </span>
        <span className="shrink-0 text-white/40">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <PropertyDetail
          property={property}
          adminId={adminId}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function PropertyDetail({
  property,
  adminId,
  onChanged,
}: {
  property: AdminProperty;
  adminId: string;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const video = getAnyVideo(property);
  const images = getImages(property);
  const verification = getVerification(property);
  const videoReady = video?.status === "ready" && video.manifest_url;

  async function setStatus(status: "published" | "rejected" | "pending") {
    setBusy(true);
    setError(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase
      .from("properties")
      .update({
        status,
        rejection_reason: status === "rejected" ? reason.trim() || null : null,
      })
      .eq("id", property.id);
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setRejecting(false);
      onChanged();
    }
  }

  return (
    <div className="space-y-5 border-t border-white/10 p-4">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        {/* Aperçu vidéo */}
        <div>
          {videoReady ? (
            <HlsPlayer
              src={video!.manifest_url!}
              poster={video!.thumbnail_url ?? undefined}
              className="aspect-[9/16] w-full rounded-xl bg-black object-contain"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-white/10 p-4 text-center text-sm text-white/50">
              {video?.status === "processing"
                ? "Vidéo en cours d'encodage…"
                : video?.status === "failed"
                  ? "Échec de l'encodage vidéo"
                  : "Aucune vidéo"}
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <p>
            <span className="text-white/50">Offre :</span>{" "}
            {OFFER_TYPE_LABELS[property.offer_type]}
            {property.surface ? ` · ${property.surface} m²` : ""}
            {property.rooms ? ` · ${property.rooms} pièces` : ""}
          </p>
          {property.description && (
            <p className="whitespace-pre-line text-white/75">{property.description}</p>
          )}
          <p className="text-white/60">
            <span className="text-white/50">Vendeur :</span>{" "}
            {property.owner?.full_name ?? "—"}
            {property.owner?.email ? ` · ${property.owner.email}` : ""}
            {property.contact_phone ? ` · ${property.contact_phone}` : ""}
          </p>
          {property.agencies && (
            <p className="text-white/60">
              <span className="text-white/50">Agence :</span> {property.agencies.name}
            </p>
          )}
          <p className="text-white/40">
            Soumise le{" "}
            {new Date(property.created_at).toLocaleDateString("fr-FR", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
          {property.status === "rejected" && property.rejection_reason && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300">
              Motif du refus : {property.rejection_reason}
            </p>
          )}

          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.url!}
                  alt=""
                  className="h-20 w-28 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions de modération */}
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {property.status === "pending" && (
          <>
            {!videoReady && (
              <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
                La vidéo n&apos;est pas prête : publication déconseillée tant que
                l&apos;encodage n&apos;est pas terminé.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setStatus("published")}
                disabled={busy || !videoReady}
                className="flex-1 rounded-full bg-primary py-2.5 font-semibold transition hover:bg-primary-dark disabled:opacity-40"
              >
                Publier
              </button>
              <button
                onClick={() => setRejecting((r) => !r)}
                disabled={busy}
                className="flex-1 rounded-full border border-red-400/50 py-2.5 font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                Refuser
              </button>
            </div>
            {rejecting && (
              <div className="space-y-2">
                <textarea
                  className="input min-h-16"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motif du refus (communiqué au vendeur) : documents manquants, vidéo non conforme…"
                />
                <button
                  onClick={() => setStatus("rejected")}
                  disabled={busy}
                  className="w-full rounded-full bg-red-500/80 py-2.5 font-semibold transition hover:bg-red-500 disabled:opacity-40"
                >
                  Confirmer le refus
                </button>
              </div>
            )}
          </>
        )}

        {property.status === "published" && (
          <button
            onClick={() => setStatus("pending")}
            disabled={busy}
            className="w-full rounded-full border border-white/25 py-2.5 font-semibold transition hover:bg-white/10 disabled:opacity-40"
          >
            Dépublier (repasser en attente)
          </button>
        )}

        {property.status === "rejected" && (
          <button
            onClick={() => setStatus("pending")}
            disabled={busy}
            className="w-full rounded-full border border-white/25 py-2.5 font-semibold transition hover:bg-white/10 disabled:opacity-40"
          >
            Remettre en attente
          </button>
        )}
      </div>

      <VerificationEditor
        propertyId={property.id}
        adminId={adminId}
        existing={verification}
        onSaved={onChanged}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

function VideoStatusChip({ status, hasVideo }: { status: string; hasVideo: boolean }) {
  if (!hasVideo) {
    return <Chip className="bg-white/10 text-white/50">Vidéo absente</Chip>;
  }
  const styles: Record<string, string> = {
    ready: "bg-primary/20 text-primary",
    processing: "bg-amber-500/20 text-amber-300",
    uploading: "bg-amber-500/20 text-amber-300",
    failed: "bg-red-500/20 text-red-300",
  };
  const labels: Record<string, string> = {
    ready: "Vidéo prête",
    processing: "Encodage…",
    uploading: "Upload…",
    failed: "Vidéo en échec",
  };
  return (
    <Chip className={styles[status] ?? "bg-white/10 text-white/50"}>
      {labels[status] ?? status}
    </Chip>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ""}`}>
      {children}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <Link href="/" className="mb-8 text-3xl font-bold">
        <span className="text-primary">Wori</span>mo
      </Link>
      <div className="text-white/80">{children}</div>
    </main>
  );
}
