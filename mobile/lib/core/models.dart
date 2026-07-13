// Modèles de données Worimo — miroir Dart du schéma PostgREST
// (cf. web/src/lib/types.ts). Tout est nullable côté colonnes optionnelles.

enum PropertyType { apartment, house, land, commercial, office }

enum OfferType { sale, rent }

const propertyTypeLabels = <PropertyType, String>{
  PropertyType.apartment: 'Appartement',
  PropertyType.house: 'Maison',
  PropertyType.land: 'Terrain',
  PropertyType.commercial: 'Local commercial',
  PropertyType.office: 'Bureau',
};

const offerTypeLabels = <OfferType, String>{
  OfferType.sale: 'À vendre',
  OfferType.rent: 'À louer',
};

PropertyType propertyTypeFromString(String? value) => PropertyType.values.firstWhere(
      (t) => t.name == value,
      orElse: () => PropertyType.apartment,
    );

OfferType offerTypeFromString(String? value) =>
    value == 'rent' ? OfferType.rent : OfferType.sale;

class PropertyMedia {
  PropertyMedia({
    required this.id,
    required this.kind,
    required this.status,
    required this.displayOrder,
    this.url,
    this.manifestUrl,
    this.thumbnailUrl,
    this.durationSeconds,
  });

  final String id;
  final String kind; // 'image' | 'video'
  final String status;
  final int displayOrder;
  final String? url;
  final String? manifestUrl;
  final String? thumbnailUrl;
  final int? durationSeconds;

  bool get isReadyVideo => kind == 'video' && status == 'ready' && manifestUrl != null;

  factory PropertyMedia.fromJson(Map<String, dynamic> json) => PropertyMedia(
        id: json['id'] as String,
        kind: json['kind'] as String,
        status: json['status'] as String? ?? 'ready',
        displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
        url: json['url'] as String?,
        manifestUrl: json['manifest_url'] as String?,
        thumbnailUrl: json['thumbnail_url'] as String?,
        durationSeconds: (json['duration_seconds'] as num?)?.toInt(),
      );
}

class VerificationDocument {
  VerificationDocument({required this.docType, required this.label, required this.checked});

  final String docType;
  final String label;
  final bool checked;

  factory VerificationDocument.fromJson(Map<String, dynamic> json) => VerificationDocument(
        docType: json['doc_type'] as String? ?? '',
        label: json['label'] as String? ?? '',
        checked: json['checked'] as bool? ?? false,
      );
}

class Verification {
  Verification({
    required this.id,
    required this.status,
    required this.documents,
    this.level,
    this.reportNumber,
    this.summary,
    this.verifiedAt,
  });

  final String id;
  final String status; // pending | in_review | verified | rejected
  final List<VerificationDocument> documents;
  final String? level;
  final String? reportNumber;
  final String? summary;
  final DateTime? verifiedAt;

  bool get isVerified => status == 'verified';

  factory Verification.fromJson(Map<String, dynamic> json) => Verification(
        id: json['id'] as String,
        status: json['status'] as String? ?? 'pending',
        level: json['level'] as String?,
        reportNumber: json['report_number'] as String?,
        summary: json['summary'] as String?,
        verifiedAt: json['verified_at'] != null
            ? DateTime.tryParse(json['verified_at'] as String)
            : null,
        documents: (json['documents'] as List<dynamic>? ?? [])
            .map((d) => VerificationDocument.fromJson(d as Map<String, dynamic>))
            .toList(),
      );
}

class Agency {
  Agency({required this.id, required this.name, required this.verified, this.logoUrl});

  final String id;
  final String name;
  final bool verified;
  final String? logoUrl;

  factory Agency.fromJson(Map<String, dynamic> json) => Agency(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        verified: json['verified'] as bool? ?? false,
        logoUrl: json['logo_url'] as String?,
      );
}

class Property {
  Property({
    required this.id,
    required this.title,
    required this.type,
    required this.offerType,
    required this.price,
    required this.city,
    required this.media,
    this.description,
    this.surface,
    this.rooms,
    this.district,
    this.latitude,
    this.longitude,
    this.contactPhone,
    this.whatsappPhone,
    this.publishedAt,
    this.verification,
    this.agency,
  });

  final String id;
  final String title;
  final PropertyType type;
  final OfferType offerType;
  final num price;
  final String city;
  final List<PropertyMedia> media;
  final String? description;
  final num? surface;
  final int? rooms;
  final String? district;
  final double? latitude;
  final double? longitude;
  final String? contactPhone;
  final String? whatsappPhone;
  final DateTime? publishedAt;
  final Verification? verification;
  final Agency? agency;

  PropertyMedia? get video {
    final videos = media.where((m) => m.isReadyVideo).toList()
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    return videos.isEmpty ? null : videos.first;
  }

  List<PropertyMedia> get images => media
      .where((m) => m.kind == 'image' && m.url != null)
      .toList()
    ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));

  String? get coverUrl => images.isNotEmpty ? images.first.url : video?.thumbnailUrl;

  factory Property.fromJson(Map<String, dynamic> json) {
    // verifications : PostgREST renvoie un objet (contrainte unique) ou parfois
    // une liste ; on tolère les deux.
    Verification? verification;
    final rawVerif = json['verifications'];
    if (rawVerif is Map<String, dynamic>) {
      verification = Verification.fromJson(rawVerif);
    } else if (rawVerif is List && rawVerif.isNotEmpty) {
      verification = Verification.fromJson(rawVerif.first as Map<String, dynamic>);
    }

    final rawAgency = json['agencies'];

    return Property(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      type: propertyTypeFromString(json['type'] as String?),
      offerType: offerTypeFromString(json['offer_type'] as String?),
      price: (json['price'] as num?) ?? 0,
      city: json['city'] as String? ?? '',
      description: json['description'] as String?,
      surface: json['surface'] as num?,
      rooms: (json['rooms'] as num?)?.toInt(),
      district: json['district'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      contactPhone: json['contact_phone'] as String?,
      whatsappPhone: json['whatsapp_phone'] as String?,
      publishedAt: json['published_at'] != null
          ? DateTime.tryParse(json['published_at'] as String)
          : null,
      verification: verification,
      agency: rawAgency is Map<String, dynamic> ? Agency.fromJson(rawAgency) : null,
      media: (json['property_media'] as List<dynamic>? ?? [])
          .map((m) => PropertyMedia.fromJson(m as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Sélection PostgREST partagée (miroir de PROPERTY_SELECT côté web).
const propertySelect = '''
  id, title, description, type, offer_type, price, surface, rooms,
  city, district, latitude, longitude, contact_phone, whatsapp_phone, published_at,
  property_media ( id, kind, url, manifest_url, thumbnail_url, duration_seconds, status, display_order ),
  verifications ( id, level, status, report_number, summary, documents, verified_at ),
  agencies ( id, name, logo_url, verified )
''';
