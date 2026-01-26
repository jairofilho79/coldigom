import 'package:flutter/material.dart';

/// Chip para filtros selecionáveis múltiplos
class AppFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final ValueChanged<bool>? onSelected;
  final Color? selectedColor;
  final Color? backgroundColor;

  const AppFilterChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onSelected,
    this.selectedColor,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
      selectedColor: selectedColor ?? Theme.of(context).colorScheme.primaryContainer,
      backgroundColor: backgroundColor,
      visualDensity: VisualDensity.compact,
    );
  }
}
