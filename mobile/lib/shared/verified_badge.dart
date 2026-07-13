import 'package:flutter/material.dart';
import '../core/models.dart';
import '../core/theme.dart';

/// Badge de vérification foncière — le différenciateur Worimo.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, required this.verification, this.compact = false});

  final Verification? verification;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final v = verification;
    if (v == null) return const SizedBox.shrink();

    final (label, color, icon) = switch (v.status) {
      'verified' => ('Vérifié Worimo', WorimoColors.primary, Icons.verified),
      'in_review' => ('Vérification en cours', const Color(0xFFF59E0B), Icons.hourglass_top),
      _ => ('', Colors.transparent, Icons.help),
    };
    if (label.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 4 : 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 13 : 15, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: compact ? 11 : 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
