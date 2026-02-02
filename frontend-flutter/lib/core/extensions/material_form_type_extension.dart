import 'package:flutter/material.dart';
import '../../core/i18n/generated/app_localizations.dart';

extension MaterialFormTypeExtension on MaterialFormType {
  /// Retorna o nome localizado do tipo de material
  String localizedName(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (l10n == null) return name;

    switch (this) {
      case MaterialFormType.file:
        return l10n.enumMaterialFormTypeFile;
      case MaterialFormType.youtube:
        return l10n.enumMaterialFormTypeYoutube;
      case MaterialFormType.spotify:
        return l10n.enumMaterialFormTypeSpotify;
      case MaterialFormType.text:
        return l10n.enumMaterialFormTypeText;
    }
  }
}
