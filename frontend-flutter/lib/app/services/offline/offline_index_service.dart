import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/hive_config.dart';
import '../../models/offline_material_metadata.dart';
import 'offline_metadata_service.dart';
import 'dart:convert';

/// Provider do serviço de indexação offline
final offlineIndexServiceProvider = Provider<OfflineIndexService>((ref) {
  final metadataService = ref.read(offlineMetadataServiceProvider);
  return OfflineIndexService(metadataService);
});

/// Serviço para indexação de materiais offline para busca rápida (UC-149)
class OfflineIndexService {
  final OfflineMetadataService _metadataService;

  Box get _box => Hive.box(HiveConfig.offlineIndexBoxName);

  OfflineIndexService(this._metadataService);

  /// Reconstrói índices a partir dos metadados
  Future<void> rebuildIndexes() async {
    try {
      await _box.clear();
      
      final allMetadata = _metadataService.getAllMetadata();
      
      // Índices invertidos
      final nameIndex = <String, List<String>>{}; // nome -> [materialIds]
      final tagIndex = <String, List<String>>{}; // tagId -> [materialIds]
      final materialKindIndex = <String, List<String>>{}; // materialKindId -> [materialIds]
      final praiseIndex = <String, List<String>>{}; // praiseId -> [materialIds]
      
      for (final metadata in allMetadata) {
        // Índice por nome (busca parcial)
        final nameLower = metadata.fileName.toLowerCase();
        final words = nameLower.split(RegExp(r'\s+'));
        for (final word in words) {
          if (word.length >= 2) { // Ignorar palavras muito curtas
            if (!nameIndex.containsKey(word)) {
              nameIndex[word] = [];
            }
            if (!nameIndex[word]!.contains(metadata.materialId)) {
              nameIndex[word]!.add(metadata.materialId);
            }
          }
        }
        
        // Índice por material kind
        if (!materialKindIndex.containsKey(metadata.materialKindId)) {
          materialKindIndex[metadata.materialKindId] = [];
        }
        materialKindIndex[metadata.materialKindId]!.add(metadata.materialId);
        
        // Índice por praise
        if (!praiseIndex.containsKey(metadata.praiseId)) {
          praiseIndex[metadata.praiseId] = [];
        }
        praiseIndex[metadata.praiseId]!.add(metadata.materialId);
      }
      
      // Salvar índices
      await _box.put('name_index', jsonEncode(nameIndex));
      await _box.put('material_kind_index', jsonEncode(materialKindIndex));
      await _box.put('praise_index', jsonEncode(praiseIndex));
    } catch (e) {
      throw Exception('Erro ao reconstruir índices: $e');
    }
  }

  /// Busca materiais por nome (busca rápida offline)
  List<String> searchByName(String query) {
    try {
      final nameIndexJson = _box.get('name_index');
      if (nameIndexJson == null) return [];

      final nameIndex = jsonDecode(nameIndexJson as String) as Map<String, dynamic>;
      final queryLower = query.toLowerCase();
      final words = queryLower.split(RegExp(r'\s+'));
      
      Set<String>? resultIds;
      
      for (final word in words) {
        if (word.length < 2) continue;
        
        final matchingIds = <String>[];
        for (final entry in nameIndex.entries) {
          if (entry.key.contains(word)) {
            final ids = (entry.value as List).map((e) => e.toString()).toList();
            matchingIds.addAll(ids);
          }
        }
        
        if (resultIds == null) {
          resultIds = matchingIds.toSet();
        } else {
          resultIds = resultIds.intersection(matchingIds.toSet());
        }
      }
      
      return resultIds?.toList() ?? [];
    } catch (e) {
      return [];
    }
  }

  /// Busca materiais por material kind
  List<String> searchByMaterialKind(String materialKindId) {
    try {
      final indexJson = _box.get('material_kind_index');
      if (indexJson == null) return [];

      final index = jsonDecode(indexJson as String) as Map<String, dynamic>;
      final ids = index[materialKindId] as List?;
      return ids?.map((e) => e.toString()).toList() ?? [];
    } catch (e) {
      return [];
    }
  }

  /// Busca materiais por praise
  List<String> searchByPraise(String praiseId) {
    try {
      final indexJson = _box.get('praise_index');
      if (indexJson == null) return [];

      final index = jsonDecode(indexJson as String) as Map<String, dynamic>;
      final ids = index[praiseId] as List?;
      return ids?.map((e) => e.toString()).toList() ?? [];
    } catch (e) {
      return [];
    }
  }

  /// Busca combinada (nome E material kind E praise)
  List<String> searchCombined({
    String? nameQuery,
    String? materialKindId,
    String? praiseId,
  }) {
    final results = <String>[];
    
    if (nameQuery != null && nameQuery.isNotEmpty) {
      results.addAll(searchByName(nameQuery));
    }
    
    if (materialKindId != null) {
      final kindResults = searchByMaterialKind(materialKindId);
      if (results.isEmpty) {
        results.addAll(kindResults);
      } else {
        results.retainWhere((id) => kindResults.contains(id));
      }
    }
    
    if (praiseId != null) {
      final praiseResults = searchByPraise(praiseId);
      if (results.isEmpty) {
        results.addAll(praiseResults);
      } else {
        results.retainWhere((id) => praiseResults.contains(id));
      }
    }
    
    return results;
  }

  /// Limpa índices
  Future<void> clearIndexes() async {
    await _box.clear();
  }
}
