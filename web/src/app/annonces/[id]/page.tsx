import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PROPERTY_SELECT,
  formatPrice,
  getImages,
  getVerification,
  whatsappLink,
  OFFER_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
} from "@/lib/types";
import VerifiedBadge from "@/components/VerifiedBadge";
import FavoriteButton from "@/components/FavoriteButton";
import TrackedLink from "@/components/TrackedLink";

export const revalidate = 0;

async function fetchProperty(id: string): Promise<Property | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  const property = (data as unknown as Property) ?? null;
  if (property) {
    // Fire-and-forget : jamais bloquant pour le rendu de la page.
    supabase.from("events").insert({ type: "property_view", property_id: property.id }).then(
      () => {},
      () => {},
    );
  }
  return property;
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await fetchProperty(id);
  if (!property) notFound();

  const images = getImages(property);
  const verification = getVerification(property);
  const mapsUrl =
    property.latitude != null && property.longitude != null
      ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
      : null;

  return (
    <main className="min-h-dvh bg-night pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-night/90 p-4 backdrop-blur">
        <Link
          href="/"
          aria-label="Retour au feed"
          className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path
              fillRule="evenodd"
              d="M11.03 3.97a.75.75 0 0 1 0 1.06l-6.22 6.22H21a.75.75 0 0 1 0 1.5H4.81l6.22 6.22a.75.75 0 1 1-1.06 1.06l-7.5-7.5a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
        <span className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
        </span>
      </header>

      {/* Galerie photos */}
      {images.length > 0 && (
        <div className="feed-scroll flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={image.url!}
              alt={property.title}
              className="h-64 w-[85%] shrink-0 snap-center rounded-2xl object-cover sm:h-80 sm:w-[420px]"
            />
          ))}
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <VerifiedBadge verification={verification} size="lg" />
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">
              {OFFER_TYPE_LABELS[property.offer_type]} · {PROPERTY_TYPE_LABELS[property.type]}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{property.title}</h1>
          <p className="mt-1 text-white/70">
            {property.district ? `${property.district}, ` : ""}
            {property.city}
            {mapsUrl && (
              <>
                {" · "}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Voir sur la carte
                </a>
              </>
            )}
          </p>
          <p className="mt-3 text-3xl font-bold text-primary">
            {formatPrice(property.price, property.offer_type)}
          </p>
        </div>

        {/* Caractéristiques */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {property.surface && <Stat label="Surface" value={`${property.surface} m²`} />}
          {property.rooms && <Stat label="Pièces" value={String(property.rooms)} />}
          <Stat label="Ville" value={property.city} />
        </div>

        {property.description && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Description</h2>
            <p className="whitespace-pre-line leading-relaxed text-white/80">
              {property.description}
            </p>
          </section>
        )}

        {/* Rapport de vérification — la preuve, pas juste le badge */}
        {verification?.status === "verified" && (
          <section className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Rapport de vérification</h2>
              {verification.report_number && (
                <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">
                  {verification.report_number}
                </span>
              )}
            </div>
            {verification.summary && (
              <p className="mb-4 text-sm leading-relaxed text-white/80">
                {verification.summary}
              </p>
            )}
            <ul className="space-y-2">
              {verification.documents.map((doc) => (
                <li key={doc.doc_type} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      doc.checked ? "bg-primary text-white" : "bg-white/15 text-white/60"
                    }`}
                  >
                    {doc.checked ? "✓" : "–"}
                  </span>
                  <span className="text-white/85">{doc.label}</span>
                </li>
              ))}
            </ul>
            {verification.verified_at && (
              <p className="mt-4 text-xs text-white/50">
                Vérifié le{" "}
                {new Date(verification.verified_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </section>
        )}

        {property.agencies && (
          <section className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
            {property.agencies.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={property.agencies.logo_url}
                alt={property.agencies.name}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                {property.agencies.name.charAt(0)}
              </span>
            )}
            <div>
              <p className="font-semibold">{property.agencies.name}</p>
              <p className="text-xs text-white/60">
                {property.agencies.verified ? "Agence certifiée" : "Agence"}
              </p>
            </div>
          </section>
        )}
      </div>

      {/* Barre de contact fixe */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-night/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <FavoriteButton
            propertyId={property.id}
            className="rounded-full border border-white/25 p-3 transition hover:bg-white/10"
          />
          {property.whatsapp_phone && (
            <TrackedLink
              href={whatsappLink(property.whatsapp_phone, property.title)}
              propertyId={property.id}
              eventType="whatsapp_click"
              external
              className="flex-1 rounded-full bg-primary py-3 text-center font-semibold transition hover:bg-primary-dark"
            >
              WhatsApp
            </TrackedLink>
          )}
          {property.contact_phone && (
            <TrackedLink
              href={`tel:${property.contact_phone}`}
              propertyId={property.id}
              eventType="call_click"
              className="flex-1 rounded-full border border-white/25 py-3 text-center font-semibold transition hover:bg-white/10"
            >
              Appeler
            </TrackedLink>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
