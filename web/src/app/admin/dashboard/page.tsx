"use client";

// =============================================================================
// Dashboard super admin — KPI marketplace (acquisition, inventaire,
// engagement, pipeline vidéo). Lecture seule : toute la logique de calcul
// vit dans des fonctions SQL (admin_*), security definer + garde is_admin()
// explicite (video_jobs n'a aucune policy RLS, la lecture admin doit
// bypasser — voir supabase/migrations/20260714000004_admin_kpis.sql).
//
// Rafraîchissement : à l'ouverture + bouton manuel + toggle auto (30 s).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { PROPERTY_TYPE_LABELS } from "@/lib/types";
import { HBarChart, LineChart, StatTile } from "@/components/admin/charts";

type AuthState = { name: "loading" } | { name: "denied" } | { name: "ready" };

interface UsersSummary {
  total_users: number; buyers: number; sellers: number; agencies: number;
  admins: number; new_7d: number; new_30d: number;
}
interface ListingsSummary {
  total: number; draft: number; pending: number; published: number;
  rejected: number; archived: number; verified: number;
  avg_moderation_hours: number | null; rejection_rate: number | null;
}
interface EngagementSummary {
  views: number; whatsapp_clicks: number; call_clicks: number; searches: number;
  favorites_added: number; active_users_7d: number; active_users_30d: number;
  avg_watch_percent: number | null;
}
interface PipelineSummary {
  jobs_queued: number; jobs_processing: number; jobs_failed: number;
  jobs_completed_24h: number; avg_encode_seconds: number | null;
  media_ready: number; media_processing: number; media_failed: number;
}
interface DayCount { day: string; count: number }
interface NamedCount { count: number; [key: string]: string | number }

interface Dashboard {
  users: UsersSummary;
  signupsByDay: DayCount[];
  listings: ListingsSummary;
  listingsByDay: DayCount[];
  listingsByType: NamedCount[];
  listingsByCity: NamedCount[];
  listingsByPriceBucket: NamedCount[];
  engagement: EngagementSummary;
  viewsByDay: DayCount[];
  topSearches: NamedCount[];
  pipeline: PipelineSummary;
}

const REFRESH_MS = 30_000;

export default function AdminDashboardPage() {
  const [auth, setAuth] = useState<AuthState>({ name: "loading" });
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return setAuth({ name: "denied" });
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role !== "admin") return setAuth({ name: "denied" });
      setAuth({ name: "ready" });
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getBrowserSupabase();
    try {
      const [
        users, signupsByDay, listings, listingsByDay, listingsByType,
        listingsByCity, listingsByPriceBucket, engagement, viewsByDay,
        topSearches, pipeline,
      ] = await Promise.all([
        supabase.rpc("admin_users_summary").single(),
        supabase.rpc("admin_signups_by_day", { days: 30 }),
        supabase.rpc("admin_listings_summary").single(),
        supabase.rpc("admin_listings_by_day", { days: 30 }),
        supabase.rpc("admin_listings_by_type"),
        supabase.rpc("admin_listings_by_city", { limit_count: 8 }),
        supabase.rpc("admin_listings_by_price_bucket"),
        supabase.rpc("admin_engagement_summary", { days: 30 }).single(),
        supabase.rpc("admin_views_by_day", { days: 30 }),
        supabase.rpc("admin_top_searches", { limit_count: 10 }),
        supabase.rpc("admin_video_pipeline_summary").single(),
      ]);

      const firstError = [
        users, signupsByDay, listings, listingsByDay, listingsByType,
        listingsByCity, listingsByPriceBucket, engagement, viewsByDay,
        topSearches, pipeline,
      ].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setData({
        users: users.data as UsersSummary,
        signupsByDay: (signupsByDay.data ?? []) as DayCount[],
        listings: listings.data as ListingsSummary,
        listingsByDay: (listingsByDay.data ?? []) as DayCount[],
        listingsByType: (listingsByType.data ?? []) as NamedCount[],
        listingsByCity: (listingsByCity.data ?? []) as NamedCount[],
        listingsByPriceBucket: (listingsByPriceBucket.data ?? []) as NamedCount[],
        engagement: engagement.data as EngagementSummary,
        viewsByDay: (viewsByDay.data ?? []) as DayCount[],
        topSearches: (topSearches.data ?? []) as NamedCount[],
        pipeline: pipeline.data as PipelineSummary,
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.name === "ready") fetchAll();
  }, [auth.name, fetchAll]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoRefresh && auth.name === "ready") {
      intervalRef.current = setInterval(fetchAll, REFRESH_MS);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [autoRefresh, auth.name, fetchAll]);

  if (auth.name === "loading") return <Centered>Chargement…</Centered>;
  if (auth.name === "denied") {
    return (
      <Centered>
        <p className="mb-4">Accès réservé aux administrateurs.</p>
        <Link href="/connexion?next=/admin/dashboard" className="cta">Se connecter</Link>
      </Centered>
    );
  }

  return (
    <main className="min-h-dvh bg-night pb-16">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-night/90 p-4 backdrop-blur">
        <Link href="/" className="text-lg font-bold">
          <span className="text-primary">Wori</span>mo
        </Link>
        <span className="text-white/60">· Dashboard</span>
        <Link href="/admin" className="ml-2 text-sm text-primary hover:underline">
          Modération →
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-white/40">
              Actualisé à {lastUpdated.toLocaleTimeString("fr-FR")}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-white/70">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            Auto (30s)
          </label>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold transition hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "…" : "Actualiser"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-10 p-4">
        {error && (
          <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">
            Erreur : {error}
          </p>
        )}

        {!data && loading && <p className="py-16 text-center text-white/50">Chargement des KPI…</p>}

        {data && (
          <>
            <Section title="Acquisition & croissance">
              <StatGrid>
                <StatTile label="Utilisateurs" value={data.users.total_users} />
                <StatTile label="Nouveaux (7 j)" value={data.users.new_7d} />
                <StatTile label="Nouveaux (30 j)" value={data.users.new_30d} />
              </StatGrid>
              <Grid2>
                <Card title="Inscriptions par jour (30 j)">
                  <LineChart data={data.signupsByDay} />
                </Card>
                <Card title="Répartition par rôle">
                  <HBarChart
                    colored
                    data={[
                      { label: "Acheteurs", value: data.users.buyers },
                      { label: "Vendeurs", value: data.users.sellers },
                      { label: "Agences", value: data.users.agencies },
                      { label: "Admins", value: data.users.admins },
                    ]}
                  />
                </Card>
              </Grid2>
            </Section>

            <Section title="Marketplace & inventaire">
              <StatGrid>
                <StatTile label="Annonces totales" value={data.listings.total} />
                <StatTile label="Publiées" value={data.listings.published} />
                <StatTile label="En attente" value={data.listings.pending} />
                <StatTile
                  label="Taux de rejet"
                  value={`${Math.round((data.listings.rejection_rate ?? 0) * 100)}%`}
                  accent={data.listings.rejection_rate && data.listings.rejection_rate > 0.3 ? "critical" : "good"}
                />
                <StatTile
                  label="Temps modération moy."
                  value={
                    data.listings.avg_moderation_hours != null
                      ? `${data.listings.avg_moderation_hours.toFixed(1)} h`
                      : "—"
                  }
                />
                <StatTile
                  label="% vérifié"
                  value={
                    data.listings.published > 0
                      ? `${Math.round((data.listings.verified / data.listings.published) * 100)}%`
                      : "—"
                  }
                />
              </StatGrid>
              <Grid2>
                <Card title="Nouvelles annonces par jour (30 j)">
                  <LineChart data={data.listingsByDay} />
                </Card>
                <Card title="Par statut">
                  <HBarChart
                    colored
                    data={[
                      { label: "Brouillon", value: data.listings.draft },
                      { label: "En attente", value: data.listings.pending },
                      { label: "Publiées", value: data.listings.published },
                      { label: "Refusées", value: data.listings.rejected },
                      { label: "Archivées", value: data.listings.archived },
                    ]}
                  />
                </Card>
                <Card title="Par type de bien">
                  <HBarChart
                    colored
                    data={data.listingsByType.map((r) => ({
                      label: PROPERTY_TYPE_LABELS[r.type as keyof typeof PROPERTY_TYPE_LABELS] ?? String(r.type),
                      value: Number(r.count),
                    }))}
                  />
                </Card>
                <Card title="Top villes">
                  <HBarChart
                    data={data.listingsByCity.map((r) => ({ label: String(r.city), value: Number(r.count) }))}
                  />
                </Card>
                <Card title="Répartition budgets (FCFA)" full>
                  <HBarChart
                    data={data.listingsByPriceBucket.map((r) => ({ label: String(r.bucket), value: Number(r.count) }))}
                  />
                </Card>
              </Grid2>
            </Section>

            <Section title="Engagement & usage">
              <StatGrid>
                <StatTile label="Vues (30 j)" value={data.engagement.views} />
                <StatTile label="Clics WhatsApp" value={data.engagement.whatsapp_clicks} />
                <StatTile label="Clics Appeler" value={data.engagement.call_clicks} />
                <StatTile label="Recherches" value={data.engagement.searches} />
                <StatTile label="Favoris ajoutés" value={data.engagement.favorites_added} />
                <StatTile label="Actifs 7 j / 30 j" value={`${data.engagement.active_users_7d} / ${data.engagement.active_users_30d}`} />
                <StatTile
                  label="Complétion vidéo moy."
                  value={data.engagement.avg_watch_percent != null ? `${Math.round(data.engagement.avg_watch_percent)}%` : "—"}
                />
              </StatGrid>
              <Grid2>
                <Card title="Vues par jour (30 j)">
                  <LineChart data={data.viewsByDay} />
                </Card>
                <Card title="Recherches les plus fréquentes">
                  <HBarChart
                    data={data.topSearches.map((r) => ({ label: String(r.query), value: Number(r.count) }))}
                  />
                </Card>
              </Grid2>
            </Section>

            <Section title="Pipeline vidéo & infra">
              <StatGrid>
                <StatTile label="En file" value={data.pipeline.jobs_queued} accent={data.pipeline.jobs_queued > 5 ? "warning" : "good"} />
                <StatTile label="En traitement" value={data.pipeline.jobs_processing} />
                <StatTile label="Échecs" value={data.pipeline.jobs_failed} accent={data.pipeline.jobs_failed > 0 ? "critical" : "good"} />
                <StatTile label="Terminés (24 h)" value={data.pipeline.jobs_completed_24h} />
                <StatTile
                  label="Temps d'encodage moy."
                  value={data.pipeline.avg_encode_seconds != null ? `${Math.round(data.pipeline.avg_encode_seconds)} s` : "—"}
                />
                <StatTile label="Vidéos prêtes" value={data.pipeline.media_ready} />
              </StatGrid>
              <p className="text-xs text-white/40">
                Stockage R2 / quotas Vercel non calculés ici — voir le{" "}
                <a
                  href="https://dash.cloudflare.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  dashboard Cloudflare
                </a>{" "}
                pour l&apos;usage réel du stockage.
              </p>
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
}

function Card({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white/5 p-4 ${full ? "lg:col-span-2" : ""}`}>
      <h3 className="mb-3 text-sm font-medium text-white/70">{title}</h3>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <Link href="/" className="mb-8 text-3xl font-bold">
        <span className="text-primary">Wori</span>mo
      </Link>
      <div className="text-white/80">{children}</div>
    </main>
  );
}
