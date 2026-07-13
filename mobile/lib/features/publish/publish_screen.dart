import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models.dart';
import '../../core/supabase_service.dart';
import '../../core/theme.dart';
import '../../data/publish_repository.dart';

const _cities = [
  'Dakar', 'Pikine', 'Guédiawaye', 'Rufisque', 'Diamniadio', 'Thiès',
  'Mbour', 'Saly', 'Saint-Louis', 'Touba', 'Kaolack', 'Ziguinchor',
];

/// Publication en 3 étapes : infos → vidéo/photos → contact.
/// La vidéo (15-60 s verticale) est obligatoire ; sa durée réelle est
/// re-validée côté serveur par le worker ffmpeg (l'UI ne fait pas foi).
class PublishScreen extends StatefulWidget {
  const PublishScreen({super.key});

  @override
  State<PublishScreen> createState() => _PublishScreenState();
}

class _PublishScreenState extends State<PublishScreen> {
  final _repo = PublishRepository();
  final _picker = ImagePicker();
  int _step = 0;

  // Étape 1
  final _title = TextEditingController();
  final _description = TextEditingController();
  PropertyType _type = PropertyType.apartment;
  OfferType _offer = OfferType.sale;
  final _price = TextEditingController();
  final _surface = TextEditingController();
  final _rooms = TextEditingController();
  String _city = _cities.first;
  final _district = TextEditingController();

  // Étape 2
  File? _video;
  final List<File> _images = [];

  // Étape 3
  final _contactPhone = TextEditingController();
  final _whatsappPhone = TextEditingController();

  bool _submitting = false;
  String _submitStatus = '';

  @override
  void dispose() {
    for (final c in [_title, _description, _price, _surface, _rooms, _district,
      _contactPhone, _whatsappPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _step1Valid =>
      _title.text.trim().length >= 5 && num.tryParse(_price.text.trim()) != null;
  bool get _step2Valid => _video != null;

  Future<void> _pickVideo() async {
    final picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked != null) setState(() => _video = File(picked.path));
  }

  Future<void> _pickImages() async {
    final picked = await _picker.pickMultiImage();
    if (picked.isNotEmpty) {
      setState(() => _images.addAll(picked.map((x) => File(x.path))));
    }
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _submitStatus = 'Création de l\'annonce…';
    });
    try {
      final propertyId = await _repo.createDraft(
        title: _title.text.trim(),
        description: _description.text.trim().isEmpty ? null : _description.text.trim(),
        type: _type,
        offerType: _offer,
        price: num.parse(_price.text.trim()),
        surface: num.tryParse(_surface.text.trim()),
        rooms: int.tryParse(_rooms.text.trim()),
        city: _city,
        district: _district.text.trim().isEmpty ? null : _district.text.trim(),
        contactPhone: _contactPhone.text.trim().isEmpty ? null : _contactPhone.text.trim(),
        whatsappPhone: _whatsappPhone.text.trim().isEmpty ? null : _whatsappPhone.text.trim(),
      );

      setState(() => _submitStatus = 'Envoi de la vidéo…');
      await _repo.uploadVideo(
        propertyId: propertyId,
        file: _video!,
        contentType: 'video/mp4',
      );

      for (var i = 0; i < _images.length; i++) {
        setState(() => _submitStatus = 'Envoi des photos (${i + 1}/${_images.length})…');
        await _repo.uploadImage(
          propertyId: propertyId,
          file: _images[i],
          contentType: 'image/jpeg',
        );
      }

      setState(() => _submitStatus = 'Soumission à la modération…');
      await _repo.submitForReview(propertyId);

      if (mounted) {
        showDialog(
          context: context,
          builder: (_) => AlertDialog(
            backgroundColor: WorimoColors.nightSoft,
            title: const Text('Annonce soumise ✓'),
            content: const Text(
                'Votre vidéo est en cours d\'encodage. L\'annonce sera visible '
                'après validation par notre équipe.'),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).pop();
                },
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      setState(() {
        _submitting = false;
        _submitStatus = '';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!SupabaseService.isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Publier')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Connectez-vous pour publier une annonce.'),
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

    if (_submitting) {
      return Scaffold(
        appBar: AppBar(title: const Text('Publication…')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 20),
              Text(_submitStatus, style: const TextStyle(fontSize: 15)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text('Publier — étape ${_step + 1}/3')),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: (_step + 1) / 3,
            backgroundColor: Colors.white.withValues(alpha: 0.1),
            valueColor: const AlwaysStoppedAnimation(WorimoColors.primary),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: switch (_step) {
                0 => _buildStep1(),
                1 => _buildStep2(),
                _ => _buildStep3(),
              },
            ),
          ),
          _buildNav(),
        ],
      ),
    );
  }

  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('Titre de l\'annonce'),
        TextField(
          controller: _title,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Terrain 300 m² — Diamniadio, titre foncier'),
        ),
        const SizedBox(height: 16),
        _label('Type de bien'),
        DropdownButtonFormField<PropertyType>(
          initialValue: _type,
          dropdownColor: WorimoColors.nightSoft,
          items: PropertyType.values
              .map((t) => DropdownMenuItem(value: t, child: Text(propertyTypeLabels[t]!)))
              .toList(),
          onChanged: (v) => setState(() => _type = v ?? PropertyType.apartment),
        ),
        const SizedBox(height: 16),
        _label('Offre'),
        SegmentedButton<OfferType>(
          segments: const [
            ButtonSegment(value: OfferType.sale, label: Text('Vente')),
            ButtonSegment(value: OfferType.rent, label: Text('Location')),
          ],
          selected: {_offer},
          onSelectionChanged: (s) => setState(() => _offer = s.first),
        ),
        const SizedBox(height: 16),
        _label('Prix (FCFA)'),
        TextField(
          controller: _price,
          onChanged: (_) => setState(() {}),
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '18500000'),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Surface (m²)'),
                  TextField(
                      controller: _surface, keyboardType: TextInputType.number),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Pièces'),
                  TextField(controller: _rooms, keyboardType: TextInputType.number),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _label('Ville'),
        DropdownButtonFormField<String>(
          initialValue: _city,
          dropdownColor: WorimoColors.nightSoft,
          items: _cities.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
          onChanged: (v) => setState(() => _city = v ?? _cities.first),
        ),
        const SizedBox(height: 16),
        _label('Quartier (optionnel)'),
        TextField(controller: _district),
        const SizedBox(height: 16),
        _label('Description'),
        TextField(controller: _description, maxLines: 4),
      ],
    );
  }

  Widget _buildStep2() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('Vidéo de l\'annonce (obligatoire)'),
        Text('Verticale, entre 15 et 60 secondes.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: _pickVideo,
          child: Container(
            height: 160,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _video != null
                    ? WorimoColors.primary
                    : Colors.white.withValues(alpha: 0.2),
                width: 1.5,
              ),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_video != null ? Icons.check_circle : Icons.videocam,
                      size: 40,
                      color: _video != null
                          ? WorimoColors.primary
                          : Colors.white.withValues(alpha: 0.5)),
                  const SizedBox(height: 8),
                  Text(_video != null ? 'Vidéo sélectionnée' : 'Choisir une vidéo',
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),
        _label('Photos (optionnel)'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ..._images.asMap().entries.map((e) => Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(e.value, width: 80, height: 80, fit: BoxFit.cover),
                    ),
                    Positioned(
                      top: 2,
                      right: 2,
                      child: GestureDetector(
                        onTap: () => setState(() => _images.removeAt(e.key)),
                        child: const CircleAvatar(
                          radius: 11,
                          backgroundColor: Colors.black54,
                          child: Icon(Icons.close, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                )),
            GestureDetector(
              onTap: _pickImages,
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Icon(Icons.add_a_photo, color: Colors.white.withValues(alpha: 0.5)),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('Téléphone de contact'),
        TextField(
          controller: _contactPhone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(hintText: '+221 77 123 45 67'),
        ),
        const SizedBox(height: 16),
        _label('WhatsApp (optionnel)'),
        TextField(
          controller: _whatsappPhone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(hintText: '+221 77 123 45 67'),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: WorimoColors.primary.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline, color: WorimoColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Après envoi, votre vidéo est encodée puis l\'annonce passe en '
                  'modération avant publication.',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildNav() {
    final canNext = switch (_step) {
      0 => _step1Valid,
      1 => _step2Valid,
      _ => true,
    };
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (_step > 0)
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _step--),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                  ),
                  child: const Text('Précédent'),
                ),
              ),
            if (_step > 0) const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                onPressed: canNext
                    ? (_step == 2 ? _submit : () => setState(() => _step++))
                    : null,
                child: Text(_step == 2 ? 'Publier' : 'Suivant'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 14)),
      );
}
