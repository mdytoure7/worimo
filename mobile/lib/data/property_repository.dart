import '../core/models.dart';
import '../core/supabase_service.dart';

/// Filtres de recherche (miroir des paramètres de /recherche côté web).
class PropertyFilters {
  const PropertyFilters({
    this.city,
    this.type,
    this.offerType,
    this.priceMin,
    this.priceMax,
    this.surfaceMin,
    this.surfaceMax,
    this.verifiedOnly = false,
    this.sort = PropertySort.recent,
  });

  final String? city;
  final PropertyType? type;
  final OfferType? offerType;
  final num? priceMin;
  final num? priceMax;
  final num? surfaceMin;
  final num? surfaceMax;
  final bool verifiedOnly;
  final PropertySort sort;

  PropertyFilters copyWith({
    String? city,
    PropertyType? type,
    OfferType? offerType,
    num? priceMin,
    num? priceMax,
    num? surfaceMin,
    num? surfaceMax,
    bool? verifiedOnly,
    PropertySort? sort,
    bool clearType = false,
    bool clearOffer = false,
  }) {
    return PropertyFilters(
      city: city ?? this.city,
      type: clearType ? null : (type ?? this.type),
      offerType: clearOffer ? null : (offerType ?? this.offerType),
      priceMin: priceMin ?? this.priceMin,
      priceMax: priceMax ?? this.priceMax,
      surfaceMin: surfaceMin ?? this.surfaceMin,
      surfaceMax: surfaceMax ?? this.surfaceMax,
      verifiedOnly: verifiedOnly ?? this.verifiedOnly,
      sort: sort ?? this.sort,
    );
  }
}

enum PropertySort { recent, priceAsc, priceDesc }

class PropertyRepository {
  final _db = SupabaseService.client;

  /// Feed : annonces publiées avec vidéo prête, plus récentes d'abord.
  Future<List<Property>> fetchFeed({int limit = 20, int offset = 0}) async {
    final rows = await _db
        .from('properties')
        .select(propertySelect)
        .eq('status', 'published')
        .order('published_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (rows as List)
        .map((r) => Property.fromJson(r as Map<String, dynamic>))
        .where((p) => p.video != null) // le feed est vidéo-first
        .toList();
  }

  Future<Property?> fetchById(String id) async {
    final row = await _db
        .from('properties')
        .select(propertySelect)
        .eq('id', id)
        .maybeSingle();
    return row == null ? null : Property.fromJson(row);
  }

  /// Recherche filtrée (RLS : ne renvoie que le publié quoi qu'il arrive).
  Future<List<Property>> search(
    PropertyFilters filters, {
    int limit = 24,
    int offset = 0,
  }) async {
    // Le filtre "vérifié" impose une jointure interne sur verifications.
    final select = filters.verifiedOnly
        ? propertySelect.replaceFirst('verifications (', 'verifications!inner (')
        : propertySelect;

    var query = _db.from('properties').select(select).eq('status', 'published');

    if (filters.verifiedOnly) {
      query = query.eq('verifications.status', 'verified');
    }
    if (filters.city != null && filters.city!.trim().isNotEmpty) {
      query = query.ilike('city', '%${filters.city!.trim()}%');
    }
    if (filters.type != null) query = query.eq('type', filters.type!.name);
    if (filters.offerType != null) {
      query = query.eq('offer_type', filters.offerType!.name);
    }
    if (filters.priceMin != null) query = query.gte('price', filters.priceMin!);
    if (filters.priceMax != null) query = query.lte('price', filters.priceMax!);
    if (filters.surfaceMin != null) query = query.gte('surface', filters.surfaceMin!);
    if (filters.surfaceMax != null) query = query.lte('surface', filters.surfaceMax!);

    final ordered = switch (filters.sort) {
      PropertySort.priceAsc => query.order('price', ascending: true),
      PropertySort.priceDesc => query.order('price', ascending: false),
      PropertySort.recent => query.order('published_at', ascending: false),
    };

    final rows = await ordered.range(offset, offset + limit - 1);
    return (rows as List)
        .map((r) => Property.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  /// Annonces de l'utilisateur connecté (tous statuts — RLS : les siennes).
  Future<List<Map<String, dynamic>>> fetchMine() async {
    final rows = await _db
        .from('properties')
        .select(
          'id, title, city, price, offer_type, status, rejection_reason, created_at, '
          'property_media ( kind, url, thumbnail_url, status, display_order )',
        )
        .order('created_at', ascending: false);
    return (rows as List).cast<Map<String, dynamic>>();
  }
}
