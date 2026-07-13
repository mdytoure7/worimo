// Store client des favoris : une seule requête pour tous les boutons cœur
// de la page, cache invalidé à chaque connexion/déconnexion.
// RLS : favorites n'est lisible/modifiable que par son propriétaire.

import { getBrowserSupabase } from "./supabase-browser";

let cache: Set<string> | null = null; // null = utilisateur non connecté
let loaded = false;
let inflight: Promise<Set<string> | null> | null = null;
let authListenerAttached = false;

function invalidate() {
  cache = null;
  loaded = false;
  inflight = null;
}

function ensureAuthListener() {
  if (authListenerAttached) return;
  authListenerAttached = true;
  getBrowserSupabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") invalidate();
  });
}

/** Ids des annonces en favori, ou null si non connecté. */
export function loadFavoriteIds(): Promise<Set<string> | null> {
  ensureAuthListener();
  if (loaded) return Promise.resolve(cache);
  if (!inflight) {
    inflight = (async () => {
      const supabase = getBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        cache = null;
        loaded = true;
        return null;
      }
      const { data } = await supabase.from("favorites").select("property_id");
      cache = new Set((data ?? []).map((row) => row.property_id as string));
      loaded = true;
      return cache;
    })();
  }
  return inflight;
}

export type ToggleResult = "added" | "removed" | "auth-required" | "error";

export async function toggleFavorite(propertyId: string): Promise<ToggleResult> {
  const ids = await loadFavoriteIds();
  if (ids === null) return "auth-required";

  const supabase = getBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "auth-required";

  if (ids.has(propertyId)) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", session.user.id)
      .eq("property_id", propertyId);
    if (error) return "error";
    ids.delete(propertyId);
    return "removed";
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: session.user.id, property_id: propertyId });
  if (error) return "error";
  ids.add(propertyId);
  return "added";
}
