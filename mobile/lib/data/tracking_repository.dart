import '../core/supabase_service.dart';

/// Tracking d'événement fire-and-forget (vues, clics contact, recherches).
/// Alimente le dashboard super admin (web). Jamais bloquant : les erreurs
/// réseau sont silencieusement ignorées.
class TrackingRepository {
  final _db = SupabaseService.client;

  void logEvent(String type, {String? propertyId, String? query, Map<String, dynamic>? metadata}) {
    _db.from('events').insert({
      'type': type,
      if (propertyId != null) 'property_id': propertyId,
      if (query != null) 'query': query,
      'metadata': metadata ?? {},
    }).catchError((_) {});
  }
}
