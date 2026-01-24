import 'package:json_annotation/json_annotation.dart';
import 'material_kind_model.dart';
import 'material_type_model.dart';

part 'praise_material_model.g.dart';

@JsonSerializable()
class PraiseMaterialResponse {
  final String id;
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;
  @JsonKey(name: 'praise_id')
  final String praiseId;
  final String path;
  @JsonKey(name: 'is_old')
  final bool? isOld;
  @JsonKey(name: 'old_description')
  final String? oldDescription;
  @JsonKey(name: 'material_kind')
  final MaterialKindResponse? materialKind;
  @JsonKey(name: 'material_type')
  final MaterialTypeResponse? materialType;

  PraiseMaterialResponse({
    required this.id,
    required this.materialKindId,
    required this.materialTypeId,
    required this.praiseId,
    required this.path,
    this.isOld,
    this.oldDescription,
    this.materialKind,
    this.materialType,
  });

  factory PraiseMaterialResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseMaterialResponseFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseMaterialResponseToJson(this);
}

@JsonSerializable()
class PraiseMaterialCreate {
  @JsonKey(name: 'praise_id')
  final String praiseId;
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;
  final String path;
  @JsonKey(name: 'is_old')
  final bool? isOld;
  @JsonKey(name: 'old_description')
  final String? oldDescription;

  PraiseMaterialCreate({
    required this.praiseId,
    required this.materialKindId,
    required this.materialTypeId,
    required this.path,
    this.isOld,
    this.oldDescription,
  });

  factory PraiseMaterialCreate.fromJson(Map<String, dynamic> json) =>
      _$PraiseMaterialCreateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseMaterialCreateToJson(this);
}

@JsonSerializable()
class PraiseMaterialUpdate {
  @JsonKey(name: 'material_kind_id')
  final String? materialKindId;
  @JsonKey(name: 'material_type_id')
  final String? materialTypeId;
  final String? path;
  @JsonKey(name: 'is_old')
  final bool? isOld;
  @JsonKey(name: 'old_description')
  final String? oldDescription;

  PraiseMaterialUpdate({
    this.materialKindId,
    this.materialTypeId,
    this.path,
    this.isOld,
    this.oldDescription,
  });

  factory PraiseMaterialUpdate.fromJson(Map<String, dynamic> json) =>
      _$PraiseMaterialUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseMaterialUpdateToJson(this);
}

@JsonSerializable()
class PraiseMaterialSimple {
  final String id;
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;
  final String path;
  @JsonKey(name: 'is_old')
  final bool? isOld;
  @JsonKey(name: 'old_description')
  final String? oldDescription;
  @JsonKey(name: 'material_kind')
  final MaterialKindResponse? materialKind;
  @JsonKey(name: 'material_type')
  final MaterialTypeResponse? materialType;

  PraiseMaterialSimple({
    required this.id,
    required this.materialKindId,
    required this.materialTypeId,
    required this.path,
    this.isOld,
    this.oldDescription,
    this.materialKind,
    this.materialType,
  });

  factory PraiseMaterialSimple.fromJson(Map<String, dynamic> json) =>
      _$PraiseMaterialSimpleFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseMaterialSimpleToJson(this);
}

@JsonSerializable()
class DownloadUrlResponse {
  @JsonKey(name: 'download_url')
  final String downloadUrl;
  @JsonKey(name: 'expires_in')
  final int expiresIn;

  DownloadUrlResponse({
    required this.downloadUrl,
    required this.expiresIn,
  });

  factory DownloadUrlResponse.fromJson(Map<String, dynamic> json) =>
      _$DownloadUrlResponseFromJson(json);

  Map<String, dynamic> toJson() => _$DownloadUrlResponseToJson(this);
}
