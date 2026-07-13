import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/models.dart';
import '../../core/supabase_service.dart';
import '../../data/favorites_repository.dart';
import '../../data/favorites_store.dart';
import '../../shared/property_card.dart';

/// Mes favoris — RLS : ne renvoie que ceux de l'utilisateur connecté.
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  final _repo = FavoritesRepository();
  List<Property> _properties = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final props = await _repo.loadProperties();
      if (mounted) setState(() => _properties = props);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Recharge la liste quand un favori est retiré depuis une carte.
    context.watch<FavoritesStore>();

    if (!SupabaseService.isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mes favoris')),
        body: _Empty(
          icon: Icons.favorite_border,
          text: 'Connectez-vous pour retrouver vos annonces favorites.',
          actionLabel: 'Se connecter',
          onAction: () => Navigator.of(context).pushNamed('/login'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Mes favoris')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _properties.isEmpty
                ? _Empty(
                    icon: Icons.favorite_border,
                    text: 'Aucun favori pour l\'instant.\nTouchez le cœur sur une annonce.',
                    actionLabel: 'Découvrir le feed',
                    onAction: () => Navigator.of(context).pop(),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 0.72,
                    ),
                    itemCount: _properties.length,
                    itemBuilder: (_, i) => PropertyCard(property: _properties[i]),
                  ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({
    required this.icon,
    required this.text,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String text;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.white.withValues(alpha: 0.4)),
            const SizedBox(height: 16),
            Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7))),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
