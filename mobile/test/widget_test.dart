// Smoke test : sans variables Supabase (--dart-define), l'app affiche l'écran
// "configuration manquante" — on vérifie simplement qu'elle se construit.

import 'package:flutter_test/flutter_test.dart';
import 'package:worimo/main.dart';

void main() {
  testWidgets('L\'app se construit sans configuration', (WidgetTester tester) async {
    await tester.pumpWidget(const WorimoApp());
    expect(find.text('Configuration manquante'), findsOneWidget);
  });
}
