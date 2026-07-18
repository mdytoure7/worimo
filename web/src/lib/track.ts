import { getBrowserSupabase } from "./supabase-browser";

export type EventType = "property_view" | "whatsapp_click" | "call_click" | "search" | "video_watch" | "share";

interface TrackPayload {
  propertyId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tracking d'événement fire-and-forget : jamais bloquant, jamais d'erreur
 * visible utilisateur. Pas de .select() après l'insert — la policy RLS
 * n'autorise la lecture qu'aux admins, un .select() ferait échouer l'insert
 * (Postgres évalue la policy SELECT pour le RETURNING).
 */
export function trackEvent(type: EventType, payload: TrackPayload = {}): void {
  getBrowserSupabase()
    .from("events")
    .insert({
      type,
      property_id: payload.propertyId ?? null,
      query: payload.query ?? null,
      metadata: payload.metadata ?? {},
    })
    .then(
      () => {},
      () => {},
    );
}
