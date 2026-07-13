import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// Identité de marque Worimo.
class WorimoColors {
  static const primary = Color(0xFF16A34A); // vert
  static const primaryDark = Color(0xFF128A3E);
  static const night = Color(0xFF0F172A); // bleu nuit
  static const nightSoft = Color(0xFF1E293B);
  static const white = Color(0xFFFFFFFF);
}

ThemeData buildWorimoTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final textTheme = GoogleFonts.poppinsTextTheme(base.textTheme).apply(
    bodyColor: WorimoColors.white,
    displayColor: WorimoColors.white,
  );

  return base.copyWith(
    scaffoldBackgroundColor: WorimoColors.night,
    colorScheme: base.colorScheme.copyWith(
      primary: WorimoColors.primary,
      secondary: WorimoColors.primary,
      surface: WorimoColors.night,
    ),
    textTheme: textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: WorimoColors.night,
      elevation: 0,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: WorimoColors.primary,
        foregroundColor: WorimoColors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.06),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
      labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
    ),
  );
}
