import 'package:flutter/material.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../data/property_repository.dart';
import '../../shared/property_card.dart';

const _cities = [
  'Dakar', 'Pikine', 'Guédiawaye', 'Rufisque', 'Diamniadio', 'Thiès',
  'Mbour', 'Saly', 'Saint-Louis', 'Touba', 'Kaolack', 'Ziguinchor',
];

/// Recherche filtrée : localisation, type, offre, budget, surface, vérifié, tri.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _repo = PropertyRepository();
  PropertyFilters _filters = const PropertyFilters();
  List<Property> _results = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    setState(() => _loading = true);
    try {
      final results = await _repo.search(_filters);
      if (mounted) setState(() => _results = results);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openFilters() async {
    final updated = await showModalBottomSheet<PropertyFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: WorimoColors.nightSoft,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _FilterSheet(initial: _filters),
    );
    if (updated != null) {
      setState(() => _filters = updated);
      _run();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rechercher'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            onPressed: _openFilters,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_filters.verifiedOnly ||
              _filters.city != null ||
              _filters.type != null ||
              _filters.offerType != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text('${_results.length} résultat${_results.length > 1 ? 's' : ''}',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
                  const Spacer(),
                  TextButton(
                    onPressed: () {
                      setState(() => _filters = const PropertyFilters());
                      _run();
                    },
                    child: const Text('Réinitialiser'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _results.isEmpty
                    ? Center(
                        child: Text('Aucune annonce ne correspond.',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
                      )
                    : GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 0.72,
                        ),
                        itemCount: _results.length,
                        itemBuilder: (_, i) => PropertyCard(property: _results[i]),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openFilters,
        backgroundColor: WorimoColors.primary,
        icon: const Icon(Icons.tune, color: Colors.white),
        label: const Text('Filtres', style: TextStyle(color: Colors.white)),
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});
  final PropertyFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _city = widget.initial.city;
  late PropertyType? _type = widget.initial.type;
  late OfferType? _offer = widget.initial.offerType;
  late bool _verified = widget.initial.verifiedOnly;
  late PropertySort _sort = widget.initial.sort;
  final _priceMin = TextEditingController();
  final _priceMax = TextEditingController();
  final _surfaceMin = TextEditingController();
  final _surfaceMax = TextEditingController();

  @override
  void initState() {
    super.initState();
    _priceMin.text = widget.initial.priceMin?.toString() ?? '';
    _priceMax.text = widget.initial.priceMax?.toString() ?? '';
    _surfaceMin.text = widget.initial.surfaceMin?.toString() ?? '';
    _surfaceMax.text = widget.initial.surfaceMax?.toString() ?? '';
  }

  @override
  void dispose() {
    _priceMin.dispose();
    _priceMax.dispose();
    _surfaceMin.dispose();
    _surfaceMax.dispose();
    super.dispose();
  }

  num? _parse(TextEditingController c) => c.text.trim().isEmpty ? null : num.tryParse(c.text.trim());

  void _apply() {
    Navigator.of(context).pop(PropertyFilters(
      city: _city,
      type: _type,
      offerType: _offer,
      priceMin: _parse(_priceMin),
      priceMax: _parse(_priceMax),
      surfaceMin: _parse(_surfaceMin),
      surfaceMax: _parse(_surfaceMax),
      verifiedOnly: _verified,
      sort: _sort,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Filtres', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            DropdownButtonFormField<String?>(
              initialValue: _city,
              decoration: const InputDecoration(labelText: 'Localisation'),
              dropdownColor: WorimoColors.nightSoft,
              items: [
                const DropdownMenuItem(value: null, child: Text('Toutes les villes')),
                ..._cities.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: (v) => setState(() => _city = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<PropertyType?>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Type de bien'),
              dropdownColor: WorimoColors.nightSoft,
              items: [
                const DropdownMenuItem(value: null, child: Text('Tous')),
                ...PropertyType.values.map(
                    (t) => DropdownMenuItem(value: t, child: Text(propertyTypeLabels[t]!))),
              ],
              onChanged: (v) => setState(() => _type = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<OfferType?>(
              initialValue: _offer,
              decoration: const InputDecoration(labelText: 'Offre'),
              dropdownColor: WorimoColors.nightSoft,
              items: const [
                DropdownMenuItem(value: null, child: Text('Vente et location')),
                DropdownMenuItem(value: OfferType.sale, child: Text('Vente')),
                DropdownMenuItem(value: OfferType.rent, child: Text('Location')),
              ],
              onChanged: (v) => setState(() => _offer = v),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _numField(_priceMin, 'Budget min')),
                const SizedBox(width: 12),
                Expanded(child: _numField(_priceMax, 'Budget max')),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _numField(_surfaceMin, 'Surface min (m²)')),
                const SizedBox(width: 12),
                Expanded(child: _numField(_surfaceMax, 'Surface max (m²)')),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<PropertySort>(
              initialValue: _sort,
              decoration: const InputDecoration(labelText: 'Tri'),
              dropdownColor: WorimoColors.nightSoft,
              items: const [
                DropdownMenuItem(value: PropertySort.recent, child: Text('Plus récentes')),
                DropdownMenuItem(value: PropertySort.priceAsc, child: Text('Prix croissant')),
                DropdownMenuItem(value: PropertySort.priceDesc, child: Text('Prix décroissant')),
              ],
              onChanged: (v) => setState(() => _sort = v ?? PropertySort.recent),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeThumbColor: WorimoColors.primary,
              title: const Text('Vérifié Worimo uniquement'),
              value: _verified,
              onChanged: (v) => setState(() => _verified = v),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(onPressed: _apply, child: const Text('Rechercher')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _numField(TextEditingController c, String label) => TextField(
        controller: c,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(labelText: label),
      );
}
