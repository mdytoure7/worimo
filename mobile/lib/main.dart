import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';

import 'core/config.dart';
import 'core/supabase_service.dart';
import 'core/theme.dart';
import 'data/favorites_store.dart';
import 'features/auth/login_screen.dart';
import 'features/favorites/favorites_screen.dart';
import 'features/feed/feed_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/property/property_detail_screen.dart';
import 'features/publish/publish_screen.dart';
import 'features/search/search_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized(); // moteur de lecture vidéo (libmpv)

  if (AppConfig.isConfigured) {
    await SupabaseService.init();
  }

  runApp(const WorimoApp());
}

class WorimoApp extends StatelessWidget {
  const WorimoApp({super.key});

  @override
  Widget build(BuildContext context) {
    if (!AppConfig.isConfigured) {
      return MaterialApp(
        theme: buildWorimoTheme(),
        home: const _ConfigMissingScreen(),
      );
    }

    return ChangeNotifierProvider(
      create: (_) => FavoritesStore(),
      child: MaterialApp(
        title: 'Worimo',
        debugShowCheckedModeBanner: false,
        theme: buildWorimoTheme(),
        initialRoute: '/',
        onGenerateRoute: (settings) {
          switch (settings.name) {
            case '/':
              return _route(const FeedScreen());
            case '/login':
              return _route(const LoginScreen());
            case '/search':
              return _route(const SearchScreen());
            case '/favorites':
              return _route(const FavoritesScreen());
            case '/profile':
              return _route(const ProfileScreen());
            case '/publish':
              return _route(const PublishScreen());
            case '/property':
              return _route(PropertyDetailScreen(propertyId: settings.arguments as String));
            default:
              return _route(const FeedScreen());
          }
        },
      ),
    );
  }

  MaterialPageRoute _route(Widget child) => MaterialPageRoute(builder: (_) => child);
}

/// Affiché si l'app est lancée sans --dart-define=SUPABASE_ANON_KEY.
class _ConfigMissingScreen extends StatelessWidget {
  const _ConfigMissingScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.settings, size: 48, color: WorimoColors.primary),
              const SizedBox(height: 16),
              const Text('Configuration manquante',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(
                'Lancez l\'app avec les variables Supabase :\n\n'
                'flutter run \\\n'
                '  --dart-define=SUPABASE_URL=http://10.0.2.2:56321 \\\n'
                '  --dart-define=SUPABASE_ANON_KEY=<clé anon>',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7),
                    fontFamily: 'monospace',
                    fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
