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
class RoomUpdate {
  final String? name;
  final String? description;
  @JsonKey(name: 'access_type')
  final RoomAccessType? accessType;
  final String? password;
  @JsonKey(name: 'is_open_for_requests')
  final bool? isOpenForRequests;
  @JsonKey(name: 'auto_destroy_on_empty')
  final bool? autoDestroyOnEmpty;

  RoomUpdate({
    this.name,
    this.description,
    this.accessType,
    this.password,
    this.isOpenForRequests,
    this.autoDestroyOnEmpty,
  });

  factory RoomUpdate.fromJson(Map<String, dynamic> json) =>
      _$RoomUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$RoomUpdateToJson(this);
}

@JsonSerializable()
class RoomDetailResponse extends RoomResponse {
  @JsonKey(name: 'creator_username')
  final String? creatorUsername;
  @JsonKey(name: 'is_creator')
  final bool isCreator;
  @JsonKey(name: 'is_participant')
  final bool isParticipant;
  final List<Map<String, dynamic>> praises;
  final List<Map<String, dynamic>> participants;

  RoomDetailResponse({
    required super.id,
    required super.code,
    required super.name,
    super.description,
    required super.creatorId,
    required super.accessType,
    super.isOpenForRequests,
    required super.autoDestroyOnEmpty,
    required super.createdAt,
    required super.updatedAt,
    required super.lastActivityAt,
    required super.participantsCount,
    required super.praisesCount,
    this.creatorUsername,
    required this.isCreator,
    required this.isParticipant,
    required this.praises,
    required this.participants,
  });

  factory RoomDetailResponse.fromJson(Map<String, dynamic> json) =>
      _$RoomDetailResponseFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$RoomDetailResponseToJson(this);
}

@JsonSerializable()
class RoomJoinRequest {
  final String? password;

  RoomJoinRequest({this.password});

  factory RoomJoinRequest.fromJson(Map<String, dynamic> json) =>
      _$RoomJoinRequestFromJson(json);

  Map<String, dynamic> toJson() => _$RoomJoinRequestToJson(this);
}

@JsonSerializable()
class RoomPraiseReorder {
  @JsonKey(name: 'praise_orders')
  final List<Map<String, dynamic>> praiseOrders;

  RoomPraiseReorder({required this.praiseOrders});

  factory RoomPraiseReorder.fromJson(Map<String, dynamic> json) =>
      _$RoomPraiseReorderFromJson(json);

  Map<String, dynamic> toJson() => _$RoomPraiseReorderToJson(this);
}

@JsonSerializable()
class RoomMessageCreate {
  final String message;

  RoomMessageCreate({required this.message});

  factory RoomMessageCreate.fromJson(Map<String, dynamic> json) =>
      _$RoomMessageCreateFromJson(json);

  Map<String, dynamic> toJson() => _$RoomMessageCreateToJson(this);
}
