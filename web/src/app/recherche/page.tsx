// =============================================================================
// Recherche d'annonces — filtres : localisation, type de bien, budget,
// surface, statut vérifié + tri et pagination.
//
// Composant serveur : les filtres vivent dans l'URL (formulaire GET, zéro JS
// requis, partageable et indexable). Le filtrage s'exécute dans PostgreSQL ;
// la RLS garantit que seul le publié sort, quels que soient les paramètres.
// =============================================================================

import Link from "next/link";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { PROPERTY_SELECT, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";
import { CITIES } from "@/lib/constants";
import PropertyCard from "@/components/PropertyCard";
import BottomNav from "@/components/BottomNav";

export const revalidate = 0;

const PAGE_SIZE = 24;

interface Filters {
  ville: string;
  type: string;
  offre: string;
  prix_min: string;
  prix_max: string;
  surface_min: string;
  surface_max: string;
  verifie: string;
  tri: string;
  page: number;
}

function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const get = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  return {
    ville: get("ville").trim(),
    type: get("type"),
    offre: get("offre"),
    prix_min: get("prix_min"),
    prix_max: get("prix_max"),
    surface_min: get("surface_min"),
    surface_max: get("surface_max"),
    verifie: get("verifie"),
    tri: get("tri"),
    page: Math.max(1, Number(get("page")) || 1),
  };
}

function positiveNumber(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function search(filters: Filters): Promise<{ properties: Property[]; count: number }> {
  if (!supabase) return { properties: [], count: 0 };

  // Filtre "vérifié" : jointure interne sur verifications (statut verified).
  const select = filters.verifie
    ? PROPERTY_SELECT.replace("verifications (", "verifications!inner (")
    : PROPERTY_SELECT;

  let query = supabase
    .from("properties")
    .select(select, { count: "exact" })
    .eq("status", "published");

  if (filters.verifie) query = query.eq("verifications.status", "verified");
  if (filters.ville) query = query.ilike("city", `%${filters.ville}%`);
  if (filters.type in PROPERTY_TYPE_LABELS) query = query.eq("type", filters.type);
  if (filters.offre === "sale" || filters.offre === "rent") {
    query = query.eq("offer_type", filters.offre);
  }

  const prixMin = positiveNumber(filters.prix_min);
  const prixMax = positiveNumber(filters.prix_max);
  const surfaceMin = positiveNumber(filters.surface_min);
  const surfaceMax = positiveNumber(filters.surface_max);
  if (prixMin) query = query.gte("price", prixMin);
  if (prixMax) query = query.lte("price", prixMax);
  if (surfaceMin) query = query.gte("surface", surfaceMin);
  if (surfaceMax) query = query.lte("surface", surfaceMax);

  if (filters.tri === "prix_croissant") query = query.order("price", { ascending: true });
  else if (filters.tri === "prix_decroissant") query = query.order("price", { ascending: false });
  else query = query.order("published_at", { ascending: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("Erreur de recherche :", error.message);
    return { properties: [], count: 0 };
  }

  // Tracking (fire-and-forget) : seulement si au moins un filtre est actif,
  // pour ne pas compter la simple ouverture de la page vide.
  const hasActiveFilter =
    filters.ville || filters.type || filters.offre || filters.prix_min ||
    filters.prix_max || filters.surface_min || filters.surface_max || filters.verifie;
  if (hasActiveFilter) {
    const summary = [
      filters.ville, filters.type, filters.offre,
      filters.prix_min && `>=${filters.prix_min}`,
      filters.prix_max && `<=${filters.prix_max}`,
      filters.verifie && "vérifié",
    ].filter(Boolean).join(" ");
    supabase.from("events").insert({ type: "search", query: summary || null }).then(
      () => {},
      () => {},
    );
  }

  return { properties: (data ?? []) as unknown as Property[], count: count ?? 0 };
}

/** Reconstruit l'URL de recherche en changeant la page (conserve les filtres). */
function pageHref(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key !== "page" && value) params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/recherche?${suffix}` : "/recherche";
}

const TYPE_EMOJI: Record<string, string> = {
  apartment: "🏢",
  house: "🏡",
  land: "🌱",
  commercial: "🏬",
  office: "🏙️",
};

/** Bande « Découvrir » : chips catégories + villes, scroll horizontal, façon TikTok. */
function DiscoverChips({ activeType, activeVille }: { activeType: string; activeVille: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => {
          const active = activeType === value;
          return (
            <Link
              key={value}
              href={`/recherche?type=${value}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                active ? "bg-primary text-white" : "bg-white/8 text-white/80 hover:bg-white/15"
              }`}
            >
              <span aria-hidden>{TYPE_EMOJI[value]}</span>
              {label}
            </Link>
          );
        })}
      </div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CITIES.map((city) => {
          const active = activeVille.toLowerCase() === city.toLowerCase();
          return (
            <Link
              key={city}
              href={`/recherche?ville=${encodeURIComponent(city)}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
                active ? "bg-white text-night" : "bg-white/8 text-white/70 hover:bg-white/15"
              }`}
            >
              {city}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const { properties, count } = supabaseConfigured
    ? await search(filters)
    : { properties: [], count: 0 };
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <main className="min-h-dvh bg-night pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
          <span className="ml-2 text-sm font-normal text-white/60">· Rechercher</span>
        </Link>
      </header>

      {/* Découvrir — accès rapide par catégorie et par ville (façon Discover TikTok) */}
      <DiscoverChips activeType={filters.type} activeVille={filters.ville} />

      <div className="mx-auto max-w-5xl p-4">
        {/* Formulaire GET : les filtres vivent dans l'URL */}
        <form
          method="get"
          action="/recherche"
          className="mb-6 grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-xs text-white/60">Localisation</span>
            <input
              className="input"
              name="ville"
              defaultValue={filters.ville}
              list="villes"
              placeholder="Dakar, Saly…"
            />
            <datalist id="villes">
              {CITIES.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Type de bien</span>
            <select className="input" name="type" defaultValue={filters.type}>
              <option value="">Tous</option>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Offre</span>
            <select className="input" name="offre" defaultValue={filters.offre}>
              <option value="">Vente et location</option>
              <option value="sale">Vente</option>
              <option value="rent">Location</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Budget min (FCFA)</span>
            <input
              className="input"
              name="prix_min"
              type="number"
              min={0}
              defaultValue={filters.prix_min}
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Budget max (FCFA)</span>
            <input
              className="input"
              name="prix_max"
              type="number"
              min={0}
              defaultValue={filters.prix_max}
              placeholder="100 000 000"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Surface min (m²)</span>
            <input
              className="input"
              name="surface_min"
              type="number"
              min={0}
              defaultValue={filters.surface_min}
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Surface max (m²)</span>
            <input
              className="input"
              name="surface_max"
              type="number"
              min={0}
              defaultValue={filters.surface_max}
              placeholder="1000"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Tri</span>
            <select className="input" name="tri" defaultValue={filters.tri}>
              <option value="">Plus récentes</option>
              <option value="prix_croissant">Prix croissant</option>
              <option value="prix_decroissant">Prix décroissant</option>
            </select>
          </label>

          <label className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <input
              type="checkbox"
              name="verifie"
              value="1"
              defaultChecked={Boolean(filters.verifie)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm font-medium">Vérifié Worimo uniquement</span>
          </label>

          <div className="col-span-2 flex items-end sm:col-span-1">
            <button
              type="submit"
              className="w-full rounded-full bg-primary py-2.5 font-semibold transition hover:bg-primary-dark"
            >
              Rechercher
            </button>
          </div>
        </form>

        {/* Résultats */}
        <p className="mb-4 text-sm text-white/60">
          {count} annonce{count > 1 ? "s" : ""} trouvée{count > 1 ? "s" : ""}
        </p>

        {properties.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-10 text-center text-white/60">
            Aucune annonce ne correspond à ces critères.
            <br />
            <Link href="/recherche" className="mt-2 inline-block text-primary hover:underline">
              Réinitialiser les filtres
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-4 text-sm">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)} className="rounded-full border border-white/25 px-4 py-2 transition hover:bg-white/10">
                ← Précédent
              </Link>
            ) : (
              <span className="rounded-full border border-white/10 px-4 py-2 text-white/30">← Précédent</span>
            )}
            <span className="text-white/60">
              Page {filters.page} / {totalPages}
            </span>
            {filters.page < totalPages ? (
              <Link href={pageHref(filters, filters.page + 1)} className="rounded-full border border-white/25 px-4 py-2 transition hover:bg-white/10">
                Suivant →
              </Link>
            ) : (
              <span className="rounded-full border border-white/10 px-4 py-2 text-white/30">Suivant →</span>
            )}
          </nav>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
