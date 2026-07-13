import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Client pour les composants SERVEUR uniquement (pas de session).
// Côté navigateur, utiliser getBrowserSupabase() (lib/supabase-browser.ts).
// Clé anon uniquement : la RLS côté PostgreSQL est la vraie barrière.
export const supabase = supabaseConfigured ? createClient(url!, anonKey!) : null;
