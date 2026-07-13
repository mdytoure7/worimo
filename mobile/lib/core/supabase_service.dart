import 'package:supabase_flutter/supabase_flutter.dart';
import 'config.dart';

/// Accès centralisé au client Supabase (auth, PostgREST, Edge Functions).
/// Clé anon uniquement — la RLS reste la vraie barrière.
class SupabaseService {
  static Future<void> init() async {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;

  static Session? get session => client.auth.currentSession;
  static User? get user => client.auth.currentUser;
  static bool get isLoggedIn => session != null;
}
