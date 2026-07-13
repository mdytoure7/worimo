import '../core/models.dart';
import '../core/supabase_service.dart';

/// Favoris — RLS : chacun ne voit et ne modifie que les siens.
class FavoritesRepository {
  final _db = SupabaseService.client;

  /// Ids des annonces en favori (vide si non connecté).
  Future<Set<String>> loadIds() async {
    if (!SupabaseService.isLoggedIn) return {};
    final rows = await _db.from('favorites').select('property_id');
    return (rows as List).map((r) => r['property_id'] as String).toSet();
  }

  Future<List<Property>> loadProperties() async {
    if (!SupabaseService.isLoggedIn) return [];
    final rows = await _db
        .from('favorites')
        .select('created_at, properties ( $propertySelect )')
        .order('created_at', ascending: false);

    return (rows as List)
        .map((r) => r['properties'])
        .whereType<Map<String, dynamic>>()
        .map((p) => Property.fromJson(p))
        .toList();
  }

  Future<void> add(String propertyId) async {
    final userId = SupabaseService.user!.id;
    await _db.from('favorites').insert({'user_id': userId, 'property_id': propertyId});
  }

  Future<void> remove(String propertyId) async {
    final userId = SupabaseService.user!.id;
    await _db
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('property_id', propertyId);
  }
}
