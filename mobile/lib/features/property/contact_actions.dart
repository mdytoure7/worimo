import 'package:url_launcher/url_launcher.dart';
import '../../core/format.dart';

// En V1, toute la messagerie passe par WhatsApp/appel (pas de messagerie interne).

Future<void> openWhatsApp(String phone, String title) async {
  final uri = whatsappUri(phone, title);
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> openPhone(String phone) async {
  await launchUrl(telUri(phone));
}
