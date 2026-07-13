// Configuration d'environnement — injectée au build via --dart-define,
// jamais de secret en dur. La clé anon est publique par nature (la RLS
// PostgreSQL est la vraie barrière de sécurité).
//
// Lancement local (émulateur Android → l'hôte est 10.0.2.2) :
//   flutter run \
//     --dart-define=SUPABASE_URL=http://10.0.2.2:56321 \
//     --dart-define=SUPABASE_ANON_KEY=<clé anon locale>
//
// Appareil physique : remplacer par l'IP LAN du PC (ex. http://192.168.1.20:56321).

class AppConfig {
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'http://10.0.2.2:56321',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  static bool get isConfigured => supabaseAnonKey.isNotEmpty;
}
