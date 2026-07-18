"use client";

// Mes favoris — page personnelle (client) : la RLS ne renvoie que les
// favoris de l'utilisateur connecté. Une annonce dépubliée depuis sa mise
// en favori n'est plus renvoyée par la RLS : on l'écarte silencieusement.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { PROPERTY_SELECT, type Property } from "@/lib/types";
import PropertyCard from "@/components/PropertyCard";
import BottomNav from "@/components/BottomNav";

type State =
  | { name: "loading" }
  | { name: "anonymous" }
  | { name: "ready"; properties: Property[] };

export default function FavoritesPage() {
  const [state, setState] = useState<State>({ name: "loading" });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return setState({ name: "anonymous" });

      const { data, error } = await supabase
        .from("favorites")
        .select(`created_at, properties ( ${PROPERTY_SELECT} )`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erreur de chargement des favoris :", error.message);
        return setState({ name: "ready", properties: [] });
      }
      const properties = (data ?? [])
        .map((row) => row.properties as unknown as Property | null)
        .filter((p): p is Property => p !== null);
      setState({ name: "ready", properties });
    });
  }, []);

  return (
    <main className="min-h-dvh bg-night pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
          <span className="ml-2 text-sm font-normal text-white/60">· Mes favoris</span>
        </Link>
      </header>

      <div className="mx-auto max-w-5xl p-4">
        {state.name === "loading" && (
          <p className="py-16 text-center text-white/50">Chargement…</p>
        )}

        {state.name === "anonymous" && (
          <div className="py-16 text-center">
            <p className="mb-4 text-white/80">
              Connectez-vous pour retrouver vos annonces favorites.
            </p>
            <Link href="/connexion?next=/favoris" className="cta">
              Se connecter
            </Link>
          </div>
        )}

        {state.name === "ready" && state.properties.length === 0 && (
          <div className="py-16 text-center text-white/60">
            <p className="mb-2 text-3xl">♡</p>
            <p className="mb-4">
              Aucun favori pour l&apos;instant. Touchez le cœur sur une annonce
              pour la retrouver ici.
            </p>
            <Link href="/" className="cta">Découvrir le feed</Link>
          </div>
        )}

        {state.name === "ready" && state.properties.length > 0 && (
          <>
            <p className="mb-4 text-sm text-white/60">
              {state.properties.length} annonce{state.properties.length > 1 ? "s" : ""} en favori
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.properties.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
