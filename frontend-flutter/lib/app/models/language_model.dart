import 'package:json_annotation/json_annotation.dart';

part 'language_model.g.dart';

@JsonSerializable()
class LanguageResponse {
  final String code;
  final String name;
  @JsonKey(name: 'is_active')
  final bool isActive;

  LanguageResponse({
    required this.code,
    required this.name,
    required this.isActive,
  });

  factory LanguageResponse.fromJson(Map<String, dynamic> json) =>
      _$LanguageResponseFromJson(json);

  Map<String, dynamic> toJson() => _$LanguageResponseToJson(this);
}

@JsonSerializable()
class LanguageCreate {
  final String code;
  final String name;
  @JsonKey(name: 'is_active')
  final bool isActive;

  LanguageCreate({
    required this.code,
    required this.name,
    this.isActive = true,
  });

  factory LanguageCreate.fromJson(Map<String, dynamic> json) =>
      _$LanguageCreateFromJson(json);

  Map<String, dynamic> toJson() => _$LanguageCreateToJson(this);
}

@JsonSerializable()
class LanguageUpdate {
  final String? name;
  @JsonKey(name: 'is_active')
  final bool? isActive;

  LanguageUpdate({
    this.name,
    this.isActive,
  });

  factory LanguageUpdate.fromJson(Map<String, dynamic> json) =>
      _$LanguageUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$LanguageUpdateToJson(this);
}
