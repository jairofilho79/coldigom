import 'package:json_annotation/json_annotation.dart';
import 'material_kind_model.dart';

part 'user_preference_model.g.dart';

@JsonSerializable()
class UserMaterialKindPreferenceResponse {
  final String id;
  @JsonKey(name: 'user_id')
  final String userId;
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  final int order;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
  final String updatedAt;
  @JsonKey(name: 'material_kind')
  final MaterialKindResponse? materialKind;

  UserMaterialKindPreferenceResponse({
    required this.id,
    required this.userId,
    required this.materialKindId,
    required this.order,
    required this.createdAt,
    required this.updatedAt,
    this.materialKind,
  });

  factory UserMaterialKindPreferenceResponse.fromJson(
          Map<String, dynamic> json) =>
      _$UserMaterialKindPreferenceResponseFromJson(json);

  Map<String, dynamic> toJson() =>
      _$UserMaterialKindPreferenceResponseToJson(this);
}

@JsonSerializable()
class MaterialKindOrderUpdate {
  @JsonKey(name: 'material_kind_ids')
  final List<String> materialKindIds;

  MaterialKindOrderUpdate({required this.materialKindIds});

  factory MaterialKindOrderUpdate.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindOrderUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindOrderUpdateToJson(this);
}
