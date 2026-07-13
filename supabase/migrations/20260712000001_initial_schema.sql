-- =============================================================================
-- WORIMO — Schéma initial V1
-- Marketplace immobilière Sénégal : feed vidéo + vérification foncière.
--
-- Principes de sécurité appliqués ici (et non côté frontend) :
--   * RLS activée sur toutes les tables.
--   * Publication/rejet d'une annonce : admin uniquement (trigger).
--   * Changement de rôle utilisateur : admin uniquement (trigger).
--   * File d'encodage vidéo (video_jobs) : invisible aux clients,
--     accessible uniquement via service_role (worker + Edge Functions).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('buyer', 'seller', 'agency', 'admin');
-- Le rôle "Visiteur" = utilisateur non connecté (anon), pas besoin de valeur.

create type public.property_type as enum ('apartment', 'house', 'land', 'commercial', 'office');
create type public.offer_type as enum ('sale', 'rent');

-- Cycle de vie d'une annonce : draft -> pending -> published | rejected -> archived
create type public.property_status as enum ('draft', 'pending', 'published', 'rejected', 'archived');

create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('uploading', 'processing', 'ready', 'failed');

-- Niveaux de vérification foncière (terminologie sénégalaise)
create type public.verification_level as enum ('titre_foncier', 'bail', 'nicad', 'deliberation');
create type public.verification_status as enum ('pending', 'in_review', 'verified', 'rejected');

create type public.video_job_status as enum ('awaiting_upload', 'queued', 'processing', 'completed', 'failed');

-- -----------------------------------------------------------------------------
-- TABLES
-- -----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text unique,
  email       text,
  role        public.user_role not null default 'buyer',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  logo_url    text,
  description text,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.properties (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  agency_id      uuid references public.agencies (id) on delete set null,
  title          text not null check (char_length(title) between 5 and 120),
  description    text,
  type           public.property_type not null,
  offer_type     public.offer_type not null default 'sale',
  price          bigint not null check (price > 0),           -- FCFA
  surface        numeric(10, 2) check (surface > 0),          -- m²
  rooms          int check (rooms > 0),
  city           text not null,
  district       text,
  latitude       double precision check (latitude between -90 and 90),
  longitude      double precision check (longitude between -180 and 180),
  contact_phone  text,                                        -- affiché publiquement (bouton Appeler)
  whatsapp_phone text,                                        -- bouton WhatsApp
  status         public.property_status not null default 'draft',
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.property_media (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  kind             public.media_kind not null,
  url              text,             -- image : URL publique R2
  manifest_url     text,             -- vidéo : URL du master.m3u8 (HLS) sur R2
  thumbnail_url    text,             -- vidéo : poster jpg
  storage_prefix   text,             -- préfixe des objets R2 (pour nettoyage)
  duration_seconds numeric(6, 2),
  width            int,
  height           int,
  status           public.media_status not null default 'ready',
  display_order    int not null default 0,
  created_at       timestamptz not null default now(),
  -- Une ligne média est soit une image avec url, soit une vidéo (urls remplies
  -- par le worker une fois l'encodage terminé).
  check (
    (kind = 'image' and url is not null)
    or kind = 'video'
  )
);

create table public.verifications (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null unique references public.properties (id) on delete cascade,
  level         public.verification_level,
  status        public.verification_status not null default 'pending',
  report_number text unique,
  summary       text,
  -- Métadonnées publiques des contrôles effectués, PAS les documents eux-mêmes
  -- (les scans sensibles restent hors ligne / stockage privé en V1).
  -- Format : [{"doc_type": "titre_foncier", "label": "Titre foncier n° ...", "checked": true}]
  documents     jsonb not null default '[]'::jsonb,
  verified_by   uuid references public.profiles (id),
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table public.favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);

-- File d'attente d'encodage vidéo, consommée par le worker ffmpeg.
-- Aucune policy RLS : invisible pour anon/authenticated, seul service_role y accède.
create table public.video_jobs (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references public.property_media (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  staging_key text not null,        -- clé de l'objet source dans le bucket staging
  status      public.video_job_status not null default 'awaiting_upload',
  error       text,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- INDEX
-- -----------------------------------------------------------------------------
create index properties_feed_idx on public.properties (published_at desc) where status = 'published';
create index properties_owner_idx on public.properties (owner_id);
create index properties_city_idx on public.properties (city);
create index properties_search_idx on public.properties (type, offer_type, price);
create index property_media_property_idx on public.property_media (property_id, display_order);
create index favorites_property_idx on public.favorites (property_id);
create index video_jobs_queue_idx on public.video_jobs (created_at) where status = 'queued';

-- -----------------------------------------------------------------------------
-- FONCTIONS UTILITAIRES
-- -----------------------------------------------------------------------------

-- security definer pour éviter la récursion RLS sur profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_role_in(roles public.user_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any (roles)
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- TRIGGERS DE SÉCURITÉ MÉTIER
-- -----------------------------------------------------------------------------

-- Création automatique du profil à l'inscription.
-- Le rôle demandé dans les metadata est accepté SAUF admin (anti-escalade).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone,
    new.email,
    case
      when requested_role in ('buyer', 'seller', 'agency') then requested_role::public.user_role
      else 'buyer'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seul un admin peut changer un rôle.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle utilisateur';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Seul un admin (ou le backend en service_role, ou une session psql sans JWT)
-- peut publier ou rejeter une annonce. Un vendeur soumet en 'pending'.
create or replace function public.guard_property_status()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.status not in ('draft', 'pending') then
      raise exception 'Une annonce doit être créée en brouillon ou soumise en modération';
    end if;
    if tg_op = 'UPDATE'
       and new.status is distinct from old.status
       and new.status in ('published', 'rejected') then
      raise exception 'Seul un administrateur peut publier ou rejeter une annonce';
    end if;
  end if;

  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger properties_guard_status
  before insert or update on public.properties
  for each row execute function public.guard_property_status();

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- Le badge "agence vérifiée" ne peut être posé que par un admin.
create or replace function public.guard_agency_verified()
returns trigger
language plpgsql
as $$
begin
  if new.verified is distinct from old.verified
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut certifier une agence';
  end if;
  return new;
end;
$$;

create trigger agencies_guard_verified
  before update on public.agencies
  for each row execute function public.guard_agency_verified();

create trigger video_jobs_set_updated_at
  before update on public.video_jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RPC POUR LE WORKER D'ENCODAGE (service_role uniquement)
-- -----------------------------------------------------------------------------

-- Réclame atomiquement le prochain job (FOR UPDATE SKIP LOCKED :
-- plusieurs workers peuvent tourner en parallèle sans se marcher dessus).
create or replace function public.claim_next_video_job()
returns setof public.video_jobs
language sql security definer
set search_path = public
as $$
  update public.video_jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = (
    select id from public.video_jobs
    where status = 'queued'
    order by created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke execute on function public.claim_next_video_job() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.agencies       enable row level security;
alter table public.properties     enable row level security;
alter table public.property_media enable row level security;
alter table public.verifications  enable row level security;
alter table public.favorites      enable row level security;
alter table public.video_jobs     enable row level security;
-- video_jobs : aucune policy => aucun accès client. Le worker utilise service_role.

-- profiles : chacun lit/modifie le sien ; admin voit tout.
-- (email/téléphone jamais exposés publiquement — le contact public passe par
-- properties.contact_phone / whatsapp_phone, renseignés volontairement.)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- agencies : vitrine publique.
create policy "agencies_select_all" on public.agencies
  for select using (true);
create policy "agencies_insert_own" on public.agencies
  for insert with check (
    owner_id = auth.uid() and public.current_role_in(array['agency', 'admin']::public.user_role[])
  );
create policy "agencies_update_own" on public.agencies
  for update using (owner_id = auth.uid() or public.is_admin());

-- properties : le public voit le publié ; le propriétaire voit tout chez lui.
create policy "properties_select_published" on public.properties
  for select using (status = 'published' or owner_id = auth.uid() or public.is_admin());
create policy "properties_insert_seller" on public.properties
  for insert with check (
    owner_id = auth.uid()
    and public.current_role_in(array['seller', 'agency', 'admin']::public.user_role[])
  );
create policy "properties_update_own" on public.properties
  for update using (owner_id = auth.uid() or public.is_admin());
create policy "properties_delete_own" on public.properties
  for delete using (owner_id = auth.uid() or public.is_admin());

-- property_media : visible si l'annonce parente l'est.
create policy "media_select_visible" on public.property_media
  for select using (
    exists (
      select 1 from public.properties p
      where p.id = property_id
        and (p.status = 'published' or p.owner_id = auth.uid() or public.is_admin())
    )
  );
-- L'ajout de média client (images) n'est possible que hors publication :
-- toute modification repasse par la modération.
create policy "media_insert_own_unpublished" on public.property_media
  for insert with check (
    exists (
      select 1 from public.properties p
      where p.id = property_id
        and p.owner_id = auth.uid()
        and p.status in ('draft', 'pending', 'rejected')
    ) or public.is_admin()
  );
create policy "media_delete_own" on public.property_media
  for delete using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.owner_id = auth.uid()
    ) or public.is_admin()
  );

-- verifications : le rapport est public une fois vérifié (transparence Worimo) ;
-- écrit uniquement par un admin.
create policy "verifications_select_public" on public.verifications
  for select using (
    status = 'verified'
    or public.is_admin()
    or exists (
      select 1 from public.properties p
      where p.id = property_id and p.owner_id = auth.uid()
    )
  );
create policy "verifications_admin_write" on public.verifications
  for all using (public.is_admin()) with check (public.is_admin());

-- favorites : strictement personnels.
create policy "favorites_all_own" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
