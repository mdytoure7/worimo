import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase_service.dart';
import '../../core/theme.dart';

/// Connexion / inscription par email + mot de passe.
///
/// L'OTP téléphone est prêt côté backend (Supabase) mais nécessite un
/// fournisseur SMS configuré ; on démarre avec l'email comme le web.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

enum _Mode { login, signup }

class _LoginScreenState extends State<LoginScreen> {
  _Mode _mode = _Mode.login;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  String _role = 'buyer';
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _fullName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final auth = SupabaseService.client.auth;
      if (_mode == _Mode.signup) {
        await auth.signUp(
          email: _email.text.trim(),
          password: _password.text,
          data: {'full_name': _fullName.text.trim(), 'role': _role},
        );
      } else {
        await auth.signInWithPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Une erreur est survenue');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSignup = _mode == _Mode.signup;
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RichText(
                    text: const TextSpan(
                      children: [
                        TextSpan(
                          text: 'Wori',
                          style: TextStyle(
                              color: WorimoColors.primary,
                              fontWeight: FontWeight.bold,
                              fontSize: 32),
                        ),
                        TextSpan(
                          text: 'mo',
                          style: TextStyle(
                              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 32),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Trouvez. Vérifiez. Achetez en confiance.',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
                  const SizedBox(height: 32),
                  // Onglets
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      children: [
                        _tab('Connexion', _Mode.login),
                        _tab('Inscription', _Mode.signup),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (isSignup) ...[
                    _field(_fullName, 'Nom complet', hint: 'Fatou Ndiaye'),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: _role,
                      decoration: const InputDecoration(labelText: 'Je suis'),
                      dropdownColor: WorimoColors.nightSoft,
                      items: const [
                        DropdownMenuItem(value: 'buyer', child: Text('Acheteur / visiteur')),
                        DropdownMenuItem(value: 'seller', child: Text('Vendeur particulier')),
                        DropdownMenuItem(value: 'agency', child: Text('Agence immobilière')),
                      ],
                      onChanged: (v) => setState(() => _role = v ?? 'buyer'),
                    ),
                    const SizedBox(height: 16),
                  ],
                  _field(_email, 'Email',
                      keyboardType: TextInputType.emailAddress, hint: 'vous@exemple.com'),
                  const SizedBox(height: 16),
                  _field(_password, 'Mot de passe', obscure: true),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5))),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(isSignup ? 'Créer mon compte' : 'Se connecter'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tab(String label, _Mode mode) {
    final active = _mode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _mode = mode;
          _error = null;
        }),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? WorimoColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: active ? Colors.white : Colors.white.withValues(alpha: 0.7),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool obscure = false,
    String? hint,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      decoration: InputDecoration(labelText: label, hintText: hint),
    );
  }
}
