import 'package:intl/intl.dart';
import 'models.dart';

final _priceFormat = NumberFormat.decimalPattern('fr_FR');

String formatPrice(num price, OfferType offerType) {
  final formatted = _priceFormat.format(price);
  return offerType == OfferType.rent ? '$formatted FCFA / mois' : '$formatted FCFA';
}

/// Lien WhatsApp pré-rempli (miroir de whatsappLink côté web).
Uri whatsappUri(String phone, String title) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  final text = Uri.encodeComponent(
    'Bonjour, je suis intéressé(e) par votre annonce « $title » vue sur Worimo.',
  );
  return Uri.parse('https://wa.me/$digits?text=$text');
}

Uri telUri(String phone) => Uri.parse('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}');
