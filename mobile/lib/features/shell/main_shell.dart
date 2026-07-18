import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../favorites/favorites_screen.dart';
import '../feed/feed_screen.dart';
import '../profile/profile_screen.dart';
import '../search/search_screen.dart';

/// Coquille de navigation principale — barre basse façon TikTok/Instagram :
/// Accueil, Rechercher, Publier (action, pousse un écran), Favoris, Profil.
/// Les 4 onglets gardent leur état (IndexedStack) ; Publier n'est pas un
/// onglet mais une action qui pousse PublishScreen par-dessus.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  static const _tabs = [
    FeedScreen(),
    SearchScreen(),
    FavoritesScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: _BottomBar(
        index: _index,
        onTap: (i) => setState(() => _index = i),
        onPublish: () => Navigator.of(context).pushNamed('/publish'),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.index, required this.onTap, required this.onPublish});

  final int index;
  final ValueChanged<int> onTap;
  final VoidCallback onPublish;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: WorimoColors.night.withValues(alpha: 0.95),
          border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
        ),
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavItem(icon: Icons.home_rounded, label: 'Accueil', active: index == 0, onTap: () => onTap(0)),
            _NavItem(icon: Icons.search_rounded, label: 'Rechercher', active: index == 1, onTap: () => onTap(1)),
            _PublishButton(onTap: onPublish),
            _NavItem(icon: Icons.favorite_rounded, label: 'Favoris', active: index == 2, onTap: () => onTap(2)),
            _NavItem(icon: Icons.person_rounded, label: 'Profil', active: index == 3, onTap: () => onTap(3)),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.icon, required this.label, required this.active, required this.onTap});

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? WorimoColors.primary : Colors.white.withValues(alpha: 0.6);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class _PublishButton extends StatelessWidget {
  const _PublishButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        margin: const EdgeInsets.only(top: 0),
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: WorimoColors.primary,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(color: WorimoColors.primary.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 3)),
          ],
        ),
        child: const Icon(Icons.add, color: Colors.white, size: 26),
      ),
    );
  }
}
