import 'package:json_annotation/json_annotation.dart';

part 'room_model.g.dart';

enum RoomAccessType {
  @JsonValue('public')
  public,
  @JsonValue('password')
  password,
  @JsonValue('approval')
  approval,
}

enum RoomJoinRequestStatus {
  @JsonValue('pending')
  pending,
  @JsonValue('approved')
  approved,
  @JsonValue('rejected')
  rejected,
}

@JsonSerializable()
class RoomResponse {
  final String id;
  final String code;
  final String name;
  final String? description;
  @JsonKey(name: 'creator_id')
  final String creatorId;
  @JsonKey(name: 'access_type')
  final RoomAccessType accessType;
  @JsonKey(name: 'is_open_for_requests')
  final bool? isOpenForRequests;
  @JsonKey(name: 'auto_destroy_on_empty')
  final bool autoDestroyOnEmpty;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
  final String updatedAt;
  @JsonKey(name: 'last_activity_at')
  final String lastActivityAt;
  @JsonKey(name: 'participants_count')
  final int participantsCount;
  @JsonKey(name: 'praises_count')
  final int praisesCount;

  RoomResponse({
    required this.id,
    required this.code,
    required this.name,
    this.description,
    required this.creatorId,
    required this.accessType,
    this.isOpenForRequests,
    required this.autoDestroyOnEmpty,
    required this.createdAt,
    required this.updatedAt,
    required this.lastActivityAt,
    required this.participantsCount,
    required this.praisesCount,
  });

  factory RoomResponse.fromJson(Map<String, dynamic> json) =>
      _$RoomResponseFromJson(json);

  Map<String, dynamic> toJson() => _$RoomResponseToJson(this);
}

@JsonSerializable()
class RoomCreate {
  final String name;
  final String? description;
  @JsonKey(name: 'access_type')
  final RoomAccessType accessType;
  final String? password;
  @JsonKey(name: 'is_open_for_requests')
  final bool? isOpenForRequests;
  @JsonKey(name: 'auto_destroy_on_empty')
  final bool autoDestroyOnEmpty;

  RoomCreate({
    required this.name,
    this.description,
    required this.accessType,
    this.password,
    this.isOpenForRequests,
    required this.autoDestroyOnEmpty,
  });

  factory RoomCreate.fromJson(Map<String, dynamic> json) =>
      _$RoomCreateFromJson(json);

  Map<String, dynamic> toJson() => _$RoomCreateToJson(this);
}

@JsonSerializable()
class RoomMessageResponse {
  final String id;
  @JsonKey(name: 'room_id')
  final String roomId;
  @JsonKey(name: 'user_id')
  final String userId;
  final String username;
  @JsonKey(name: 'material_kind_name')
  final String? materialKindName;
  final String message;
  @JsonKey(name: 'created_at')
  final String createdAt;

  RoomMessageResponse({
    required this.id,
    required this.roomId,
    required this.userId,
    required this.username,
    this.materialKindName,
    required this.message,
    required this.createdAt,
  });

  factory RoomMessageResponse.fromJson(Map<String, dynamic> json) =>
      _$RoomMessageResponseFromJson(json);

  Map<String, dynamic> toJson() => _$RoomMessageResponseToJson(this);
}

@JsonSerializable()
class RoomMessageCreate {
  final String message;

  RoomMessageCreate({required this.message});

  factory RoomMessageCreate.fromJson(Map<String, dynamic> json) =>
      _$RoomMessageCreateFromJson(json);

  Map<String, dynamic> toJson() => _$RoomMessageCreateToJson(this);
}
