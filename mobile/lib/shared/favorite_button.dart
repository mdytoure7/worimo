import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/supabase_service.dart';
import '../core/theme.dart';
import '../data/favorites_store.dart';

/// Bouton cœur réutilisable — feed, cartes, détail. Redirige vers la connexion
/// si l'utilisateur est anonyme.
class FavoriteButton extends StatelessWidget {
  const FavoriteButton({
    super.key,
    required this.propertyId,
    this.size = 24,
    this.background = true,
  });

  final String propertyId;
  final double size;
  final bool background;

  @override
  Widget build(BuildContext context) {
    final store = context.watch<FavoritesStore>();
    final active = store.contains(propertyId);

    final icon = Icon(
      active ? Icons.favorite : Icons.favorite_border,
      color: active ? WorimoColors.primary : Colors.white,
      size: size,
    );

    return InkWell(
      customBorder: const CircleBorder(),
      onTap: () async {
        if (!SupabaseService.isLoggedIn) {
          Navigator.of(context).pushNamed('/login');
          return;
        }
        await context.read<FavoritesStore>().toggle(propertyId);
      },
      child: background
          ? Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.4),
                shape: BoxShape.circle,
              ),
              child: icon,
            )
          : Padding(padding: const EdgeInsets.all(4), child: icon),
    );
  }
}
