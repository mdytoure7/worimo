"use client";

// =============================================================================
// Profil utilisateur (V1) :
//   - mes informations (nom, téléphone) — modifiables, rôle en lecture seule ;
//   - mon agence (comptes agence) : création / édition de la vitrine ;
//   - mes annonces : statut de modération, motif de refus, archiver/supprimer ;
//   - déconnexion.
// Tout passe par la RLS : chacun ne voit et ne modifie que ce qui est à lui.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { formatPrice, type OfferType } from "@/lib/types";

interface ProfileInfo {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: "buyer" | "seller" | "agency" | "admin";
}

interface AgencyInfo {
  id: string;
  name: string;
  description: string | null;
  verified: boolean;
}

interface MyMedia {
  kind: "image" | "video";
  url: string | null;
  thumbnail_url: string | null;
  status: string;
  display_order: number;
}

interface MyProperty {
  id: string;
  title: string;
  city: string;
  price: number;
  offer_type: OfferType;
  status: "draft" | "pending" | "published" | "rejected" | "archived";
  rejection_reason: string | null;
  created_at: string;
  property_media: MyMedia[];
}

const ROLE_LABELS: Record<ProfileInfo["role"], string> = {
  buyer: "Acheteur",
  seller: "Vendeur",
  agency: "Agence",
  admin: "Administrateur",
};

const STATUS_CHIPS: Record<MyProperty["status"], { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-white/10 text-white/60" },
  pending: { label: "En modération", className: "bg-amber-500/20 text-amber-300" },
  published: { label: "Publiée", className: "bg-primary/20 text-primary" },
  rejected: { label: "Refusée", className: "bg-red-500/20 text-red-300" },
  archived: { label: "Archivée", className: "bg-white/10 text-white/60" },
};

type State =
  | { name: "loading" }
  | { name: "anonymous" }
  | {
      name: "ready";
      profile: ProfileInfo;
      agency: AgencyInfo | null;
      properties: MyProperty[];
    };

export default function ProfilePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "loading" });

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setState({ name: "anonymous" });

    const [{ data: profile }, { data: agency }, { data: properties }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, email, role")
        .eq("id", session.user.id)
        .single(),
      supabase
        .from("agencies")
        .select("id, name, description, verified")
        .eq("owner_id", session.user.id)
        .maybeSingle(),
      supabase
        .from("properties")
        .select(`id, title, city, price, offer_type, status, rejection_reason, created_at,
                 property_media ( kind, url, thumbnail_url, status, display_order )`)
        .order("created_at", { ascending: false }),
    ]);

    if (!profile) return setState({ name: "anonymous" });
    setState({
      name: "ready",
      profile: profile as ProfileInfo,
      agency: (agency as AgencyInfo) ?? null,
      properties: (properties ?? []) as unknown as MyProperty[],
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    router.push("/");
  }

  if (state.name === "loading") {
    return <Shell><p className="text-white/60">Chargement…</p></Shell>;
  }
  if (state.name === "anonymous") {
    return (
      <Shell>
        <p className="mb-4 text-white/80">Connectez-vous pour accéder à votre profil.</p>
        <Link href="/connexion?next=/profil" className="cta">Se connecter</Link>
      </Shell>
    );
  }

  const { profile, agency, properties } = state;
  const canPublish = ["seller", "agency", "admin"].includes(profile.role);

  return (
    <main className="min-h-dvh bg-night pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
          <span className="ml-2 text-sm font-normal text-white/60">· Mon profil</span>
        </Link>
        <button
          onClick={logout}
          className="rounded-full border border-white/25 px-4 py-1.5 text-sm font-medium transition hover:bg-white/10"
        >
          Se déconnecter
        </button>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 p-4">
        <ProfileForm profile={profile} onSaved={load} />

        {profile.role === "agency" && (
          <AgencyForm ownerId={profile.id} agency={agency} onSaved={load} />
        )}

        {canPublish && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Mes annonces</h2>
              <Link
                href="/publier"
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold transition hover:bg-primary-dark"
              >
                + Publier
              </Link>
            </div>
            {properties.length === 0 ? (
              <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60">
                Aucune annonce pour l&apos;instant.
              </p>
            ) : (
              <ul className="space-y-3">
                {properties.map((property) => (
                  <MyPropertyRow key={property.id} property={property} onChanged={load} />
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/favoris" className="text-primary hover:underline">Mes favoris</Link>
          {profile.role === "admin" && (
            <Link href="/admin" className="text-primary hover:underline">Administration</Link>
          )}
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------

function ProfileForm({ profile, onSaved }: { profile: ProfileInfo; onSaved: () => void }) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const { error } = await getBrowserSupabase()
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      setMessage(
        error.code === "23505"
          ? "Erreur : ce numéro de téléphone est déjà utilisé par un autre compte."
          : `Erreur : ${error.message}`,
      );
    } else {
      setMessage("Profil mis à jour ✓");
      onSaved();
    }
  }

  return (
    <section className="rounded-2xl bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mes informations</h2>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
          {ROLE_LABELS[profile.role]}
        </span>
      </div>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Nom complet</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Téléphone</span>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 123 45 67"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Email</span>
          <input className="input opacity-60" value={profile.email ?? ""} disabled />
        </label>
        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.startsWith("Erreur")
                ? "bg-red-500/15 text-red-300"
                : "bg-primary/15 text-primary"
            }`}
          >
            {message}
          </p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-6 py-2.5 font-semibold transition hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </section>
  );
}

function AgencyForm({
  ownerId,
  agency,
  onSaved,
}: {
  ownerId: string;
  agency: AgencyInfo | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(agency?.name ?? "");
  const [description, setDescription] = useState(agency?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = getBrowserSupabase();
    const payload = { name: name.trim(), description: description.trim() || null };
    const { error } = agency
      ? await supabase.from("agencies").update(payload).eq("id", agency.id)
      : await supabase.from("agencies").insert({ ...payload, owner_id: ownerId });
    setSaving(false);
    if (error) {
      setMessage(`Erreur : ${error.message}`);
    } else {
      setMessage("Agence enregistrée ✓");
      onSaved();
    }
  }

  return (
    <section className="rounded-2xl bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mon agence</h2>
        {agency?.verified && (
          <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary">
            Agence certifiée
          </span>
        )}
      </div>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Nom de l&apos;agence</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Teranga Immo"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Présentation</span>
          <textarea
            className="input min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Votre zone d'activité, vos spécialités…"
          />
        </label>
        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.startsWith("Erreur")
                ? "bg-red-500/15 text-red-300"
                : "bg-primary/15 text-primary"
            }`}
          >
            {message}
          </p>
        )}
        <button
          onClick={save}
          disabled={saving || name.trim().length < 2}
          className="rounded-full bg-primary px-6 py-2.5 font-semibold transition hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : agency ? "Mettre à jour" : "Créer mon agence"}
        </button>
      </div>
    </section>
  );
}

function MyPropertyRow({
  property,
  onChanged,
}: {
  property: MyProperty;
  onChanged: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chip = STATUS_CHIPS[property.status];
  const media = [...property.property_media].sort((a, b) => a.display_order - b.display_order);
  const thumbnail =
    media.find((m) => m.kind === "video")?.thumbnail_url ??
    media.find((m) => m.kind === "image")?.url ??
    null;
  const videoStatus = media.find((m) => m.kind === "video")?.status;

  async function setStatus(status: "archived" | "pending") {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase()
      .from("properties")
      .update({ status })
      .eq("id", property.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase()
      .from("properties")
      .delete()
      .eq("id", property.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  }

  return (
    <li className="rounded-2xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs text-white/40">
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{property.title}</p>
          <p className="text-sm text-white/60">
            {property.city} · {formatPrice(property.price, property.offer_type)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>
              {chip.label}
            </span>
            {property.status === "pending" && videoStatus && videoStatus !== "ready" && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                {videoStatus === "failed" ? "Vidéo en échec" : "Vidéo en traitement…"}
              </span>
            )}
          </div>
        </div>
        {property.status === "published" && (
          <Link
            href={`/annonces/${property.id}`}
            className="shrink-0 rounded-full border border-white/25 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
          >
            Voir
          </Link>
        )}
      </div>

      {property.status === "rejected" && property.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Motif du refus : {property.rejection_reason}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {property.status === "published" && (
          <button
            onClick={() => setStatus("archived")}
            disabled={busy}
            className="rounded-full border border-white/25 px-3 py-1.5 font-medium transition hover:bg-white/10 disabled:opacity-40"
          >
            Archiver
          </button>
        )}
        {(property.status === "archived" || property.status === "rejected") && (
          <button
            onClick={() => setStatus("pending")}
            disabled={busy}
            className="rounded-full border border-white/25 px-3 py-1.5 font-medium transition hover:bg-white/10 disabled:opacity-40"
          >
            Soumettre à nouveau
          </button>
        )}
        {property.status !== "published" && (
          confirmingDelete ? (
            <>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-full bg-red-500/80 px-3 py-1.5 font-medium transition hover:bg-red-500 disabled:opacity-40"
              >
                Confirmer la suppression
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="rounded-full border border-white/25 px-3 py-1.5 font-medium transition hover:bg-white/10"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              className="rounded-full border border-red-400/50 px-3 py-1.5 font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Supprimer
            </button>
          )
        )}
      </div>
    </li>
  );
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
