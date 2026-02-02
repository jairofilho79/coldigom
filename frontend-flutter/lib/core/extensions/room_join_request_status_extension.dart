import 'package:flutter/material.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../../app/models/room_model.dart';

extension RoomJoinRequestStatusExtension on RoomJoinRequestStatus {
  /// Retorna o nome localizado do status da solicitação
  String localizedName(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (l10n == null) return name;

    switch (this) {
      case RoomJoinRequestStatus.pending:
        return l10n.enumRoomJoinRequestStatusPending;
      case RoomJoinRequestStatus.approved:
        return l10n.enumRoomJoinRequestStatusApproved;
      case RoomJoinRequestStatus.rejected:
        return l10n.enumRoomJoinRequestStatusRejected;
    }
  }
}
