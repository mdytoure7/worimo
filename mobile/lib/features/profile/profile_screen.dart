import 'package:flutter/material.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/supabase_service.dart';
import '../../core/theme.dart';
import '../../data/property_repository.dart';

/// Profil : mes infos, mes annonces (statuts de modération + motif de refus),
/// déconnexion. Édition des infos via un formulaire simple.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = PropertyRepository();
  final _db = SupabaseService.client;
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _properties = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!SupabaseService.isLoggedIn) {
      setState(() => _loading = false);
      return;
    }
    try {
      final userId = SupabaseService.user!.id;
      final profile = await _db
          .from('profiles')
          .select('id, full_name, phone, email, role')
          .eq('id', userId)
          .maybeSingle();
      final props = await _repo.fetchMine();
      if (mounted) {
        setState(() {
          _profile = profile;
          _properties = props;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await _db.auth.signOut();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    if (!SupabaseService.isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mon profil')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Connectez-vous pour accéder à votre profil.'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pushReplacementNamed('/login'),
                child: const Text('Se connecter'),
              ),
            ],
          ),
        ),
      );
    }

    final role = _profile?['role'] as String? ?? 'buyer';
    final canPublish = ['seller', 'agency', 'admin'].contains(role);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mon profil'),
        actions: [
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildProfileCard(role),
                  if (canPublish) ...[
                    const SizedBox(height: 16),
                    _buildStats(),
                  ],
                  const SizedBox(height: 24),
                  if (canPublish) ...[
                    Row(
                      children: [
                        const Text('Mes annonces',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                        const Spacer(),
                        ElevatedButton.icon(
                          onPressed: () => Navigator.of(context)
                              .pushNamed('/publish')
                              .then((_) => _load()),
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Publier'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (_properties.isEmpty)
                      Text('Aucune annonce pour l\'instant.',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.6)))
                    else
                      GridView.count(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                        childAspectRatio: 9 / 16,
                        children: _properties.map(_buildPropertyGridTile).toList(),
                      ),
                  ],
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: () => Navigator.of(context).pushNamed('/favorites'),
                    icon: const Icon(Icons.favorite_border),
                    label: const Text('Mes favoris'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildProfileCard(String role) {
    const roleLabels = {
      'buyer': 'Acheteur',
      'seller': 'Vendeur',
      'agency': 'Agence',
      'admin': 'Administrateur',
    };
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: WorimoColors.primary.withValues(alpha: 0.2),
            child: Text(
              (_profile?['full_name'] as String? ?? '?').characters.first.toUpperCase(),
              style: const TextStyle(
                  color: WorimoColors.primary, fontSize: 22, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_profile?['full_name'] as String? ?? '',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(_profile?['email'] as String? ?? '',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(roleLabels[role] ?? role,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Compteurs façon profil TikTok : total, publiées, en attente.
  Widget _buildStats() {
    final total = _properties.length;
    final published = _properties.where((p) => p['status'] == 'published').length;
    final pending = _properties.where((p) => p['status'] == 'pending').length;
    Widget stat(int value, String label) => Column(
          children: [
            Text('$value', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
          ],
        );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        stat(total, 'Annonces'),
        stat(published, 'Publiées'),
        stat(pending, 'En attente'),
      ],
    );
  }

  /// Vignette d'annonce façon grille TikTok (miniature verticale + statut).
  Widget _buildPropertyGridTile(Map<String, dynamic> p) {
    final status = p['status'] as String? ?? 'draft';
    final statusInfo = _statusInfo(status);
    final media = (p['property_media'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    media.sort((a, b) =>
        ((a['display_order'] as num?) ?? 0).compareTo((b['display_order'] as num?) ?? 0));
    String? thumb;
    for (final m in media) {
      if (m['kind'] == 'video' && m['thumbnail_url'] != null) {
        thumb = m['thumbnail_url'] as String;
        break;
      }
      if (m['kind'] == 'image' && m['url'] != null) thumb = m['url'] as String;
    }
    final offerType = offerTypeFromString(p['offer_type'] as String?);
    final published = status == 'published';

    return GestureDetector(
      onTap: published
          ? () => Navigator.of(context).pushNamed('/property', arguments: p['id'])
          : null,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          fit: StackFit.expand,
          children: [
            thumb != null
                ? Image.network(thumb, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _thumbPlaceholder())
                : _thumbPlaceholder(),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.center,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black87],
                ),
              ),
            ),
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: statusInfo.$2.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(statusInfo.$1,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600)),
              ),
            ),
            Positioned(
              left: 6,
              right: 6,
              bottom: 6,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(p['title'] as String? ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                  Text(formatPrice((p['price'] as num?) ?? 0, offerType),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: WorimoColors.primary, fontSize: 10)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbPlaceholder() => Container(
        color: Colors.white.withValues(alpha: 0.1),
        child: Icon(Icons.image, color: Colors.white.withValues(alpha: 0.3), size: 20),
      );

  (String, Color) _statusInfo(String status) => switch (status) {
        'published' => ('Publiée', WorimoColors.primary),
        'pending' => ('En modération', const Color(0xFFF59E0B)),
        'rejected' => ('Refusée', const Color(0xFFEF4444)),
        'archived' => ('Archivée', Colors.grey),
        _ => ('Brouillon', Colors.grey),
      };
}
