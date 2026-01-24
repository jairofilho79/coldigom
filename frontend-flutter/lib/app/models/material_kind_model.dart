import 'package:json_annotation/json_annotation.dart';

part 'material_kind_model.g.dart';

@JsonSerializable()
class MaterialKindResponse {
  final String id;
  final String name;

  MaterialKindResponse({
    required this.id,
    required this.name,
  });

  factory MaterialKindResponse.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindResponseFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindResponseToJson(this);
}

@JsonSerializable()
class MaterialKindCreate {
  final String name;

  MaterialKindCreate({required this.name});

  factory MaterialKindCreate.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindCreateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindCreateToJson(this);
}

@JsonSerializable()
class MaterialKindUpdate {
  final String? name;

  MaterialKindUpdate({this.name});

  factory MaterialKindUpdate.fromJson(Map<String, dynamic> json) =>
      _$MaterialKindUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$MaterialKindUpdateToJson(this);
}
