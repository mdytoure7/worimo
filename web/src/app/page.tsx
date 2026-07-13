import Link from "next/link";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { PROPERTY_SELECT, type Property } from "@/lib/types";
import VideoFeed from "@/components/VideoFeed";

// Le feed doit refléter les dernières publications : pas de cache statique.
export const revalidate = 0;

async function fetchFeed(): Promise<Property[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("Erreur de chargement du feed :", error.message);
    return [];
  }
  return (data ?? []) as unknown as Property[];
}

export default async function HomePage() {
  if (!supabaseConfigured) {
    return (
      <CenteredMessage
        title="Configuration requise"
        text="Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans web/.env.local (voir README), puis relancez le serveur."
      />
    );
  }

  const properties = await fetchFeed();

  if (properties.length === 0) {
    return (
      <CenteredMessage
        title="Aucune annonce publiée"
        text="Lancez `supabase db reset` pour charger les données de démonstration, ou publiez une annonce depuis Studio."
      />
    );
  }

  return (
    <main className="relative">
      {/* En-tête flottant par-dessus le feed */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <Link href="/" className="pointer-events-auto text-xl font-bold">
          <span className="text-primary">Wori</span>mo
        </Link>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="hidden rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 backdrop-blur sm:inline">
            Trouvez. Vérifiez. Achetez en confiance.
          </span>
          <Link
            href="/recherche"
            aria-label="Rechercher"
            className="rounded-full bg-black/40 p-2 backdrop-blur transition hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <Link
            href="/favoris"
            aria-label="Mes favoris"
            className="rounded-full bg-black/40 p-2 backdrop-blur transition hover:bg-white/20"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
          </Link>
          <Link
            href="/profil"
            aria-label="Mon profil"
            className="rounded-full bg-black/40 p-2 backdrop-blur transition hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <Link
            href="/publier"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold transition hover:bg-primary-dark"
          >
            + Publier
          </Link>
        </div>
      </header>
      <VideoFeed properties={properties} />
    </main>
  );
}

function CenteredMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold">
        <span className="text-primary">Wori</span>mo
      </h1>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-white/70">{text}</p>
    </main>
  );
}
