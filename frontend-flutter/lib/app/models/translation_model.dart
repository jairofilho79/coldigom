import 'package:json_annotation/json_annotation.dart';

part 'translation_model.g.dart';

@JsonSerializable()
class TranslationBase {
  final String id;
  @JsonKey(name: 'language_code')
  final String languageCode;
  @JsonKey(name: 'translated_name')
  final String translatedName;

  TranslationBase({
    required this.id,
    required this.languageCode,
    required this.translatedName,
  });

  factory TranslationBase.fromJson(Map<String, dynamic> json) =>
      _$TranslationBaseFromJson(json);

  Map<String, dynamic> toJson() => _$TranslationBaseToJson(this);
}

@JsonSerializable()
class MaterialKindTranslationResponse extends TranslationBase {
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;

  MaterialKindTranslationResponse({
    required super.id,
    required super.languageCode,
    required super.translatedName,
    required this.materialKindId,
  });

  factory MaterialKindTranslationResponse.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindTranslationResponseFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$MaterialKindTranslationResponseToJson(this);
}

@JsonSerializable()
class PraiseTagTranslationResponse extends TranslationBase {
  @JsonKey(name: 'praise_tag_id')
  final String praiseTagId;

  PraiseTagTranslationResponse({
    required super.id,
    required super.languageCode,
    required super.translatedName,
    required this.praiseTagId,
  });

  factory PraiseTagTranslationResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagTranslationResponseFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$PraiseTagTranslationResponseToJson(this);
}

@JsonSerializable()
class MaterialTypeTranslationResponse extends TranslationBase {
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;

  MaterialTypeTranslationResponse({
    required super.id,
    required super.languageCode,
    required super.translatedName,
    required this.materialTypeId,
  });

  factory MaterialTypeTranslationResponse.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeTranslationResponseFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$MaterialTypeTranslationResponseToJson(this);
}

@JsonSerializable()
class MaterialKindTranslationCreate {
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  @JsonKey(name: 'language_code')
  final String languageCode;
  @JsonKey(name: 'translated_name')
  final String translatedName;

  MaterialKindTranslationCreate({
    required this.materialKindId,
    required this.languageCode,
    required this.translatedName,
  });

  factory MaterialKindTranslationCreate.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindTranslationCreateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindTranslationCreateToJson(this);
}

@JsonSerializable()
class PraiseTagTranslationCreate {
  @JsonKey(name: 'praise_tag_id')
  final String praiseTagId;
  @JsonKey(name: 'language_code')
  final String languageCode;
  @JsonKey(name: 'translated_name')
  final String translatedName;

  PraiseTagTranslationCreate({
    required this.praiseTagId,
    required this.languageCode,
    required this.translatedName,
  });

  factory PraiseTagTranslationCreate.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagTranslationCreateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagTranslationCreateToJson(this);
}

@JsonSerializable()
class MaterialTypeTranslationCreate {
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;
  @JsonKey(name: 'language_code')
  final String languageCode;
  @JsonKey(name: 'translated_name')
  final String translatedName;

  MaterialTypeTranslationCreate({
    required this.materialTypeId,
    required this.languageCode,
    required this.translatedName,
  });

  factory MaterialTypeTranslationCreate.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeTranslationCreateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialTypeTranslationCreateToJson(this);
}

@JsonSerializable()
class MaterialKindTranslationUpdate {
  @JsonKey(name: 'translated_name')
  final String? translatedName;

  MaterialKindTranslationUpdate({this.translatedName});

  factory MaterialKindTranslationUpdate.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindTranslationUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindTranslationUpdateToJson(this);
}

@JsonSerializable()
class PraiseTagTranslationUpdate {
  @JsonKey(name: 'translated_name')
  final String? translatedName;

  PraiseTagTranslationUpdate({this.translatedName});

  factory PraiseTagTranslationUpdate.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagTranslationUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagTranslationUpdateToJson(this);
}

@JsonSerializable()
class MaterialTypeTranslationUpdate {
  @JsonKey(name: 'translated_name')
  final String? translatedName;

  MaterialTypeTranslationUpdate({this.translatedName});

  factory MaterialTypeTranslationUpdate.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeTranslationUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialTypeTranslationUpdateToJson(this);
}
