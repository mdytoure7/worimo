import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/supabase_service.dart';
import '../../data/property_repository.dart';
import '../../shared/favorite_button.dart';
import '../../shared/verified_badge.dart';
import '../property/contact_actions.dart';

/// Feed vidéo vertical plein écran, autoplay au scroll (style TikTok/Reels).
///
/// Choix d'implémentation : un seul lecteur media_kit, dont on change la source
/// à chaque page. La miniature sert de poster pendant le buffering. Économe en
/// mémoire et robuste sur les connexions lentes (cible Sénégal).
class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _repo = PropertyRepository();
  final _pageController = PageController();
  late final Player _player = Player();
  late final VideoController _videoController = VideoController(_player);

  List<Property> _properties = [];
  bool _loading = true;
  String? _error;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final feed = await _repo.fetchFeed(limit: 20);
      if (!mounted) return;
      setState(() {
        _properties = feed;
        _loading = false;
      });
      if (feed.isNotEmpty) _openAt(0);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _openAt(int index) {
    final video = _properties[index].video;
    if (video?.manifestUrl == null) return;
    _player.open(Media(video!.manifestUrl!));
    _player.setPlaylistMode(PlaylistMode.single); // boucle la vidéo courante
  }

  @override
  void dispose() {
    _player.dispose();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    if (_error != null) {
      return _FeedMessage(
        icon: Icons.wifi_off,
        text: 'Impossible de charger le feed.\n$_error',
        onRetry: () {
          setState(() {
            _loading = true;
            _error = null;
          });
          _load();
        },
      );
    }
    if (_properties.isEmpty) {
      return const _FeedMessage(
        icon: Icons.video_library_outlined,
        text: 'Aucune annonce vidéo pour le moment.',
      );
    }

    return Stack(
      children: [
        PageView.builder(
          controller: _pageController,
          scrollDirection: Axis.vertical,
          itemCount: _properties.length,
          onPageChanged: (index) {
            setState(() => _currentIndex = index);
            _openAt(index);
          },
          itemBuilder: (context, index) {
            return _FeedPage(
              property: _properties[index],
              videoController: _videoController,
              isActive: index == _currentIndex,
              player: _player,
            );
          },
        ),
        // En-tête : logo + recherche + profil.
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                RichText(
                  text: const TextSpan(
                    children: [
                      TextSpan(
                        text: 'Wori',
                        style: TextStyle(
                          color: Color(0xFF16A34A),
                          fontWeight: FontWeight.bold,
                          fontSize: 20,
                        ),
                      ),
                      TextSpan(
                        text: 'mo',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 20,
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                _RoundIconButton(
                  icon: Icons.search,
                  onTap: () => Navigator.of(context).pushNamed('/search'),
                ),
                const SizedBox(width: 8),
                _RoundIconButton(
                  icon: SupabaseService.isLoggedIn ? Icons.person : Icons.login,
                  onTap: () => Navigator.of(context)
                      .pushNamed(SupabaseService.isLoggedIn ? '/profile' : '/login'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FeedPage extends StatelessWidget {
  const _FeedPage({
    required this.property,
    required this.videoController,
    required this.isActive,
    required this.player,
  });

  final Property property;
  final VideoController videoController;
  final bool isActive;
  final Player player;

  @override
  Widget build(BuildContext context) {
    final video = property.video;

    return GestureDetector(
      onTap: () => player.playOrPause(),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Poster (miniature) en fond, remplacé par la vidéo quand active.
          if (video?.thumbnailUrl != null)
            Image.network(video!.thumbnailUrl!, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(color: Colors.black)),
          if (isActive)
            Video(
              controller: videoController,
              controls: NoVideoControls,
              fit: BoxFit.cover,
            ),
          // Dégradé bas pour lisibilité du texte.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.center,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black.withValues(alpha: 0.75)],
                ),
              ),
            ),
          ),
          _buildOverlay(context, property),
        ],
      ),
    );
  }

  Widget _buildOverlay(BuildContext context, Property property) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Infos annonce
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  VerifiedBadge(verification: property.verification),
                  const SizedBox(height: 10),
                  Text(
                    '${offerTypeLabels[property.offerType]} · ${propertyTypeLabels[property.type]}',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    property.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 19, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${property.district != null ? '${property.district}, ' : ''}${property.city}',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 14),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    formatPrice(property.price, property.offerType),
                    style: const TextStyle(
                        color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: () => Navigator.of(context)
                        .pushNamed('/property', arguments: property.id),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.5)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                    ),
                    child: const Text('Voir l\'annonce'),
                  ),
                ],
              ),
            ),
            // Actions latérales (style TikTok)
            Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                FavoriteButton(propertyId: property.id),
                const SizedBox(height: 4),
                const Text('Favoris', style: TextStyle(color: Colors.white, fontSize: 11)),
                const SizedBox(height: 16),
                if (property.whatsappPhone != null) ...[
                  _CircleAction(
                    icon: Icons.chat,
                    color: const Color(0xFF25D366),
                    onTap: () => openWhatsApp(property.whatsappPhone!, property.title),
                  ),
                  const SizedBox(height: 4),
                  const Text('WhatsApp', style: TextStyle(color: Colors.white, fontSize: 11)),
                  const SizedBox(height: 16),
                ],
                if (property.contactPhone != null) ...[
                  _CircleAction(
                    icon: Icons.phone,
                    color: WorimoGreen.value,
                    onTap: () => openPhone(property.contactPhone!),
                  ),
                  const SizedBox(height: 4),
                  const Text('Appeler', style: TextStyle(color: Colors.white, fontSize: 11)),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class WorimoGreen {
  static const value = Color(0xFF16A34A);
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({required this.icon, required this.color, required this.onTap});
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.4),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }
}

class _FeedMessage extends StatelessWidget {
  const _FeedMessage({required this.icon, required this.text, this.onRetry});
  final IconData icon;
  final String text;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.5), size: 48),
            const SizedBox(height: 16),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              ElevatedButton(onPressed: onRetry, child: const Text('Réessayer')),
            ],
          ],
        ),
      ),
    );
  }
}
