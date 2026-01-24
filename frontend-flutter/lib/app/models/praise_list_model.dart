import 'package:json_annotation/json_annotation.dart';

part 'praise_list_model.g.dart';

@JsonSerializable()
class PraiseListResponse {
  final String id;
  final String name;
  final String? description;
  @JsonKey(name: 'is_public')
  final bool isPublic;
  @JsonKey(name: 'user_id')
  final String userId;
  final String? owner;
  @JsonKey(name: 'praises_count')
  final int praisesCount;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  PraiseListResponse({
    required this.id,
    required this.name,
    this.description,
    required this.isPublic,
    required this.userId,
    this.owner,
    required this.praisesCount,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PraiseListResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseListResponseFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseListResponseToJson(this);
}

@JsonSerializable()
class PraiseListCreate {
  final String name;
  final String? description;
  @JsonKey(name: 'is_public')
  final bool? isPublic;

  PraiseListCreate({
    required this.name,
    this.description,
    this.isPublic,
  });

  factory PraiseListCreate.fromJson(Map<String, dynamic> json) =>
      _$PraiseListCreateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseListCreateToJson(this);
}

@JsonSerializable()
class PraiseListUpdate {
  final String? name;
  final String? description;
  @JsonKey(name: 'is_public')
  final bool? isPublic;

  PraiseListUpdate({
    this.name,
    this.description,
    this.isPublic,
  });

  factory PraiseListUpdate.fromJson(Map<String, dynamic> json) =>
      _$PraiseListUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseListUpdateToJson(this);
}

@JsonSerializable()
class PraiseInList {
  final String id;
  final String name;
  final int? number;
  final int order;

  PraiseInList({
    required this.id,
    required this.name,
    this.number,
    required this.order,
  });

  factory PraiseInList.fromJson(Map<String, dynamic> json) =>
      _$PraiseInListFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseInListToJson(this);
}

@JsonSerializable()
class PraiseListDetailResponse extends PraiseListResponse {
  final List<PraiseInList> praises;
  @JsonKey(name: 'is_owner')
  final bool isOwner;
  @JsonKey(name: 'is_following')
  final bool isFollowing;

  PraiseListDetailResponse({
    required super.id,
    required super.name,
    super.description,
    required super.isPublic,
    required super.userId,
    super.owner,
    required super.praisesCount,
    required super.createdAt,
    required super.updatedAt,
    required this.praises,
    required this.isOwner,
    required this.isFollowing,
  });

  factory PraiseListDetailResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseListDetailResponseFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$PraiseListDetailResponseToJson(this);
}

@JsonSerializable()
class ReorderPraisesRequest {
  @JsonKey(name: 'praise_orders')
  final List<PraiseOrder> praiseOrders;

  ReorderPraisesRequest({required this.praiseOrders});

  factory ReorderPraisesRequest.fromJson(Map<String, dynamic> json) =>
      _$ReorderPraisesRequestFromJson(json);

  Map<String, dynamic> toJson() => _$ReorderPraisesRequestToJson(this);
}

@JsonSerializable()
class PraiseOrder {
  @JsonKey(name: 'praise_id')
  final String praiseId;
  final int order;

  PraiseOrder({
    required this.praiseId,
    required this.order,
  });

  factory PraiseOrder.fromJson(Map<String, dynamic> json) =>
      _$PraiseOrderFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseOrderToJson(this);
}
