import 'package:flutter/material.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../app/models/room_model.dart';

extension RoomAccessTypeExtension on RoomAccessType {
  /// Retorna o nome localizado do tipo de acesso
  String localizedName(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (l10n == null) return name;

    switch (this) {
      case RoomAccessType.public:
        return l10n.enumRoomAccessTypePublic;
      case RoomAccessType.password:
        return l10n.enumRoomAccessTypePassword;
      case RoomAccessType.approval:
        return l10n.enumRoomAccessTypeApproval;
    }
  }
}
