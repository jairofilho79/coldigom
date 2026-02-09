import 'package:json_annotation/json_annotation.dart';

part 'offline_material_metadata.g.dart';

@JsonSerializable()
class OfflineMaterialMetadata {
  final String materialId;
  @JsonKey(name: 'praise_id')
  final String praiseId;
  @JsonKey(name: 'material_kind_id')
  final String materialKindId;
  @JsonKey(name: 'material_type_id')
  final String materialTypeId;
  @JsonKey(name: 'file_name')
  final String fileName;
  @JsonKey(name: 'file_path')
  final String filePath;
  @JsonKey(name: 'file_size')
  final int fileSize;
  @JsonKey(name: 'downloaded_at')
  final DateTime downloadedAt;
  @JsonKey(name: 'last_accessed_at')
  final DateTime? lastAccessedAt;
  @JsonKey(name: 'is_kept_offline')
  final bool isKeptOffline; // true = keep offline, false = temporário
  @JsonKey(name: 'version_hash')
  final String? versionHash; // SHA256 do arquivo
  @JsonKey(name: 'version_timestamp')
  final DateTime? versionTimestamp; // updated_at do backend
  @JsonKey(name: 'is_old')
  final bool isOld; // material marcado como antigo
  @JsonKey(name: 'old_description')
  final String? oldDescription;

  OfflineMaterialMetadata({
    required this.materialId,
    required this.praiseId,
    required this.materialKindId,
    required this.materialTypeId,
    required this.fileName,
    required this.filePath,
    required this.fileSize,
    required this.downloadedAt,
    this.lastAccessedAt,
    this.isKeptOffline = false,
    this.versionHash,
    this.versionTimestamp,
    this.isOld = false,
    this.oldDescription,
  });

  factory OfflineMaterialMetadata.fromJson(Map<String, dynamic> json) =>
      _$OfflineMaterialMetadataFromJson(json);

  Map<String, dynamic> toJson() => _$OfflineMaterialMetadataToJson(this);

  OfflineMaterialMetadata copyWith({
    String? materialId,
    String? praiseId,
    String? materialKindId,
    String? materialTypeId,
    String? fileName,
    String? filePath,
    int? fileSize,
    DateTime? downloadedAt,
    DateTime? lastAccessedAt,
    bool? isKeptOffline,
    String? versionHash,
    DateTime? versionTimestamp,
    bool? isOld,
    String? oldDescription,
  }) {
    return OfflineMaterialMetadata(
      materialId: materialId ?? this.materialId,
      praiseId: praiseId ?? this.praiseId,
      materialKindId: materialKindId ?? this.materialKindId,
      materialTypeId: materialTypeId ?? this.materialTypeId,
      fileName: fileName ?? this.fileName,
      filePath: filePath ?? this.filePath,
      fileSize: fileSize ?? this.fileSize,
      downloadedAt: downloadedAt ?? this.downloadedAt,
      lastAccessedAt: lastAccessedAt ?? this.lastAccessedAt,
      isKeptOffline: isKeptOffline ?? this.isKeptOffline,
      versionHash: versionHash ?? this.versionHash,
      versionTimestamp: versionTimestamp ?? this.versionTimestamp,
      isOld: isOld ?? this.isOld,
      oldDescription: oldDescription ?? this.oldDescription,
    );
  }
}
