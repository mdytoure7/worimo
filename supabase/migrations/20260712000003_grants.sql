-- =============================================================================
-- GRANTs explicites pour les rôles API (anon / authenticated / service_role).
--
-- Pourquoi : la CLI applique les migrations en tant que supabase_admin ; les
-- privilèges par défaut du projet (définis pour le rôle postgres) ne
-- s'appliquent donc pas aux objets créés ici -> "permission denied" pour l'API.
-- Modèle standard Supabase : GRANT larges + la sécurité portée par la RLS.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Les objets créés par de futures migrations hériteront des mêmes droits.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Exception : la file d'encodage appartient au worker (service_role).
-- La RLS la protège déjà (aucune policy pour les clients) ; on retire aussi
-- les GRANTs pour que même un oubli de policy ne l'expose jamais.
revoke all on table public.video_jobs from anon, authenticated;
revoke execute on function public.claim_next_video_job() from anon, authenticated;
