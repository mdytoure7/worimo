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
import 'contact_actions.dart';

/// Détail annonce : média, prix, localisation, badge vérifié, rapport de
/// vérification foncière, et actions WhatsApp/Appeler.
class PropertyDetailScreen extends StatefulWidget {
  const PropertyDetailScreen({super.key, required this.propertyId});

  final String propertyId;

  @override
  State<PropertyDetailScreen> createState() => _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends State<PropertyDetailScreen> {
  final _repo = PropertyRepository();
  final _tracking = TrackingRepository();
  Player? _player;
  VideoController? _videoController;
  Property? _property;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final property = await _repo.fetchById(widget.propertyId);
      if (!mounted) return;
      if (property == null) {
        setState(() {
          _error = 'Annonce introuvable';
          _loading = false;
        });
        return;
      }
      _tracking.logEvent('property_view', propertyId: property.id);
      final video = property.video;
      if (video?.manifestUrl != null) {
        final player = Player();
        _player = player;
        _videoController = VideoController(player);
        await player.open(Media(video!.manifestUrl!), play: false);
        player.setPlaylistMode(PlaylistMode.single);
      }
      setState(() {
        _property = property;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null || _property == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text(_error ?? 'Erreur')),
      );
    }
    final p = _property!;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            backgroundColor: WorimoColors.night,
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FavoriteButton(propertyId: p.id, size: 22),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(background: _buildMedia(p)),
          ),
          SliverToBoxAdapter(child: _buildContent(p)),
        ],
      ),
      bottomNavigationBar: _buildContactBar(p),
    );
  }

  Widget _buildMedia(Property p) {
    if (_videoController != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          Video(controller: _videoController!, fit: BoxFit.cover),
        ],
      );
    }
    final cover = p.coverUrl;
    if (cover != null) {
      return Image.network(cover, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(color: WorimoColors.nightSoft));
    }
    return Container(color: WorimoColors.nightSoft);
  }

  Widget _buildContent(Property p) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          VerifiedBadge(verification: p.verification),
          const SizedBox(height: 12),
          Text('${offerTypeLabels[p.offerType]} · ${propertyTypeLabels[p.type]}',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
          const SizedBox(height: 4),
          Text(p.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.place_outlined, size: 18, color: WorimoColors.primary),
              const SizedBox(width: 4),
              Text('${p.district != null ? '${p.district}, ' : ''}${p.city}',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.8))),
            ],
          ),
          const SizedBox(height: 12),
          Text(formatPrice(p.price, p.offerType),
              style: const TextStyle(
                  color: WorimoColors.primary, fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          // Caractéristiques
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (p.surface != null) _chip(Icons.straighten, '${p.surface} m²'),
              if (p.rooms != null) _chip(Icons.meeting_room_outlined, '${p.rooms} pièces'),
              _chip(Icons.home_work_outlined, propertyTypeLabels[p.type]!),
            ],
          ),
          if (p.description != null && p.description!.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('Description',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(p.description!,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), height: 1.5)),
          ],
          if (p.agency != null) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                const Icon(Icons.business, size: 18, color: WorimoColors.primary),
                const SizedBox(width: 6),
                Text(p.agency!.name,
                    style: const TextStyle(fontWeight: FontWeight.w500)),
                if (p.agency!.verified) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.verified, size: 16, color: WorimoColors.primary),
                ],
              ],
            ),
          ],
          _buildVerificationReport(p),
          const SizedBox(height: 100), // espace pour la barre de contact
        ],
      ),
    );
  }

  Widget _buildVerificationReport(Property p) {
    final v = p.verification;
    if (v == null || !v.isVerified) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: WorimoColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: WorimoColors.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified, color: WorimoColors.primary),
              const SizedBox(width: 8),
              const Text('Rapport de vérification Worimo',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            ],
          ),
          if (v.reportNumber != null) ...[
            const SizedBox(height: 4),
            Text('Rapport n° ${v.reportNumber}',
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 12,
                    fontFamily: 'monospace')),
          ],
          if (v.summary != null) ...[
            const SizedBox(height: 10),
            Text(v.summary!,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), height: 1.5)),
          ],
          const SizedBox(height: 12),
          ...v.documents.where((d) => d.checked).map((d) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle, size: 16, color: WorimoColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(d.label,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.85)))),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.white.withValues(alpha: 0.7)),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }

  Widget? _buildContactBar(Property p) {
    if (p.whatsappPhone == null && p.contactPhone == null) return null;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: WorimoColors.night,
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
      ),
      child: Row(
        children: [
          if (p.whatsappPhone != null)
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => openWhatsApp(p.whatsappPhone!, p.title, propertyId: p.id),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                icon: const Icon(Icons.chat, color: Colors.white),
                label: const Text('WhatsApp'),
              ),
            ),
          if (p.whatsappPhone != null && p.contactPhone != null) const SizedBox(width: 12),
          if (p.contactPhone != null)
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => openPhone(p.contactPhone!, propertyId: p.id),
                icon: const Icon(Icons.phone, color: Colors.white),
                label: const Text('Appeler'),
              ),
            ),
        ],
      ),
    );
  }
}
