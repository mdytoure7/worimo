import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/models.dart';
import 'favorite_button.dart';
import 'verified_badge.dart';

/// Carte annonce pour les grilles (recherche, favoris).
class PropertyCard extends StatelessWidget {
  const PropertyCard({super.key, required this.property});

  final Property property;

  @override
  Widget build(BuildContext context) {
    final cover = property.coverUrl;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Navigator.of(context).pushNamed('/property', arguments: property.id),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          color: Colors.white.withValues(alpha: 0.05),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 4 / 3,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (cover != null)
                      Image.network(cover, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _placeholder())
                    else
                      _placeholder(),
                    Positioned(
                      top: 8,
                      left: 8,
                      child: VerifiedBadge(verification: property.verification, compact: true),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: FavoriteButton(propertyId: property.id, size: 18),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      property.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${propertyTypeLabels[property.type]} · '
                      '${property.district != null ? '${property.district}, ' : ''}'
                      '${property.city}'
                      '${property.surface != null ? ' · ${property.surface} m²' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      formatPrice(property.price, property.offerType),
                      style: const TextStyle(
                        color: Color(0xFF16A34A),
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
        color: Colors.white.withValues(alpha: 0.08),
        child: Center(
          child: Icon(Icons.home_outlined, color: Colors.white.withValues(alpha: 0.3), size: 40),
        ),
      );
}
