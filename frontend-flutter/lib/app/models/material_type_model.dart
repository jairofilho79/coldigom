import 'package:json_annotation/json_annotation.dart';

part 'material_type_model.g.dart';

@JsonSerializable()
class MaterialTypeResponse {
  final String id;
  final String name;

  MaterialTypeResponse({
    required this.id,
    required this.name,
  });

  factory MaterialTypeResponse.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeResponseFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialTypeResponseToJson(this);
}

@JsonSerializable()
class MaterialTypeCreate {
  final String name;

  MaterialTypeCreate({required this.name});

  factory MaterialTypeCreate.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeCreateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialTypeCreateToJson(this);
}

@JsonSerializable()
class MaterialTypeUpdate {
  final String? name;

  MaterialTypeUpdate({this.name});

  factory MaterialTypeUpdate.fromJson(Map<String, dynamic> json) =>
      _$MaterialTypeUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialTypeUpdateToJson(this);
}
