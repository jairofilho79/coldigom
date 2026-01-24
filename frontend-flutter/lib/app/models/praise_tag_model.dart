import 'package:json_annotation/json_annotation.dart';

part 'praise_tag_model.g.dart';

@JsonSerializable()
class PraiseTagResponse {
  final String id;
  final String name;

  PraiseTagResponse({
    required this.id,
    required this.name,
  });

  factory PraiseTagResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagResponseFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagResponseToJson(this);
}

@JsonSerializable()
class PraiseTagCreate {
  final String name;

  PraiseTagCreate({required this.name});

  factory PraiseTagCreate.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagCreateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagCreateToJson(this);
}

@JsonSerializable()
class PraiseTagUpdate {
  final String? name;

  PraiseTagUpdate({this.name});

  factory PraiseTagUpdate.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagUpdateToJson(this);
}

@JsonSerializable()
class PraiseTagSimple {
  final String id;
  final String name;

  PraiseTagSimple({
    required this.id,
    required this.name,
  });

  factory PraiseTagSimple.fromJson(Map<String, dynamic> json) =>
      _$PraiseTagSimpleFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseTagSimpleToJson(this);
}
