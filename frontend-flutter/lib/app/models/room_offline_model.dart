import 'package:json_annotation/json_annotation.dart';

part 'room_offline_model.g.dart';

@JsonSerializable()
class PlaylistItem {
  final String materialId;
  @JsonKey(name: 'praise_id')
  final String praiseId;
  @JsonKey(name: 'praise_name')
  final String praiseName;
  @JsonKey(name: 'material_kind_id')
  final String? materialKindId;
  @JsonKey(name: 'material_kind_name')
  final String materialKindName;
  @JsonKey(name: 'material_type_name')
  final String materialTypeName; // 'PDF' ou 'TEXT'
  final int order;

  PlaylistItem({
    required this.materialId,
    required this.praiseId,
    required this.praiseName,
    this.materialKindId,
    required this.materialKindName,
    required this.materialTypeName,
    required this.order,
  });

  factory PlaylistItem.fromJson(Map<String, dynamic> json) =>
      _$PlaylistItemFromJson(json);

  Map<String, dynamic> toJson() => _$PlaylistItemToJson(this);

  PlaylistItem copyWith({
    String? materialId,
    String? praiseId,
    String? praiseName,
    String? materialKindId,
    String? materialKindName,
    String? materialTypeName,
    int? order,
  }) {
    return PlaylistItem(
      materialId: materialId ?? this.materialId,
      praiseId: praiseId ?? this.praiseId,
      praiseName: praiseName ?? this.praiseName,
      materialKindId: materialKindId ?? this.materialKindId,
      materialKindName: materialKindName ?? this.materialKindName,
      materialTypeName: materialTypeName ?? this.materialTypeName,
      order: order ?? this.order,
    );
  }
}

@JsonSerializable()
class RoomOfflineState {
  final String? roomId;
  @JsonKey(name: 'praise_ids')
  final List<String> praiseIds;
  final List<PlaylistItem> playlist;
  @JsonKey(name: 'current_material_index')
  final int? currentMaterialIndex;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  RoomOfflineState({
    this.roomId,
    required this.praiseIds,
    required this.playlist,
    this.currentMaterialIndex,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RoomOfflineState.fromJson(Map<String, dynamic> json) =>
      _$RoomOfflineStateFromJson(json);

  Map<String, dynamic> toJson() => _$RoomOfflineStateToJson(this);

  RoomOfflineState copyWith({
    String? roomId,
    List<String>? praiseIds,
    List<PlaylistItem>? playlist,
    int? currentMaterialIndex,
    String? createdAt,
    String? updatedAt,
  }) {
    return RoomOfflineState(
      roomId: roomId ?? this.roomId,
      praiseIds: praiseIds ?? this.praiseIds,
      playlist: playlist ?? this.playlist,
      currentMaterialIndex: currentMaterialIndex ?? this.currentMaterialIndex,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory RoomOfflineState.empty() {
    final now = DateTime.now().toIso8601String();
    return RoomOfflineState(
      roomId: null,
      praiseIds: [],
      playlist: [],
      currentMaterialIndex: null,
      createdAt: now,
      updatedAt: now,
    );
  }
}
