/// Estado de uma lista de praises criada/editada offline
class OfflineListState {
  final String? id;
  final String name;
  final String? description;
  final List<String> praiseIds;
  final String createdAt;
  final String updatedAt;
  final bool isPendingSync;

  OfflineListState({
    this.id,
    required this.name,
    this.description,
    required this.praiseIds,
    required this.createdAt,
    required this.updatedAt,
    this.isPendingSync = true,
  });

  factory OfflineListState.fromJson(Map<String, dynamic> json) {
    return OfflineListState(
      id: json['id'] as String?,
      name: json['name'] as String,
      description: json['description'] as String?,
      praiseIds: (json['praise_ids'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
      isPendingSync: json['is_pending_sync'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'praise_ids': praiseIds,
        'created_at': createdAt,
        'updated_at': updatedAt,
        'is_pending_sync': isPendingSync,
      };

  OfflineListState copyWith({
    String? id,
    String? name,
    String? description,
    List<String>? praiseIds,
    String? createdAt,
    String? updatedAt,
    bool? isPendingSync,
  }) {
    return OfflineListState(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      praiseIds: praiseIds ?? this.praiseIds,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isPendingSync: isPendingSync ?? this.isPendingSync,
    );
  }
}
