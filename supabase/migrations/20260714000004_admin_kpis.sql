-- =============================================================================
-- WORIMO — Dashboard super admin : tracking d'événements + KPI agrégés.
--
-- Table `events` : tracking minimal (vues, clics contact, recherches), sans
-- PII. Écriture ouverte à tous (anon inclus — c'est le point de collecte),
-- lecture réservée aux admins.
--
-- Les fonctions admin_* sont security definer + garde is_admin() explicite :
--   - PostgREST ne sait pas faire de GROUP BY/bucketing arbitraire ;
--   - video_jobs n'a AUCUNE policy RLS (lecture admin impossible sans bypass
--     explicite, comme claim_next_video_job) ;
--   - contrairement à claim_next_video_job (réservée au service_role via
--     revoke), ces fonctions sont appelées par un admin authentifié : la garde
--     est donc un check de rôle explicite, pas un revoke de grant.
-- =============================================================================

create type public.event_type as enum
  ('property_view', 'whatsapp_click', 'call_click', 'search', 'video_watch');

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  type        public.event_type not null,
  property_id uuid references public.properties (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  query       text,                              -- pour type = 'search'
  metadata    jsonb not null default '{}'::jsonb, -- ex: {"percent": 80} pour video_watch
  created_at  timestamptz not null default now()
);

create index events_type_created_idx on public.events (type, created_at desc);
create index events_property_idx on public.events (property_id, type);

alter table public.events enable row level security;

create policy "events_insert_any" on public.events
  for insert with check (true);
create policy "events_select_admin" on public.events
  for select using (public.is_admin());

-- -----------------------------------------------------------------------------
-- ACQUISITION & CROISSANCE
-- -----------------------------------------------------------------------------

create or replace function public.admin_users_summary()
returns table (
  total_users bigint, buyers bigint, sellers bigint, agencies bigint,
  admins bigint, new_7d bigint, new_30d bigint
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select
      count(*),
      count(*) filter (where role = 'buyer'),
      count(*) filter (where role = 'seller'),
      count(*) filter (where role = 'agency'),
      count(*) filter (where role = 'admin'),
      count(*) filter (where created_at >= now() - interval '7 days'),
      count(*) filter (where created_at >= now() - interval '30 days')
    from public.profiles;
end;
$$;

create or replace function public.admin_signups_by_day(days int default 30)
returns table (day date, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select d::date, count(p.id)
    from generate_series(current_date - (days - 1), current_date, interval '1 day') d
    left join public.profiles p on p.created_at::date = d::date
    group by d
    order by d;
end;
$$;

-- -----------------------------------------------------------------------------
-- MARKETPLACE & INVENTAIRE
-- -----------------------------------------------------------------------------

create or replace function public.admin_listings_summary()
returns table (
  total bigint, draft bigint, pending bigint, published bigint,
  rejected bigint, archived bigint, verified bigint,
  avg_moderation_hours numeric, rejection_rate numeric
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select
      count(*),
      count(*) filter (where p.status = 'draft'),
      count(*) filter (where p.status = 'pending'),
      count(*) filter (where p.status = 'published'),
      count(*) filter (where p.status = 'rejected'),
      count(*) filter (where p.status = 'archived'),
      (select count(*) from public.verifications v where v.status = 'verified'),
      (
        select avg(extract(epoch from p2.published_at - p2.created_at) / 3600.0)
        from public.properties p2
        where p2.status = 'published' and p2.published_at is not null
      ),
      (
        select case when count(*) filter (where p3.status in ('published', 'rejected')) = 0 then 0
          else count(*) filter (where p3.status = 'rejected')::numeric
               / count(*) filter (where p3.status in ('published', 'rejected'))
        end
        from public.properties p3
      )
    from public.properties p;
end;
$$;

create or replace function public.admin_listings_by_day(days int default 30)
returns table (day date, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select d::date, count(p.id)
    from generate_series(current_date - (days - 1), current_date, interval '1 day') d
    left join public.properties p on p.created_at::date = d::date
    group by d
    order by d;
end;
$$;

create or replace function public.admin_listings_by_type()
returns table (type public.property_type, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select p.type, count(*) from public.properties p group by p.type order by count(*) desc;
end;
$$;

create or replace function public.admin_listings_by_city(limit_count int default 8)
returns table (city text, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select p.city, count(*) from public.properties p
    group by p.city order by count(*) desc limit limit_count;
end;
$$;

create or replace function public.admin_listings_by_price_bucket()
returns table (bucket text, sort_order int, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select
      case
        when p.price < 5000000 then '< 5M'
        when p.price < 15000000 then '5-15M'
        when p.price < 30000000 then '15-30M'
        when p.price < 60000000 then '30-60M'
        else '60M+'
      end,
      case
        when p.price < 5000000 then 1
        when p.price < 15000000 then 2
        when p.price < 30000000 then 3
        when p.price < 60000000 then 4
        else 5
      end,
      count(*)
    from public.properties p
    group by 1, 2
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- ENGAGEMENT & USAGE
-- -----------------------------------------------------------------------------

create or replace function public.admin_engagement_summary(days int default 30)
returns table (
  views bigint, whatsapp_clicks bigint, call_clicks bigint, searches bigint,
  favorites_added bigint, active_users_7d bigint, active_users_30d bigint,
  avg_watch_percent numeric
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select
      (select count(*) from public.events e where e.type = 'property_view' and e.created_at >= now() - (days || ' days')::interval),
      (select count(*) from public.events e where e.type = 'whatsapp_click' and e.created_at >= now() - (days || ' days')::interval),
      (select count(*) from public.events e where e.type = 'call_click' and e.created_at >= now() - (days || ' days')::interval),
      (select count(*) from public.events e where e.type = 'search' and e.created_at >= now() - (days || ' days')::interval),
      (select count(*) from public.favorites f where f.created_at >= now() - (days || ' days')::interval),
      (select count(distinct e.user_id) from public.events e where e.user_id is not null and e.created_at >= now() - interval '7 days'),
      (select count(distinct e.user_id) from public.events e where e.user_id is not null and e.created_at >= now() - interval '30 days'),
      (select avg((e.metadata->>'percent')::numeric) from public.events e where e.type = 'video_watch' and e.created_at >= now() - (days || ' days')::interval);
end;
$$;

create or replace function public.admin_views_by_day(days int default 30)
returns table (day date, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select d::date, count(e.id)
    from generate_series(current_date - (days - 1), current_date, interval '1 day') d
    left join public.events e on e.created_at::date = d::date and e.type = 'property_view'
    group by d
    order by d;
end;
$$;

create or replace function public.admin_top_searches(limit_count int default 10)
returns table (query text, count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select lower(trim(e.query)), count(*)
    from public.events e
    where e.type = 'search' and e.query is not null and trim(e.query) <> ''
    group by lower(trim(e.query))
    order by count(*) desc
    limit limit_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- PIPELINE VIDÉO & INFRA
-- -----------------------------------------------------------------------------

create or replace function public.admin_video_pipeline_summary()
returns table (
  jobs_queued bigint, jobs_processing bigint, jobs_failed bigint,
  jobs_completed_24h bigint, avg_encode_seconds numeric,
  media_ready bigint, media_processing bigint, media_failed bigint
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin uniquement'; end if;
  return query
    select
      (select count(*) from public.video_jobs j where j.status = 'queued'),
      (select count(*) from public.video_jobs j where j.status = 'processing'),
      (select count(*) from public.video_jobs j where j.status = 'failed'),
      (select count(*) from public.video_jobs j where j.status = 'completed' and j.updated_at >= now() - interval '24 hours'),
      (
        select avg(extract(epoch from j2.updated_at - j2.created_at))
        from public.video_jobs j2
        where j2.status = 'completed' and j2.updated_at >= now() - interval '7 days'
      ),
      (select count(*) from public.property_media m where m.kind = 'video' and m.status = 'ready'),
      (select count(*) from public.property_media m where m.kind = 'video' and m.status in ('uploading', 'processing')),
      (select count(*) from public.property_media m where m.kind = 'video' and m.status = 'failed');
end;
$$;
