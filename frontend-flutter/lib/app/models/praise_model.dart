import 'package:json_annotation/json_annotation.dart';
import 'praise_tag_model.dart';
import 'praise_material_model.dart';

part 'praise_model.g.dart';

@JsonSerializable()
class ReviewHistoryEvent {
  final String type; // 'in_review' | 'review_cancelled' | 'review_finished'
  final String date;

  ReviewHistoryEvent({
    required this.type,
    required this.date,
  });

  factory ReviewHistoryEvent.fromJson(Map<String, dynamic> json) =>
      _$ReviewHistoryEventFromJson(json);

  Map<String, dynamic> toJson() => _$ReviewHistoryEventToJson(this);
}

@JsonSerializable()
class PraiseResponse {
  final String id;
  final String name;
  final int? number;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
  final String updatedAt;
  final List<PraiseTagSimple> tags;
  final List<PraiseMaterialSimple> materials;
  @JsonKey(name: 'in_review')
  final bool inReview;
  @JsonKey(name: 'in_review_description')
  final String? inReviewDescription;
  @JsonKey(name: 'review_history')
  final List<ReviewHistoryEvent> reviewHistory;

  PraiseResponse({
    required this.id,
    required this.name,
    this.number,
    required this.createdAt,
    required this.updatedAt,
    required this.tags,
    required this.materials,
    required this.inReview,
    this.inReviewDescription,
    required this.reviewHistory,
  });

  factory PraiseResponse.fromJson(Map<String, dynamic> json) =>
      _$PraiseResponseFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseResponseToJson(this);
}

@JsonSerializable()
class PraiseCreate {
  final String name;
  final int? number;
  @JsonKey(name: 'tag_ids')
  final List<String>? tagIds;
  final List<PraiseMaterialCreate>? materials;
  @JsonKey(name: 'in_review')
  final bool? inReview;
  @JsonKey(name: 'in_review_description')
  final String? inReviewDescription;

  PraiseCreate({
    required this.name,
    this.number,
    this.tagIds,
    this.materials,
    this.inReview,
    this.inReviewDescription,
  });

  factory PraiseCreate.fromJson(Map<String, dynamic> json) =>
      _$PraiseCreateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseCreateToJson(this);
}

@JsonSerializable()
class PraiseUpdate {
  final String? name;
  final int? number;
  @JsonKey(name: 'tag_ids')
  final List<String>? tagIds;
  @JsonKey(name: 'in_review_description')
  final String? inReviewDescription;

  PraiseUpdate({
    this.name,
    this.number,
    this.tagIds,
    this.inReviewDescription,
  });

  factory PraiseUpdate.fromJson(Map<String, dynamic> json) =>
      _$PraiseUpdateFromJson(json);

  Map<String, dynamic> toJson() => _$PraiseUpdateToJson(this);
}

@JsonSerializable()
class ReviewActionRequest {
  final String action; // 'start' | 'cancel' | 'finish'
  @JsonKey(name: 'in_review_description')
  final String? inReviewDescription;

  ReviewActionRequest({
    required this.action,
    this.inReviewDescription,
  });

  factory ReviewActionRequest.fromJson(Map<String, dynamic> json) =>
      _$ReviewActionRequestFromJson(json);

  Map<String, dynamic> toJson() => _$ReviewActionRequestToJson(this);
}
