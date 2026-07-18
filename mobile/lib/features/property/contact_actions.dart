import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/format.dart';
import '../../data/tracking_repository.dart';

// En V1, toute la messagerie passe par WhatsApp/appel (pas de messagerie interne).

/// Base publique des liens d'annonce partagés (web déployé sur Vercel).
const worimoWebBase = 'https://web-six-jade-83.vercel.app';

final _tracking = TrackingRepository();

Future<void> openWhatsApp(String phone, String title, {String? propertyId}) async {
  _tracking.logEvent('whatsapp_click', propertyId: propertyId);
  final uri = whatsappUri(phone, title);
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> openPhone(String phone, {String? propertyId}) async {
  _tracking.logEvent('call_click', propertyId: propertyId);
  await launchUrl(telUri(phone));
}

/// Partage d'une annonce : copie le lien public dans le presse-papiers et
/// confirme via SnackBar (sans dépendance native — le partage natif viendra
/// avec share_plus si besoin).
Future<void> shareProperty(BuildContext context, String propertyId) async {
  _tracking.logEvent('share', propertyId: propertyId);
  final url = '$worimoWebBase/annonces/$propertyId';
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Lien copié — partagez-le où vous voulez'),
        duration: Duration(seconds: 2),
      ),
    );
  }
}
