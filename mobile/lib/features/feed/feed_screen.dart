import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../data/property_repository.dart';
import '../../data/tracking_repository.dart';
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
  final _tracking = TrackingRepository();
  PageController _pageController = PageController();
  late final Player _player = Player();
  late final VideoController _videoController = VideoController(_player);

  static const _pageSize = 10;

  List<Property> _properties = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _reachedEnd = false;
  String? _error;
  int _currentIndex = 0;

  // Onglet de feed : 0 = Pour toi, 1 = À louer, 2 = À vendre.
  int _tabIndex = 0;
  OfferType? get _feedOffer =>
      switch (_tabIndex) { 1 => OfferType.rent, 2 => OfferType.sale, _ => null };

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Bascule d'onglet : recharge le feed depuis le début (contrôleur neuf pour
  /// repartir à la page 0 proprement).
  void _switchTab(int index) {
    if (index == _tabIndex) return;
    // Nouveau contrôleur pour repartir à la page 0 ; l'ancien est disposé après
    // le frame (une fois détaché de l'ancien PageView).
    final old = _pageController;
    _pageController = PageController();
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    setState(() {
      _tabIndex = index;
      _properties = [];
      _loading = true;
      _loadingMore = false;
      _reachedEnd = false;
      _error = null;
      _currentIndex = 0;
    });
    _load();
  }

  Future<void> _load() async {
    try {
      final feed = await _repo.fetchFeed(limit: _pageSize, offerType: _feedOffer);
      if (!mounted) return;
      setState(() {
        _properties = feed;
        _loading = false;
        _reachedEnd = feed.length < _pageSize;
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

  /// Pagination infinie par curseur — précharge la suite avant que
  /// l'utilisateur n'atteigne la fin de ce qui est déjà chargé.
  Future<void> _loadMore() async {
    if (_loadingMore || _reachedEnd || _properties.isEmpty) return;
    _loadingMore = true;
    try {
      final next = await _repo.fetchFeedAfter(_properties.last, limit: _pageSize, offerType: _feedOffer);
      if (!mounted) return;
      if (next.length < _pageSize) _reachedEnd = true;
      if (next.isNotEmpty) {
        final existingIds = _properties.map((p) => p.id).toSet();
        final deduped = next.where((p) => !existingIds.contains(p.id)).toList();
        if (deduped.isNotEmpty) {
          setState(() => _properties = [..._properties, ...deduped]);
        }
      }
    } catch (_) {
      // Silencieux : le feed s'arrête simplement là, comme sur le web.
    } finally {
      _loadingMore = false;
    }
  }

  void _openAt(int index) {
    _tracking.logEvent('property_view', propertyId: _properties[index].id);
    if (_properties.length - index <= 3) _loadMore();
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
        // En-tête : logo (gauche) + onglets de feed (centre), façon TikTok.
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: RichText(
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
                ),
                _FeedTabs(index: _tabIndex, onTap: _switchTab),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Onglets de feed (Pour toi / À louer / À vendre) — pilule centrée façon TikTok.
class _FeedTabs extends StatelessWidget {
  const _FeedTabs({required this.index, required this.onTap});

  final int index;
  final ValueChanged<int> onTap;

  static const _labels = ['Pour toi', 'À louer', 'À vendre'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(_labels.length, (i) {
          final active = i == index;
          return GestureDetector(
            onTap: () => onTap(i),
            behavior: HitTestBehavior.opaque,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: active ? Colors.white.withValues(alpha: 0.92) : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _labels[i],
                style: TextStyle(
                  color: active ? WorimoColors.night : Colors.white.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          );
        }),
      ),
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
                  if (property.agency != null) ...[
                    _AgencyChip(agency: property.agency!),
                    const SizedBox(height: 10),
                  ],
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
                _CircleAction(
                  icon: Icons.reply,
                  color: Colors.black.withValues(alpha: 0.4),
                  onTap: () => shareProperty(context, property.id),
                ),
                const SizedBox(height: 4),
                const Text('Partager', style: TextStyle(color: Colors.white, fontSize: 11)),
                const SizedBox(height: 16),
                if (property.whatsappPhone != null) ...[
                  _CircleAction(
                    icon: Icons.chat,
                    color: const Color(0xFF25D366),
                    onTap: () => openWhatsApp(property.whatsappPhone!, property.title, propertyId: property.id),
                  ),
                  const SizedBox(height: 4),
                  const Text('WhatsApp', style: TextStyle(color: Colors.white, fontSize: 11)),
                  const SizedBox(height: 16),
                ],
                if (property.contactPhone != null) ...[
                  _CircleAction(
                    icon: Icons.phone,
                    color: WorimoGreen.value,
                    onTap: () => openPhone(property.contactPhone!, propertyId: property.id),
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

/// Identité de l'agent/agence sous la vidéo — façon « @créateur » de TikTok.
class _AgencyChip extends StatelessWidget {
  const _AgencyChip({required this.agency});
  final Agency agency;

  @override
  Widget build(BuildContext context) {
    final hasLogo = agency.logoUrl != null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: WorimoColors.primary,
            border: Border.all(color: Colors.white.withValues(alpha: 0.5)),
            image: hasLogo
                ? DecorationImage(image: NetworkImage(agency.logoUrl!), fit: BoxFit.cover)
                : null,
          ),
          alignment: Alignment.center,
          child: hasLogo
              ? null
              : Text(
                  agency.name.isNotEmpty ? agency.name[0].toUpperCase() : '?',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            agency.name,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
          ),
        ),
        if (agency.verified) ...[
          const SizedBox(width: 4),
          const Icon(Icons.verified, color: WorimoColors.primary, size: 16),
        ],
      ],
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
