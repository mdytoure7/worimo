import 'package:flutter/foundation.dart';
import '../core/supabase_service.dart';
import 'favorites_repository.dart';

/// Store partagé des favoris : une seule source de vérité pour tous les
/// boutons cœur de l'app, rechargée à chaque changement de session.
class FavoritesStore extends ChangeNotifier {
  FavoritesStore() {
    SupabaseService.client.auth.onAuthStateChange.listen((_) => reload());
    reload();
  }

  final _repo = FavoritesRepository();
  Set<String> _ids = {};
  bool _loaded = false;

  bool get loaded => _loaded;
  bool contains(String id) => _ids.contains(id);

  Future<void> reload() async {
    _ids = await _repo.loadIds();
    _loaded = true;
    notifyListeners();
  }

  /// Bascule optimiste : met à jour l'UI immédiatement, annule si l'API échoue.
  /// Retourne false si l'utilisateur n'est pas connecté (l'appelant redirige).
  Future<bool> toggle(String id) async {
    if (!SupabaseService.isLoggedIn) return false;

    final wasFavorite = _ids.contains(id);
    if (wasFavorite) {
      _ids.remove(id);
    } else {
      _ids.add(id);
    }
    notifyListeners();

    try {
      if (wasFavorite) {
        await _repo.remove(id);
      } else {
        await _repo.add(id);
      }
    } catch (_) {
      // Rollback en cas d'échec réseau.
      if (wasFavorite) {
        _ids.add(id);
      } else {
        _ids.remove(id);
      }
      notifyListeners();
    }
    return true;
  }
}
