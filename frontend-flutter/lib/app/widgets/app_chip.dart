import 'package:flutter/material.dart';

/// Chip customizado mobile-first com variantes
class AppChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool deletable;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;
  final Color? backgroundColor;
  final Color? textColor;

  const AppChip({
    super.key,
    required this.label,
    this.selected = false,
    this.deletable = false,
    this.onTap,
    this.onDelete,
    this.backgroundColor,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    if (deletable) {
      return Chip(
        label: Text(label),
        onDeleted: onDelete,
        backgroundColor: backgroundColor,
        deleteIconColor: textColor,
        visualDensity: VisualDensity.compact,
      );
    }

    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: onTap != null ? (_) => onTap!() : null,
      backgroundColor: backgroundColor,
      selectedColor: Theme.of(context).colorScheme.primaryContainer,
      labelStyle: TextStyle(color: textColor),
      visualDensity: VisualDensity.compact,
    );
  }
}
