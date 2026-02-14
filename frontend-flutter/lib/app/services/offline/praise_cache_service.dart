import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../../core/config/hive_config.dart';
import '../../models/praise_model.dart';
import '../../models/praise_tag_model.dart';

/// Provider do serviço de cache de praises e tags
final praiseCacheServiceProvider = Provider<PraiseCacheService>((ref) {
  return PraiseCacheService();
});

/// Serviço para gerenciar cache de praises e tags no Hive (modo offline)
class PraiseCacheService {
  static const String _praisesKey = 'praises_all';
  static const String _tagsKey = 'tags_all';
  static const String _lastSyncKey = 'praises_last_sync';

  Box get _box => Hive.box(HiveConfig.cacheBoxName);

  /// Salva lista completa de praises no cache
  Future<void> saveAllPraises(List<PraiseResponse> praises) async {
    final jsonList = praises.map((p) => p.toJson()).toList();
    await _box.put(_praisesKey, jsonEncode(jsonList));
    await _box.put(_lastSyncKey, DateTime.now().toIso8601String());
  }

  /// Salva lista de tags no cache
  Future<void> saveAllTags(List<PraiseTagResponse> tags) async {
    final jsonList = tags.map((t) => t.toJson()).toList();
    await _box.put(_tagsKey, jsonEncode(jsonList));
  }

  /// Retorna praises do cache
  List<PraiseResponse> getCachedPraises() {
    final json = _box.get(_praisesKey);
    if (json == null) return [];
    try {
      final list = jsonDecode(json as String) as List<dynamic>;
      return list
          .map((e) => PraiseResponse.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      return [];
    }
  }

  /// Retorna tags do cache
  List<PraiseTagResponse> getCachedTags() {
    final json = _box.get(_tagsKey);
    if (json == null) return [];
    try {
      final list = jsonDecode(json as String) as List<dynamic>;
      return list
          .map((e) => PraiseTagResponse.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      return [];
    }
  }

  /// Retorna timestamp do último sync
  DateTime? getLastSyncAt() {
    final json = _box.get(_lastSyncKey);
    if (json == null) return null;
    try {
      return DateTime.tryParse(json as String);
    } catch (e) {
      return null;
    }
  }

  /// Verifica se há dados em cache
  bool hasCachedData() {
    return _box.containsKey(_praisesKey) && getCachedPraises().isNotEmpty;
  }

  /// Filtra e ordena praises do cache (para uso offline)
  List<PraiseResponse> filterAndSort(
    List<PraiseResponse> praises, {
    String? name,
    String? tagId,
    String sortBy = 'name',
    String sortDirection = 'asc',
    String noNumber = 'last',
    int skip = 0,
    int limit = 50,
  }) {
    var result = praises;

    // Filtro por nome
    if (name != null && name.isNotEmpty) {
      final lower = name.toLowerCase();
      result = result.where((p) => p.name.toLowerCase().contains(lower)).toList();
    }

    // Filtro por tag
    if (tagId != null && tagId.isNotEmpty) {
      result = result
          .where((p) => p.tags.any((t) => t.id == tagId))
          .toList();
    }

    // Ordenação
    result.sort((a, b) {
      final aNum = a.number;
      final bNum = b.number;
      final aHasNum = aNum != null;
      final bHasNum = bNum != null;

      if (sortBy == 'number') {
        if (!aHasNum && !bHasNum) return 0;
        if (!aHasNum) {
          if (noNumber == 'first') return -1;
          if (noNumber == 'last') return 1;
          return 0; // hide - não deveria chegar aqui
        }
        if (!bHasNum) {
          if (noNumber == 'first') return 1;
          if (noNumber == 'last') return -1;
          return 0;
        }
        final cmp = aNum.compareTo(bNum);
        return sortDirection == 'desc' ? -cmp : cmp;
      }

      // sortBy == 'name'
      final cmp = a.name.toLowerCase().compareTo(b.name.toLowerCase());
      return sortDirection == 'desc' ? -cmp : cmp;
    });

    // noNumber == 'hide' quando sort by number: remover praises sem número
    if (sortBy == 'number' && noNumber == 'hide') {
      result = result.where((p) => p.number != null).toList();
    }

    // Paginação
    final start = skip.clamp(0, result.length);
    if (start >= result.length) return [];
    final end = (start + limit).clamp(0, result.length);
    return result.sublist(start, end);
  }
}
