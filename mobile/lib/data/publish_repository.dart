import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/models.dart';
import '../core/supabase_service.dart';

/// Publication d'une annonce : création + upload sécurisé de la vidéo via
/// URL présignée (les clés R2 ne quittent jamais le serveur), puis mise en
/// file d'encodage. Miroir du flux web /publier.
class PublishRepository {
  final _db = SupabaseService.client;

  /// Crée l'annonce en brouillon, rattachée à l'agence du compte si elle existe.
  Future<String> createDraft({
    required String title,
    String? description,
    required PropertyType type,
    required OfferType offerType,
    required num price,
    num? surface,
    int? rooms,
    required String city,
    String? district,
    String? contactPhone,
    String? whatsappPhone,
  }) async {
    final userId = SupabaseService.user!.id;

    final agency = await _db
        .from('agencies')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

    final row = await _db
        .from('properties')
        .insert({
          'owner_id': userId,
          'agency_id': agency?['id'],
          'title': title,
          'description': description,
          'type': type.name,
          'offer_type': offerType.name,
          'price': price,
          'surface': surface,
          'rooms': rooms,
          'city': city,
          'district': district,
          'contact_phone': contactPhone,
          'whatsapp_phone': whatsappPhone,
          'status': 'draft',
        })
        .select('id')
        .single();
    return row['id'] as String;
  }

  /// Demande une URL présignée à l'Edge Function sign-upload.
  Future<_SignedUpload> _signUpload({
    required String propertyId,
    required String kind,
    required String contentType,
    required int sizeBytes,
  }) async {
    final res = await _db.functions.invoke('sign-upload', body: {
      'property_id': propertyId,
      'kind': kind,
      'content_type': contentType,
      'size_bytes': sizeBytes,
    });
    final data = res.data as Map<String, dynamic>;
    return _SignedUpload(
      mediaId: data['media_id'] as String,
      jobId: data['job_id'] as String?,
      uploadUrl: data['upload_url'] as String,
    );
  }

  /// Upload de la vidéo : sign → PUT sur l'URL signée → finalize (mise en file).
  Future<void> uploadVideo({
    required String propertyId,
    required File file,
    required String contentType, // video/mp4 | video/quicktime
  }) async {
    final size = await file.length();
    final signed = await _signUpload(
      propertyId: propertyId,
      kind: 'video',
      contentType: contentType,
      sizeBytes: size,
    );

    final put = await http.put(
      Uri.parse(signed.uploadUrl),
      headers: {'Content-Type': contentType},
      body: await file.readAsBytes(),
    );
    if (put.statusCode >= 300) {
      throw Exception('Échec de l\'upload vidéo (${put.statusCode})');
    }

    await _db.functions.invoke('finalize-video', body: {'job_id': signed.jobId});
  }

  Future<void> uploadImage({
    required String propertyId,
    required File file,
    required String contentType, // image/jpeg | image/png | image/webp
  }) async {
    final size = await file.length();
    final signed = await _signUpload(
      propertyId: propertyId,
      kind: 'image',
      contentType: contentType,
      sizeBytes: size,
    );
    final put = await http.put(
      Uri.parse(signed.uploadUrl),
      headers: {'Content-Type': contentType},
      body: await file.readAsBytes(),
    );
    if (put.statusCode >= 300) {
      throw Exception('Échec de l\'upload image (${put.statusCode})');
    }
  }

  /// Soumet l'annonce à la modération (draft → pending).
  Future<void> submitForReview(String propertyId) async {
    await _db.from('properties').update({'status': 'pending'}).eq('id', propertyId);
  }

  /// Suit le statut d'encodage de la vidéo d'une annonce.
  Future<String> videoStatus(String propertyId) async {
    final row = await _db
        .from('property_media')
        .select('status')
        .eq('property_id', propertyId)
        .eq('kind', 'video')
        .order('display_order', ascending: false)
        .limit(1)
        .maybeSingle();
    return row?['status'] as String? ?? 'absent';
  }
}

class _SignedUpload {
  _SignedUpload({required this.mediaId, required this.uploadUrl, this.jobId});
  final String mediaId;
  final String? jobId;
  final String uploadUrl;
}
