import Link from "next/link";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { PROPERTY_SELECT, FEED_PAGE_SIZE, type Property } from "@/lib/types";
import VideoFeed from "@/components/VideoFeed";
import BottomNav from "@/components/BottomNav";

// Le feed doit refléter les dernières publications : pas de cache statique.
export const revalidate = 0;

async function fetchFeed(): Promise<Property[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FEED_PAGE_SIZE);
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
      {/* En-tête flottant par-dessus le feed — navigation principale en bas (BottomNav) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <Link href="/" className="pointer-events-auto text-xl font-bold">
          <span className="text-primary">Wori</span>mo
        </Link>
        <span className="hidden rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 backdrop-blur sm:inline">
          Trouvez. Vérifiez. Achetez en confiance.
        </span>
      </header>
      <VideoFeed properties={properties} />
      <BottomNav />
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
