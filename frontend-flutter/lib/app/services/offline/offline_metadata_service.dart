import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/hive_config.dart';
import '../../models/offline_material_metadata.dart';
import 'dart:convert';

/// Provider do serviço de metadados offline
final offlineMetadataServiceProvider = Provider<OfflineMetadataService>((ref) {
  return OfflineMetadataService();
});

/// Serviço para gerenciar metadados de materiais offline no Hive
class OfflineMetadataService {
  static const String _keyPrefix = 'offline_metadata_';
  static const String _allMetadataKey = 'offline_metadata_all';

  Box get _box => Hive.box(HiveConfig.offlineBoxName);

  /// Salva metadados de um material offline
  Future<void> saveMetadata(OfflineMaterialMetadata metadata) async {
    final key = '$_keyPrefix${metadata.materialId}';
    final json = jsonEncode(metadata.toJson());
    await _box.put(key, json);
    
    // Atualizar lista de todos os IDs
    final allIds = getAllMetadataIds();
    if (!allIds.contains(metadata.materialId)) {
      allIds.add(metadata.materialId);
      await _box.put(_allMetadataKey, jsonEncode(allIds));
    }
  }

  /// Busca metadados de um material por ID
  OfflineMaterialMetadata? getMetadata(String materialId) {
    final key = '$_keyPrefix$materialId';
    final json = _box.get(key);
    
    if (json == null) return null;
    
    try {
      final map = jsonDecode(json as String) as Map<String, dynamic>;
      return OfflineMaterialMetadata.fromJson(map);
    } catch (e) {
      return null;
    }
  }

  /// Busca todos os metadados
  List<OfflineMaterialMetadata> getAllMetadata() {
    final allIds = getAllMetadataIds();
    final metadataList = <OfflineMaterialMetadata>[];
    
    for (final materialId in allIds) {
      final metadata = getMetadata(materialId);
      if (metadata != null) {
        metadataList.add(metadata);
      }
    }
    
    return metadataList;
  }

  /// Busca metadados por praise ID
  List<OfflineMaterialMetadata> getMetadataByPraiseId(String praiseId) {
    return getAllMetadata()
        .where((metadata) => metadata.praiseId == praiseId)
        .toList();
  }

  /// Busca metadados mantidos offline (isKeptOffline = true)
  List<OfflineMaterialMetadata> getKeptOfflineMetadata() {
    return getAllMetadata()
        .where((metadata) => metadata.isKeptOffline)
        .toList();
  }

  /// Deleta metadados de um material
  Future<void> deleteMetadata(String materialId) async {
    final key = '$_keyPrefix$materialId';
    await _box.delete(key);
    
    // Remover da lista de IDs
    final allIds = getAllMetadataIds();
    allIds.remove(materialId);
    await _box.put(_allMetadataKey, jsonEncode(allIds));
  }

  /// Atualiza timestamp de último acesso
  Future<void> updateLastAccessed(String materialId) async {
    final metadata = getMetadata(materialId);
    if (metadata != null) {
      final updated = metadata.copyWith(lastAccessedAt: DateTime.now());
      await saveMetadata(updated);
    }
  }

  /// Marca material como mantido offline ou não
  Future<void> markAsKeptOffline(String materialId, bool kept) async {
    final metadata = getMetadata(materialId);
    if (metadata != null) {
      final updated = metadata.copyWith(isKeptOffline: kept);
      await saveMetadata(updated);
    }
  }

  /// Atualiza versão do material (hash e timestamp)
  Future<void> updateVersion(
    String materialId,
    String? hash,
    DateTime? timestamp,
  ) async {
    final metadata = getMetadata(materialId);
    if (metadata != null) {
      final updated = metadata.copyWith(
        versionHash: hash,
        versionTimestamp: timestamp,
      );
      await saveMetadata(updated);
    }
  }

  /// Marca material como antigo
  Future<void> markAsOld(
    String materialId,
    bool isOld,
    String? oldDescription,
  ) async {
    final metadata = getMetadata(materialId);
    if (metadata != null) {
      final updated = metadata.copyWith(
        isOld: isOld,
        oldDescription: oldDescription,
      );
      await saveMetadata(updated);
    }
  }

  /// Busca lista de todos os IDs de materiais offline
  List<String> getAllMetadataIds() {
    final json = _box.get(_allMetadataKey);
    if (json == null) return [];
    
    try {
      final list = jsonDecode(json as String) as List<dynamic>;
      return list.map((e) => e.toString()).toList();
    } catch (e) {
      return [];
    }
  }

  /// Limpa todos os metadados (útil para limpeza completa)
  Future<void> clearAllMetadata() async {
    final allIds = getAllMetadataIds();
    for (final materialId in allIds) {
      final key = '$_keyPrefix$materialId';
      await _box.delete(key);
    }
    await _box.delete(_allMetadataKey);
  }

  /// Conta total de materiais offline
  int getTotalCount() {
    return getAllMetadataIds().length;
  }

  /// Calcula tamanho total dos arquivos offline
  int getTotalSize() {
    return getAllMetadata()
        .fold(0, (sum, metadata) => sum + metadata.fileSize);
  }
}
